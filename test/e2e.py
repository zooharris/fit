"""End-to-end test of Tango Fitter in headless Chromium.

- Serves dist/index.html on localhost (a secure context, so the camera works).
- Chromium's fake camera supplies video; the pose model is replaced by the engine's simulated
  rider (window.__TF_FAKE_POSE), timed to the camera clock live and to the video clock in analysis.
- CDN libraries (JSZip, jsPDF) are served from local copies; the network is otherwise blocked.
Run: python3 test/e2e.py   (screenshots go to the folder given as the first argument, if any)
"""
import http.server, os, socketserver, sys, threading, time, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
SHOTS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'test', 'shots')
LIBS = os.environ.get('TANGO_LIBS', '/tmp/claude-0/-home-claude/2e12fe8d-055b-549a-9abc-e2c293f96ca3/scratchpad/libs')
os.makedirs(SHOTS, exist_ok=True)

FAKE_POSE = r"""
(() => {
  const sims = {};
  let live0 = null;
  window.__TF_FAKE_POSE = (kind, src, ts) => {
    const W = src.videoWidth || 640, H = src.videoHeight || 480;
    const key = W + 'x' + H;
    if (!sims[key]) {
      const k = 0.36 * H / 720;
      sims[key] = window.TF.simulateRider({ W, H, pxPerMm: k, bbPx: { x: W * 0.44, y: H * 0.75 }, seconds: 30, saddleOffsetMm: window.__SADDLE_OFFSET || 0, noisePx: 0.8 * H / 720, seed: 5 });
      window.__TF_SIM = sims[key];
    }
    const sim = sims[key];
    let t;
    if (kind === 'lite') { if (live0 == null) live0 = ts; t = (ts - live0) / 1000; }
    else t = ts / 1000;
    t = t % (sim.frames.length / sim.fps);
    const i = Math.min(sim.frames.length - 1, Math.round(t * sim.fps));
    return sim.frames[i].lm.map((p) => p.slice());
  };
})();
"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    os.chdir(DIST)
    httpd = socketserver.TCPServer(('127.0.0.1', 0), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    httpd = serve()
    port = httpd.server_address[1]
    base = f'http://127.0.0.1:{port}/index.html'
    errors, results = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 860}, device_scale_factor=1, permissions=['camera'], accept_downloads=True)
        ctx.add_init_script(FAKE_POSE)

        def route(r):
            u = r.request.url
            if 'jszip' in u:
                return r.fulfill(path=os.path.join(LIBS, 'jszip-3.10.1/package/dist/jszip.min.js'), content_type='application/javascript')
            if 'jspdf' in u:
                return r.fulfill(path=os.path.join(LIBS, 'jspdf-4.2.1/package/dist/jspdf.umd.min.js'), content_type='application/javascript')
            if u.startswith('http://127.0.0.1') or u.startswith('data:') or u.startswith('blob:'):
                return r.continue_()
            return r.fulfill(status=200, body='', content_type='text/css' if 'fonts' in u else 'text/plain')
        ctx.route('**/*', route)
        page = ctx.new_page()
        page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

        def shot(name):
            page.screenshot(path=os.path.join(SHOTS, f'{name}.png'), full_page=True)

        # Faster triggers for the test: start after 6 steady strokes, record 12 s.
        page.goto(base)
        page.evaluate("localStorage.setItem('tango.settings', JSON.stringify({startStrokes: 6, stopSeconds: 12, exportPrompt: true}))")
        page.goto(base)
        page.wait_for_selector('text=A precise bike fit')
        shot('01-welcome')

        # New file → rider
        page.click('#w-new')
        page.fill('#pt', 'Harris household')
        page.click('.sheet .btn.primary')
        page.wait_for_selector('#r-name')
        page.fill('#r-name', 'Todd')
        page.click('[data-bike="road"]')
        page.click('[data-goal="endurance"]')
        page.click('[data-hand="drops"]')
        page.select_option('#r-crank', '172.5')
        page.select_option('#r-wheel', '700x28')
        shot('02-rider')
        page.click('#rf button[type=submit]')
        page.wait_for_selector('text=Ready when you are')
        shot('03-home-empty')

        # Session: check-in with discomfort
        page.click('a[href="#/session/new"]')
        page.wait_for_selector('#ck-regions')
        page.click('.region[data-r="kneeFront"] [data-l="mild"]')
        shot('04-checkin')
        page.click('#ck-next')
        page.wait_for_selector('#su-go')
        shot('05-setup')
        page.click('#su-go')
        page.wait_for_selector('.capture #cstart:not([disabled])', timeout=20000)
        time.sleep(1.5)
        shot('06-capture-preview')
        page.click('#cstart')
        # Wait for recording, then for the good-capture result.
        page.wait_for_selector('.capture .pill.rec', timeout=40000)
        time.sleep(2)
        page.screenshot(path=os.path.join(SHOTS, '07-capture-recording.png'))
        page.wait_for_selector('#ccont:not([hidden])', timeout=40000)
        results['capture_status'] = page.inner_text('#cbig')
        page.click('#ccont')

        # Calibration taps at the simulated bike points.
        page.wait_for_selector('#cal-canvas')
        time.sleep(1.0)
        taps = page.evaluate("(() => { const s = window.__TF_SIM; return { taps: s.taps, W: s.width, H: s.height }; })()")
        box = page.locator('#cal-canvas').bounding_box()
        shot('08-calibrate')
        # The spindle tap must be on the frame shown; compute the spindle on that frame from the sim truth.
        t_shown = float(page.get_attribute('#cal-t', 'data-t'))
        spindle = page.evaluate(f"""(() => {{ const s = window.__TF_SIM; const i = Math.min(s.frames.length-1, Math.round({t_shown} * s.fps));
            const phi = s.truth[i].phi, p = s.params; return window.TF.toImage({{ x: p.crank*Math.cos(phi), y: p.crank*Math.sin(phi) }}, p.bbPx, p.facing, p.pxPerMm); }})()""")
        order = ['rearAxle', 'tyreTop', 'tyreBack', 'frontAxle', 'bb', 'spindle']
        for k in order:
            pt = spindle if k == 'spindle' else taps['taps'][k]
            x = box['x'] + pt['x'] / taps['W'] * box['width']
            y = box['y'] + pt['y'] / taps['H'] * box['height']
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x + 0.3, y)
            page.mouse.up()
            time.sleep(0.15)
        page.wait_for_selector('#cal-go', timeout=5000)
        results['calibration'] = page.inner_text('#cal-result')
        shot('09-calibrated')
        page.click('#cal-go')

        # Analysis → results
        page.wait_for_selector('text=Fit results', timeout=120000)
        time.sleep(1.5)
        # Export prompt appears after a session.
        if page.locator('.sheet').count():
            results['export_prompt'] = page.inner_text('.sheet h2')
            shot('10a-export-prompt')
            page.click('.sheet .btn:has-text("Not now")')
        time.sleep(0.8)
        shot('10-results')
        results['reco'] = page.inner_text('.reco .action')
        results['gauges'] = page.eval_on_selector_all('.gauge', 'els => els.map(e => e.querySelector(".name").textContent + ": " + e.querySelector(".val").textContent + " (" + e.querySelector(".top .tiny").textContent + ")")')
        results['notes'] = page.inner_text('.two') if page.locator('text=What you told us').count() else ''
        results['player_badge'] = page.inner_text('.player .badge')
        results['kops_desktop'] = page.inner_text('.gauge[data-metric="kops"] .val') + ' / ' + page.inner_text('.gauge[data-metric="kops"] .top .tiny')

        # Playback controls
        page.click('[data-j="tdc"]')
        time.sleep(0.4)
        page.click('#pl-snap')
        page.wait_for_selector('#pl-snaps img', timeout=8000)
        page.locator('.player').screenshot(path=os.path.join(SHOTS, '11-player.png'))

        # Report PDF
        with page.expect_download(timeout=30000) as dl:
            page.click('#rs-report')
        rep = dl.value
        results['report'] = rep.suggested_filename
        rep.save_as(os.path.join(SHOTS, rep.suggested_filename))

        # Export, then reopen in a fresh browser profile and merge.
        page.goto(base + '#/settings')
        page.wait_for_selector('#s-export')
        with page.expect_download(timeout=60000) as dl:
            page.click('#s-export')
        exp = dl.value
        tango_path = os.path.join(SHOTS, exp.suggested_filename)
        exp.save_as(tango_path)
        results['export'] = f'{exp.suggested_filename} {os.path.getsize(tango_path)} bytes'
        shot('12-settings')

        # Units switch: recommendation re-renders in inches.
        page.goto(base + '#/')
        page.click('.units-toggle [data-u="imperial"]')
        time.sleep(0.5)
        results['home_imperial'] = page.inner_text('.reco .action') if page.locator('.reco .action').count() else page.inner_text('main')[:200]
        page.click('.units-toggle [data-u="metric"]')
        shot('13-home')

        # Phone layout
        mob = ctx.new_page()
        mob.set_viewport_size({'width': 390, 'height': 844})
        mob.goto(base + '#/')
        time.sleep(1)
        mob.screenshot(path=os.path.join(SHOTS, '14-phone-home.png'), full_page=True)
        sid = page.evaluate("window.__TANGO.S.file.riders[0].sessions[0].id")
        mob.goto(base + f'#/session/{sid}')
        time.sleep(2)
        mob.screenshot(path=os.path.join(SHOTS, '15-phone-results.png'), full_page=True)
        results['kops_phone'] = mob.inner_text('.gauge[data-metric="kops"] .val') + ' / ' + mob.inner_text('.gauge[data-metric="kops"] .top .tiny')
        mob.close()

        # Fresh profile: open the exported file (cross-device round trip).
        ctx2 = b.new_context(viewport={'width': 1280, 'height': 860})
        ctx2.route('**/*', route)
        p2 = ctx2.new_page()
        p2.on('pageerror', lambda e: errors.append(f'pageerror(2): {e}'))
        p2.goto(base)
        p2.wait_for_selector('#w-open')
        with p2.expect_file_chooser() as fc:
            p2.click('#w-open')
        fc.value.set_files(tango_path)
        p2.wait_for_selector('text=Recent sessions', timeout=20000)
        sid2 = p2.evaluate("window.__TANGO.S.file.riders[0].sessions[0].id")
        p2.goto(base + f'#/session/{sid2}')
        p2.wait_for_selector('.player', timeout=20000)
        time.sleep(2)
        results['reopened_reco'] = p2.inner_text('.reco .action')
        results['reopened_badge'] = p2.inner_text('.player .badge')
        results['reopened_snapshots'] = p2.locator('#pl-snaps img').count()
        p2.screenshot(path=os.path.join(SHOTS, '16-reopened.png'), full_page=True)
        # Merge the same file again: nothing duplicated.
        p2.goto(base + '#/settings')
        p2.wait_for_selector('#s-open')
        with p2.expect_file_chooser() as fc:
            p2.click('#s-open')
        fc.value.set_files(tango_path)
        p2.wait_for_selector('.sheet')
        p2.click('.sheet .btn:has-text("Merge")')
        time.sleep(1.5)
        results['after_merge_sessions'] = p2.evaluate("window.__TANGO.S.file.riders.reduce((n, r) => n + r.sessions.length, 0)")
        ctx2.close()

        # Sample fit from the welcome screen (fresh profile).
        ctx3 = b.new_context(viewport={'width': 1280, 'height': 860})
        ctx3.route('**/*', route)
        p3 = ctx3.new_page()
        p3.on('pageerror', lambda e: errors.append(f'pageerror(3): {e}'))
        p3.goto(base)
        p3.click('#w-sample')
        p3.wait_for_selector('text=Fit results', timeout=20000)
        time.sleep(1.5)
        results['sample_reco'] = p3.inner_text('.reco .action')
        p3.screenshot(path=os.path.join(SHOTS, '17-sample.png'), full_page=True)
        p3.goto(base + '#/help')
        time.sleep(0.5)
        p3.screenshot(path=os.path.join(SHOTS, '18-help.png'), full_page=True)
        # Light theme
        p3.goto(base + '#/settings')
        p3.click('#s-theme [data-v="light"]')
        sid3 = p3.evaluate("window.__TANGO.S.file.riders[0].sessions[0].id")
        p3.goto(base + f'#/session/{sid3}')
        time.sleep(1.5)
        p3.screenshot(path=os.path.join(SHOTS, '19-sample-light.png'), full_page=True)
        ctx3.close()
        b.close()
    httpd.shutdown()
    print(json.dumps(results, indent=1))
    print('ERRORS:' if errors else 'No page errors.')
    for e in errors:
        print('  ', e)


if __name__ == '__main__':
    main()
