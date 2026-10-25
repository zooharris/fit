# Tango Fitter — how it works

Written 24 October 2026 at Beta 1. This is the reference for anyone (including a future Claude session) who needs to understand the app without reading the code: what it is, how it is built, how the measurement engine thinks, where Beta 1 departs from the implementation brief and why, and what still needs testing on a real bike.

The controlling spec is the **Tango Fitter – Implementation Brief (Draft 3)** (claude.ai doc). Where this document and the brief differ, the "Departures from the brief" section explains the change.

## What it is

A self-service bike-fit app in one HTML file. A rider films themselves pedalling on a trainer from the side; the app tracks their joints on the device, measures the standard fit angles, compares them with target ranges for their bike, riding goal and hand position, and recommends one adjustment at a time with a retest loop. Nothing leaves the device unless the rider exports a file.

Live at https://zooharris.github.io/fit/ (source: github.com/zooharris/fit). Works in Safari and Chrome on iPhone, iPad and Mac/Windows laptops; recording needs a camera and the https address.

## Build and deploy

- `src/` holds the parts; `python3 build.py` assembles them into **`dist/index.html`**, one self-contained file (CSS, engine, logo and app inline; the app icon is rendered to PNG and embedded). Copy it to the repo root as `index.html` to publish.
- Libraries load from CDNs at run time, as the brief specifies: MediaPipe Tasks Vision 1.1.1 (pose models from Google's model storage, cached in Cache Storage after the first download, so later runs work offline), JSZip 3.10.1 and jsPDF 4.2.1 (loaded only when exporting or making a report).
- GitHub Actions (`.github/workflows/deploy.yml`) runs the engine tests on every push to `main` and publishes `index.html` to GitHub Pages. Commits that touch only `docs/` or Markdown do not publish.

```
src/engine.js       pure measurement engine + TF_CONFIG (every tunable value) + simulated rider
src/logo.js         brand marks (full logo, mark, app icon, lockup)
src/styles.css      design tokens (VeloIQ base + Tango orange) and components
src/app-core.js     settings, IndexedDB, routing, sheets/toasts, voice and beeps, pose loader
src/app-file.js     .tango export / open / merge, sample fit
src/app-art.js      illustrations in the logo's style
src/app-screens.js  welcome, home, rider profile, history, settings, help
src/app-session.js  check-in, set-up, capture, calibration taps, analysis
src/app-results.js  results dashboard, playback with overlays, snapshots, PDF report
test/engine.test.mjs  22 engine tests (node --test)
test/e2e.py         full browser run in headless Chromium with a fake camera
```

## Design

Base tokens are VeloIQ's (navy `#0A1220`, surfaces, ink, status colours, Archivo, radii, the button rule: one orange primary per screen, bordered secondary, quiet text, red-outline destructive behind "are you sure?"), so the two apps look like a family. Tango orange `#FF6A1A` is the accent and the only warm colour; VeloIQ's teal marks bike reference points. Light, dark and match-device themes.

**Logo** (chosen 24 Oct 2026 from the candidate sheets: sheet 3, option B): a pictogram rider with orange joint rings and a measured hip angle on a light grey bike; "Tango" in ink, "Fitter" in orange. Drawn on the app's own rider model so the joints sit anatomically. Three forms: full (with the angle guides) for the welcome and report, the rider-on-bike mark for the header, and the mark on a navy tile for the app icon. Every illustration in the app uses the same drawing.

## The session flow

1. **Check-in.** Retest confirmation ("did you make the change?"), hand position, discomfort by region (none / mild / moderate / severe, and new / builds during rides / lasts after rides), numbness, recent injury. The gate (below) shows immediately.
2. **Set-up.** Four illustrated cards: trainer and level; camera 2.5–3 m away on the non-drive side, square to the bike; lens about level with the top of the wheels, phone level; clothing, light and sound.
3. **Capture** (full screen). Live lite-model skeleton, framing guide, joint checklist, phone-level reading (iOS asks permission on Start), resolution and frame rate. Start → spoken intro → start trigger (after N steady strokes by default; or seconds, or beeps) → recording (stop after N seconds by default, or strokes; hard cap 45 s) → quality check on the live frames (every needed joint seen on ≥80% of frames, ≥6 strokes). A bad capture is explained by voice and retried hands-free up to twice, then asks for a tap. Cadence is spoken once it settles, with advice if outside 70–100 rpm.
4. **Calibration taps** on a frozen frame chosen with the crank forward (◀ ▶ step frames): rear axle, top of rear tyre, back of rear tyre, front axle, bottom bracket, pedal spindle. Hold-to-magnify loupe. Results: scale from wheel vs crank (must agree within 4%), squareness (wheel width/height ≥ 0.97), bottom-bracket position in the frame, bike tilt. A retest within 6 hours can reuse the last session's taps after a visual "they line up" check. Taps can be skipped (angles only).
5. **Analysis.** The heavy model runs on every frame (30 per second of video) by seeking through the recording, with progress ("Analysing stroke 7 of 15"). Then the session is saved and the app offers to export.

## The measurement engine (`src/engine.js`)

- **Coordinates.** Landmarks are normalised; every angle is taken in pixels (frame aspect applied) so nothing is skewed. World frame: +x = the direction the rider faces, +y up.
- **Side and facing.** The near side is the one with higher landmark visibility; facing comes from hands-ahead-of-hips and toes-ahead-of-heels votes (or the axle order when calibrated).
- **Smoothing.** 3-frame median per landmark (5 frames clipped the knee's peak by ~2° at 30 fps).
- **Following the pedal.** At the calibration frame the spindle's position is recorded in the foot's own frame (heel→toe axis, in foot lengths). Every frame, the spindle is rebuilt from heel and toe and snapped to the crank circle; its angle about the bottom bracket gives the crank phase (0° forward, −90° bottom), unwrapped through time. Strokes run bottom to bottom. Without calibration the foot's lowest points mark the strokes.
- **Angles.** Knee extension/flexion (max/min of hip–knee–ankle per stroke), closed hip (min shoulder–hip–knee), back (hip→shoulder above horizontal, corrected for bike tilt), shoulder, elbow, wrist (elbow–wrist–index), ankle at the bottom of the stroke and ankle range. Extremes are refined with a parabola through the peak frame and its neighbours.
- **KOPS** is interpolated at the exact moment the crank passes level-forward (between the frames either side), then shifted from the knee joint centre to the front of the knee by `kopsKneeFrontOffsetMm` (30 mm). This took the stroke-to-stroke spread from ±5–10 mm to ±1–2 mm.
- **Confidence** per measurement: landmark visibility, share of frames the joints were present, and stroke-to-stroke spread (3° / 6°, 8 mm / 16 mm). Wrist is always at most medium. Low-confidence values are greyed and never drive advice.
- **Targets** (`TF_CONFIG.targets`) by bike type × goal × hand position, green bands from brief 8.1 with yellow margins (4–5°, 10° wrist, 15 mm KOPS); flexibility shifts hip and back ±5°.
- **Recommendations** follow the fitter's order and give only the first warranted change: saddle height (from knee extension, cross-checked with the ankle), then saddle fore/aft (from KOPS). Amounts come from a two-segment leg model using the rider's own measured thigh and shin lengths: bisection for the saddle movement (along the bottom-bracket-to-hip line) that brings knee extension to a point 25% into the green band and to its centre; the two give the range, rounded to 5 mm, capped at 20 mm a step. Reach/drop, bar width/hoods, cleats and crank length are listed as "coming in the next version" when their measurements are out of range.
- **Discomfort (brief §7).** Answers only focus (flagged regions' measurements lead the dashboard, with "often associated with" wording) and gate (severe, lasts after rides, numbness or recent injury → see a professional; suggestions marked "for discussion with a professional"). The app never says fit causes a symptom; when the associated measurements are in range it says the related part of the fit is unlikely to be the main factor and lists other common causes; when they are out of range in the other direction it says so and that any change is about the measurement, not the discomfort; sides of the knee say plainly that a front view is needed.

## The fit file (`.tango`)

A ZIP: `manifest.json` (format `tango-fit`, schema 1, name, dates, rider list); `riders/<id>/rider.json`; `riders/<id>/sessions/<id>/session.json` (profile and bike snapshot, discomfort, the clip with its calibration and every analysed frame's landmarks, the results snapshot, snapshot and report references); `…/clips/<id>.mp4|webm`, `…/snapshots/*.png`, `…/reports/*.pdf`. Any number of riders per file; one file open at a time; Full export by default, Lite (no videos) offered above 150 MB. Open replaces or merges (riders and sessions by id, newer session wins). Unknown fields are preserved. Results are always recomputed from the frames, so units and wording follow the device; a file from a browser that cannot play its video shows skeleton playback with every measurement intact.

## Departures from the brief (and why)

- **Camera height.** The brief said bottom-bracket height. With the lens there and the whole rider in a landscape frame, the bottom bracket sits mid-frame and the head is cut off. What keeps angles true is a level, square camera, not its height, so the guidance is "lens about level with the top of the wheels, phone level", the bottom bracket is expected 55–90% down the frame, and the phone's motion sensor shows a level reading.
- **Squareness threshold 0.97, not 0.95.** At 0.95 a 15° turn (ratio cos 15° = 0.966) passes, which would fail the brief's own acceptance test.
- **Six taps, not three.** Rear axle and front axle give bike level; top and back of the rear tyre give the second scale and the squareness check; the brief's bottom bracket and spindle complete it.
- **KOPS from the front of the knee.** The pose model's knee is the joint centre; without the 30 mm offset a neutral rider would be told to move the saddle forward. The offset is a named default to validate.
- **Hands-free retakes in Beta 1** happen by automatic retry (up to twice) rather than gestures; gesture and voice replies remain Beta 2 as the brief scopes them.
- **Live stroke counter** needs the foot to travel 3% of the frame height, so a still rider never counts.

## Verification

- `node --test test/engine.test.mjs` — 22 tests against a simulated rider built from forward kinematics: angles within 1–3° of truth, KOPS within 8 mm, mirrored side and facing, no-calibration path, the brief's saddle ±15 mm test (raise / lower 10–20 mm), a 15° camera turn flagged, discomfort wording rules (never "because" or "caused by"), gate rules, stroke counting, capture-quality messages, file merge and migration, sub-frame stability across 78–95 rpm.
- `python3 test/e2e.py` — headless Chromium with a fake camera: new file → rider → check-in → capture (WebM) → six taps → analysis → results → playback, snapshot → PDF report → Full export → reopen in a fresh browser profile → merge (no duplicates) → sample fit → phone and light layouts. No page errors.

## Still to verify on a real bike (needs Todd)

1. Real pose tracking on iPhone (Safari and Chrome) and the MacBook camera: framing checks, stroke counting at real cadence, "Good capture" on a well-lit set-up.
2. Voice and beeps through the whole capture without touching the phone (iPhone silent switch off).
3. Calibration taps on a real frame with the loupe; scale agreement under 4%.
4. Goniometer comparison on a static bike (brief §15: knee and hip within 3°).
5. Saddle 15 mm low and high on the bike, both detected with a sensible amount.
6. Analysis time for a 20 s clip on the iPhone (target under 90 s) and the first-run model download.
7. A file exported on the iPhone opened on the laptop, and the reverse.
8. KOPS offset (30 mm) and target bands against a professional fit.
