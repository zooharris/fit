"""Build Tango Fitter into one self-contained index.html.

Usage: python3 build.py            -> dist/index.html
The app icon is rendered from the logo SVG to PNG (with headless Chromium) and embedded,
so the output needs no other files. Libraries (pose model, JSZip, jsPDF) load from CDNs at
run time, as the brief specifies.
"""
import base64, json, os, re, subprocess, sys, datetime, urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
APP_PARTS = ['app-core.js', 'app-file.js', 'app-art.js', 'app-screens.js', 'app-session.js', 'app-results.js', 'app-boot.js']


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()


def node_eval(js):
    return subprocess.check_output(['node', '-e', js], cwd=ROOT, text=True)


def render_icon_png(svg, size):
    from playwright.sync_api import sync_playwright
    html = f'<html><body style="margin:0;background:transparent">{svg}</body></html>'
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': size, 'height': size})
        pg.set_content(html)
        png = pg.locator('svg').screenshot(omit_background=True)
        b.close()
    return png


def main():
    os.makedirs(DIST, exist_ok=True)
    version = re.search(r"version: '([^']+)'", read('engine.js')).group(1)
    icon_svg_180 = node_eval("process.stdout.write(require('./src/logo.js').logoIconSVG(180, 0))")  # iOS rounds the corners itself
    icon_svg_fav = node_eval("process.stdout.write(require('./src/logo.js').logoIconSVG(64))")
    icon_svg_512 = node_eval("process.stdout.write(require('./src/logo.js').logoIconSVG(512, 0))")
    png180 = render_icon_png(icon_svg_180, 180)
    png512 = render_icon_png(icon_svg_512, 512)
    touch = 'data:image/png;base64,' + base64.b64encode(png180).decode()
    favicon = 'data:image/svg+xml,' + urllib.parse.quote(icon_svg_fav)
    manifest = {
        'name': 'Tango Fitter', 'short_name': 'Tango Fitter', 'display': 'standalone', 'orientation': 'any',
        'background_color': '#0A1220', 'theme_color': '#0A1220', 'start_url': '.', 'scope': '.',
        'icons': [{'src': 'data:image/png;base64,' + base64.b64encode(png512).decode(), 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable'}],
    }
    manifest_url = 'data:application/manifest+json,' + urllib.parse.quote(json.dumps(manifest))
    app = '\n'.join(f'/* ---- {p} ---- */\n' + read(p) for p in APP_PARTS)
    built = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    out = read('index.template.html')
    for k, v in {'{{CSS}}': read('styles.css'), '{{ENGINE}}': read('engine.js'), '{{LOGO}}': read('logo.js'), '{{APP}}': app,
                 '{{FAVICON}}': favicon, '{{TOUCH_ICON}}': touch, '{{MANIFEST}}': manifest_url, '{{VERSION}}': version, '{{BUILT}}': built}.items():
        out = out.replace(k, v)
    with open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    with open(os.path.join(DIST, 'icon-512.png'), 'wb') as f:
        f.write(png512)
    print(f'dist/index.html  {len(out.encode()) / 1024:.0f} KB  (Tango Fitter {version})')


if __name__ == '__main__':
    sys.exit(main())
