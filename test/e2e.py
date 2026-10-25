"""End-to-end test of Tango Fitter 2.0 in headless Chromium.

- Serves dist/index.html on localhost (a secure context, so the camera works).
- Chromium's fake camera supplies video; the pose model is replaced by the engine's simulated rider
  (window.__TF_FAKE_POSE). It returns nobody until window.__TF_RIDER_ON is set, so the test can run
  "rider arrives later" and "rider already on" sessions. window.__TF_GESTURE = 'right' | 'left' raises
  that hand above the head in every frame (hands-free replies).
- CDN libraries (JSZip, jsPDF) are served from local copies; the network is otherwise blocked.
Run: python3 test/e2e.py [screenshot folder]
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
  window.__TF_SIM_FOR = (W, H) => {
    const off = window.__SADDLE_OFFSET || 0;
    const key = W + 'x' + H + ':' + off;
    if (!sims[key]) {
      const k = 0.36 * H / 720;
      sims[key] = window.TF.simulateRider({ W, H, pxPerMm: k, bbPx: { x: W * 0.44, y: H * 0.75 }, seconds: 30, saddleOffsetMm: off, noisePx: 0.8 * H / 720, seed: 5 });
    }
    return sims[key];
  };
  window.__TF_FAKE_POSE = (kind, src, ts) => {
    const W = src.videoWidth || src.width || 640, H = src.videoHeight || src.height || 480;
    const sim = window.__TF_SIM_FOR(W, H);
    window.__TF_SIM = sim;
    if (kind === 'lite' && !window.__TF_RIDER_ON) return null;
    let t;
    if (kind === 'lite') { if (live0 == null) live0 = ts; t = (ts - live0) / 1000; }
    else t = ts / 1000;
    t = t % (sim.frames.length / sim.fps);
    let i = Math.min(sim.frames.length - 1, Math.round(t * sim.fps));
    // A frozen frame (a canvas, not the video) shows the rider holding the crank level, as asked.
    if (!src.videoWidth) i = TF.nearestFrameIndex(sim.frames, sim.calT);
    const lm = sim.frames[i].lm.map((p) => p.slice());
    const g = window.__TF_GESTURE;
    if (g && kind === 'lite') { const w = g === 'right' ? 16 : 15; lm[w] = [lm[0][0] + 0.02, lm[0][1] - 0.06, 0.95]; }
    return lm;
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

    def route(r):
        u = r.request.url
        if 'jszip' in u:
            return r.fulfill(path=os.path.join(LIBS, 'jszip-3.10.1/package/dist/jszip.min.js'), content_type='application/javascript')
        if 'jspdf' in u:
            return r.fulfill(path=os.path.join(LIBS, 'jspdf-4.2.1/package/dist/jspdf.umd.min.js'), content_type='application/javascript')
        if u.startswith('http://127.0.0.1') or u.startswith('data:') or u.startswith('blob:'):
            return r.continue_()
        return r.fulfill(status=200, body='', content_type='text/css' if 'fonts' in u else 'text/plain')

    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])

        def new_page(ctx):
            pg = ctx.new_page()
            pg.on('console', lambda m: errors.append(f'console.{m.type}: {m.text} @ {m.location.get("url", "")} page {pg.url}') if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
            return pg

        def tap_marks(page, keys, sim_key='marks'):
            box = page.locator('.fit .frame').bounding_box()
            info = page.evaluate(f"(() => {{ const v = document.querySelector('.fit video'); const s = window.__TF_SIM_FOR(v.videoWidth, v.videoHeight); return {{ m: s.{sim_key}, W: s.width, H: s.height }}; }})()")
            for k in keys:
                pt = info['m'][k]
                x = box['x'] + pt['x'] / info['W'] * box['width']
                y = box['y'] + pt['y'] / info['H'] * box['height']
                page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 0.3, y); page.mouse.up()
                time.sleep(0.12)

        def ride_and_answer(page, gesture_for_second, shot_prefix):
            page.wait_for_selector('.fit #fx-rec', timeout=60000)
            time.sleep(1.5)
            page.screenshot(path=os.path.join(SHOTS, f'{shot_prefix}-recording.png'))
            page.wait_for_selector('.fit #fx-q:not([hidden])', timeout=60000)
            q = page.inner_text('.fit #fx-q p')
            page.screenshot(path=os.path.join(SHOTS, f'{shot_prefix}-question.png'))
            page.evaluate(f"window.__TF_GESTURE = '{gesture_for_second}'")
            page.wait_for_selector('.fit #fx-q', state='hidden', timeout=10000)
            page.evaluate("window.__TF_GESTURE = null")
            return q

        # ---------------- run (a): laptop, rider arrives later ----------------
        ctx = b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['camera'], accept_downloads=True)
        ctx.add_init_script(FAKE_POSE)
        ctx.route('**/*', route)
        page = new_page(ctx)
        page.goto(base)
        page.evaluate("localStorage.setItem('tango.settings', JSON.stringify({startStrokes: 6, stopSeconds: 12, exportPrompt: true}))")
        page.goto(base)
        page.wait_for_selector('.intro')
        page.screenshot(path=os.path.join(SHOTS, 'a01-intro.png'), full_page=True)
        page.click('#in-next'); page.wait_for_selector('text=How a fit goes')
        page.click('#in-next'); page.wait_for_selector('#in-done')
        page.click('#in-done')
        page.wait_for_selector('#w-new')
        page.click('#w-new'); page.fill('#pt', 'Harris household'); page.click('.sheet .btn.primary')
        page.wait_for_selector('#r-name')
        page.fill('#r-name', 'Todd')
        page.click('[data-bike="road"]'); page.click('[data-goal="endurance"]'); page.click('[data-hand="drops"]')
        page.click('#rf button[type=submit]')
        page.wait_for_selector('.start-fit')
        page.screenshot(path=os.path.join(SHOTS, 'a02-home-empty.png'), full_page=True)
        page.evaluate("window.__SADDLE_OFFSET = -20")
        page.click('.start-fit')
        page.wait_for_selector('#ck-regions')
        page.click('.region[data-r="kneeFront"] [data-l="mild"]')
        page.click('#ck-go')
        page.wait_for_selector('.fit #fx-mark', timeout=20000)
        time.sleep(1.2)
        page.screenshot(path=os.path.join(SHOTS, 'a03-placing.png'))
        results['a_lights'] = page.inner_text('.fit #fx-lights')
        results['a_rider_light_absent'] = 'Rider' not in results['a_lights']
        page.click('.fit #fx-mark')
        page.wait_for_selector('.fit #fx-markpill:not([hidden])')
        page.screenshot(path=os.path.join(SHOTS, 'a04-marking.png'))
        tap_marks(page, ['rearAxle', 'tyreTop', 'tyreBack', 'frontAxle', 'bb'])
        page.wait_for_selector('.fit #fx-refresh')
        page.screenshot(path=os.path.join(SHOTS, 'a05-marking-spindle.png'))
        tap_marks(page, ['spindle', 'saddleNose', 'barTop'])
        page.wait_for_selector('.fit #fx-result:not([hidden])')
        results['a_marked'] = page.inner_text('.fit #fx-result')
        page.screenshot(path=os.path.join(SHOTS, 'a06-marked.png'))
        page.click('.fit #fx-ready2')
        time.sleep(0.8)
        results['a_ride_status'] = page.inner_text('.fit #fx-status')
        page.screenshot(path=os.path.join(SHOTS, 'a07-waiting.png'))
        page.evaluate("window.__TF_RIDER_ON = true")
        results['a_second_q'] = ride_and_answer(page, 'right', 'a08')
        # second position records, then finishes
        page.wait_for_selector('.fit #fx-rec', timeout=60000)
        page.wait_for_selector('.fit', state='detached', timeout=90000)
        page.wait_for_selector('text=Fit results', timeout=180000)
        time.sleep(1)
        if page.locator('.sheet').count():
            page.click('.sheet .btn:has-text("Not now")')
        time.sleep(0.6)
        page.screenshot(path=os.path.join(SHOTS, 'a09-results.png'), full_page=True)
        results['a_reco'] = page.inner_text('.reco .action')
        sess = page.evaluate("(() => { const s = window.__TANGO.S.file.riders[0].sessions[0]; return { marks: Object.keys(s.marks || {}).length, bike: s.bikeMeasures, withRider: s.markedWithRider, second: !!s.secondClip, secondHand: s.secondClip && s.secondClip.hand, replies: s.replies, fit: s.clips[0].calibration.spindleFit }; })()")
        results['a_session'] = sess
        truth = page.evaluate("(() => { const v = window.__TF_SIM; return v.bikeTruth; })()")
        results['a_bike_vs_truth_mm'] = {k: round(sess['bike'][k] - truth[k], 1) for k in ['saddleHeight', 'saddleSetback', 'drop', 'reach']}

        # Retest: camera unmoved, saddle raised 10 mm; reuse the static marks.
        page.goto(base + '#/')
        page.wait_for_selector('.start-fit')
        page.screenshot(path=os.path.join(SHOTS, 'a10-home.png'), full_page=True)
        page.evaluate("window.__SADDLE_OFFSET = -10; window.__TF_RIDER_ON = false")
        page.click('a:has-text("Retest")')
        page.wait_for_selector('#ck-go')
        page.click('#ck-go')
        page.wait_for_selector('.fit #fx-ghost-yes', timeout=20000)
        time.sleep(0.8)
        page.screenshot(path=os.path.join(SHOTS, 'a11-ghosts.png'))
        page.click('.fit #fx-ghost-yes')
        page.wait_for_selector('.fit #fx-markpill:not([hidden])')
        results['a_retest_first_mark'] = page.inner_text('.fit #fx-markpill b')
        tap_marks(page, ['saddleNose', 'barTop'])
        page.wait_for_selector('.fit #fx-result:not([hidden])')
        page.click('.fit #fx-ready2')
        page.evaluate("window.__TF_RIDER_ON = true")
        ride_and_answer(page, 'left', 'a12')
        page.wait_for_selector('text=Fit results', timeout=180000)
        time.sleep(1)
        if page.locator('.sheet').count():
            page.click('.sheet .btn:has-text("Not now")')
        time.sleep(0.5)
        page.screenshot(path=os.path.join(SHOTS, 'a13-retest-results.png'), full_page=True)
        results['a_retest_reco'] = page.inner_text('.reco')
        results['a_retest_measured'] = page.evaluate("(() => { const ss = window.__TANGO.S.file.riders[0].sessions; return Math.round((ss[1].bikeMeasures.saddleHeight - ss[0].bikeMeasures.saddleHeight) * 10) / 10; })()")
        results['a_retest_replies'] = page.evaluate("window.__TANGO.S.file.riders[0].sessions[1].replies")
        # Part C: the results page, top to bottom.
        page.wait_for_selector('#rs-pos img', timeout=15000)
        results['c_order'] = page.evaluate("[...document.querySelectorAll('#change, #position, #retest, #gauges, #bike, #second, #playback, #quality')].map((e) => e.id)")
        results['c_expect'] = page.inner_text('.reco .expect')
        results['c_amount'] = page.inner_text('.reco .amount') if page.locator('.reco .amount').count() else ''
        results['c_retest'] = page.inner_text('#retest .delta')
        results['c_bike'] = page.inner_text('#bike .bike-list')
        results['c_second_on_retest'] = page.locator('#second').count()  # the retest said no to a second position
        results['c_export_line'] = page.inner_text('.export-line')
        page.click('#rs-pos'); time.sleep(0.4)
        results['c_playback_open'] = page.evaluate("document.querySelector('#playback').open")

        # Report and export, then reopen in a fresh profile.
        with page.expect_download(timeout=30000) as dl:
            page.click('#rs-report')
        results['report'] = dl.value.suggested_filename
        page.goto(base + '#/settings')
        page.wait_for_selector('details.group')
        page.screenshot(path=os.path.join(SHOTS, 'd01-settings.png'), full_page=True)
        results['d_groups_open_at_start'] = page.evaluate("[...document.querySelectorAll('details.group')].filter((d) => d.open).map((d) => d.dataset.g)")
        results['d_group_values'] = page.evaluate("[...document.querySelectorAll('details.group > summary')].map((x) => x.innerText.replace(/\\n/g, ' : '))")
        page.click('details.group[data-g="file"] > summary'); time.sleep(0.3)
        results['d_groups_open_after'] = page.evaluate("[...document.querySelectorAll('details.group')].filter((d) => d.open).map((d) => d.dataset.g)")
        page.wait_for_selector('#s-export')
        with page.expect_download(timeout=60000) as dl:
            page.click('#s-export')
        tango_path = os.path.join(SHOTS, dl.value.suggested_filename)
        dl.value.save_as(tango_path)
        results['export'] = f'{dl.value.suggested_filename} {os.path.getsize(tango_path)} bytes'
        page.goto(base + '#/sessions')
        page.wait_for_selector('h1:has-text("Sessions")')
        page.screenshot(path=os.path.join(SHOTS, 'a14-sessions.png'), full_page=True)
        # Part C2: compare the two sessions.
        page.click('#ss-select'); page.wait_for_selector('.select-bar')
        boxes = page.locator('input[data-id]')
        boxes.nth(0).check(); boxes.nth(1).check()
        page.click('#ss-compare')
        page.wait_for_selector('h1:has-text("Compare")')
        time.sleep(0.6)
        page.screenshot(path=os.path.join(SHOTS, 'c01-compare.png'), full_page=True)
        results['c_compare_knee'] = page.inner_text('table.cmp tr:has-text("Knee extension")')
        results['c_compare_bike'] = page.inner_text('table.cmp tr:has-text("Saddle height")')
        results['c_compare_drawn'] = page.evaluate("(() => { const c = document.querySelector('#cmp-shot'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let grey = 0, orange = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 240 && d[i+1] > 90 && d[i+1] < 120 && d[i+2] < 40) orange++; if (d[i] > 120 && d[i] < 175 && d[i+2] > d[i] + 10 && Math.abs(d[i] - d[i+1]) < 25) grey++; } return { orange: orange > 500, grey: grey > 200 }; })()")
        page.click('.section.btn-row a.btn >> nth=0')  # open the earlier session
        page.wait_for_selector('#second', timeout=20000)
        results['c_second'] = page.inner_text('#second .section-head h2')
        page.screenshot(path=os.path.join(SHOTS, 'c02-first-session-results.png'), full_page=True)
        ctx.close()

        ctx2 = b.new_context(viewport={'width': 1280, 'height': 860})
        ctx2.route('**/*', route)
        p2 = new_page(ctx2)
        p2.goto(base)
        p2.evaluate("localStorage.setItem('tango.settings', JSON.stringify({introSeen: true}))")
        p2.goto(base)
        p2.wait_for_selector('#w-open')
        with p2.expect_file_chooser() as fc:
            p2.click('#w-open')
        fc.value.set_files(tango_path)
        p2.wait_for_selector('text=Recent sessions', timeout=20000)
        results['reopened'] = p2.evaluate("(() => { const s = window.__TANGO.S.file.riders[0].sessions; return { n: s.length, bike: !!s[0].bikeMeasures, second: !!s[0].secondClip, schema: window.__TANGO.S.file.schema }; })()")
        # Part D2: delete one session from the list, behind "are you sure?".
        p2.goto(base + '#/sessions?select=1')
        p2.wait_for_selector('.select-bar')
        p2.locator('input[data-id]').nth(0).check()
        p2.click('#ss-delete')
        p2.wait_for_selector('.sheet')
        results['d_delete_asks'] = p2.inner_text('.sheet h2') if p2.locator('.sheet h2').count() else p2.inner_text('.sheet')
        p2.click('.sheet .btn.danger')
        p2.wait_for_function("window.__TANGO.S.file.riders[0].sessions.length === 1", timeout=10000)
        results['d_after_delete'] = p2.evaluate("window.__TANGO.S.file.riders[0].sessions.length")
        ctx2.close()

        # ---------------- run (b): phone landscape, rider already on ----------------
        ctx3 = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, has_touch=True, permissions=['camera'])
        ctx3.add_init_script(FAKE_POSE)
        ctx3.route('**/*', route)
        m = new_page(ctx3)
        m.goto(base)
        m.evaluate("localStorage.setItem('tango.settings', JSON.stringify({startStrokes: 6, stopSeconds: 12, exportPrompt: false, introSeen: true}))")
        m.goto(base)
        m.wait_for_selector('#w-new')
        m.click('#w-new'); m.fill('#pt', 'Helper test'); m.click('.sheet .btn.primary')
        m.wait_for_selector('#r-name'); m.fill('#r-name', 'Angie'); m.click('#rf button[type=submit]')
        m.wait_for_selector('.start-fit')
        m.evaluate("window.__TF_RIDER_ON = true; window.__SADDLE_OFFSET = 0")
        m.click('.start-fit'); m.wait_for_selector('#ck-go'); m.click('#ck-go')
        m.wait_for_selector('.fit #fx-mark', timeout=20000)
        m.wait_for_function("document.querySelector('.fit #fx-lights').innerText.includes('Rider')", timeout=10000)
        m.screenshot(path=os.path.join(SHOTS, 'b01-phone-placing-rider-on.png'))
        results['b_lights'] = m.inner_text('.fit #fx-lights')
        m.click('.fit #fx-mark')
        m.wait_for_selector('.fit #fx-markpill:not([hidden])')
        m.screenshot(path=os.path.join(SHOTS, 'b02-phone-marking.png'))
        tap_marks(m, ['rearAxle', 'tyreTop', 'tyreBack', 'frontAxle', 'bb'], 'marksWithRider')
        results['b_crank_line'] = m.evaluate("window.Sound ? '' : ''")
        tap_marks(m, ['spindle', 'saddleNose', 'barTop'], 'marksWithRider')
        m.wait_for_selector('.fit #fx-result:not([hidden])')
        m.screenshot(path=os.path.join(SHOTS, 'b03-phone-marked.png'))
        m.click('.fit #fx-ready2')
        time.sleep(0.6)
        results['b_ride_status'] = m.inner_text('.fit #fx-status')
        m.wait_for_selector('.fit #fx-rec', timeout=60000)
        time.sleep(1.2)
        m.screenshot(path=os.path.join(SHOTS, 'b04-phone-recording.png'))
        m.wait_for_selector('text=Fit results', timeout=180000)
        time.sleep(1)
        results['b_session'] = m.evaluate("(() => { const s = window.__TANGO.S.file.riders[0].sessions[0]; return { withRider: s.markedWithRider, spindleFoot: !!s.clips[0].calibration.spindleFoot, fit: s.clips[0].calibration.spindleFit && s.clips[0].calibration.spindleFit.source }; })()")
        m.screenshot(path=os.path.join(SHOTS, 'b05-phone-results.png'), full_page=True)
        m.set_viewport_size({'width': 390, 'height': 844})
        time.sleep(0.6)
        m.screenshot(path=os.path.join(SHOTS, 'b06-phone-portrait-results.png'), full_page=True)
        m.goto(base + '#/')
        time.sleep(0.8)
        m.screenshot(path=os.path.join(SHOTS, 'b07-phone-portrait-home.png'), full_page=True)
        m.goto(base + '#/settings'); m.wait_for_selector('details.group'); time.sleep(0.3)
        m.screenshot(path=os.path.join(SHOTS, 'b08-phone-portrait-settings.png'), full_page=True)
        # The capture screen held upright: contained video and the "turn sideways" nudge.
        m.goto(base + '#/session/new'); m.wait_for_selector('#ck-go'); m.click('#ck-go')
        m.wait_for_selector('.fit #fx-actions .btn.primary', timeout=20000); time.sleep(1)
        results['b_portrait_nudge'] = m.evaluate("!document.querySelector('.fit #fx-nudge').hidden")
        m.screenshot(path=os.path.join(SHOTS, 'b09-phone-portrait-placing.png'))
        m.click('.fit #fx-close'); time.sleep(0.4)
        ctx3.close()
        b.close()
    httpd.shutdown()
    print(json.dumps(results, indent=1))
    print('ERRORS:' if errors else 'No page errors.')
    for e in errors:
        print('  ', e)


if __name__ == '__main__':
    main()
