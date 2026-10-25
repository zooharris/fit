/* ==========================================================================
   Tango Fitter 2.0 — a fit session (brief Part B)
   Check-in → [full screen] place the camera → mark the bike → ride → check
   (→ second hand position) → analyse → save.
   The bike is the reference and the rider is optional until it is time to pedal:
   every step works whether the saddle is empty (the user is the rider) or a
   rider is already on (a helper is holding the phone). The app finds out which
   by looking, and only its words change.
   ========================================================================== */
const REGION_ORDER = C.discomfort.regions;
const LEVEL_LABELS = { none: 'None', mild: 'Mild', moderate: 'Moderate', severe: 'Severe' };
const PATTERN_LABELS = { new: 'New or occasional', builds: 'Builds during rides', persists: 'Lasts after rides' };

route('/session/new', async (main, { query }) => {
  const r = rider();
  if (!r) { go('#/rider/new'); return; }
  const retestOf = query.get('retest');
  const prev = retestOf ? findSession(retestOf) : lastSessionOf(r);
  if (!S.session || S.session.riderId !== r.id || S.session.retestOf !== (retestOf || null)) {
    S.session = {
      riderId: r.id, retestOf: retestOf || null, step: 'checkin', hand: r.profile.hands[0],
      discomfort: prev && prev.session && prev.session.discomfort ? JSON.parse(JSON.stringify(prev.session.discomfort)) : { regions: {}, numbness: false, recentInjury: false },
    };
  }
  const d = S.session;
  const step = () => ({ checkin: renderCheckin, analyse: renderAnalyse, failed: renderFailed }[d.step] || renderCheckin)(main, r, d);
  d.rerender = () => { main.innerHTML = ''; step(); };
  step();
}, { needsFile: true, nav: 'fit' });

function lastSessionOf(r) {
  const s = r.sessions.filter((x) => !x.sample).slice().sort((a, b) => (a.created < b.created ? 1 : -1))[0];
  return s ? { rider: r, session: s } : null;
}

/* ---------- check-in: one short screen ---------- */
function renderCheckin(main, r, d) {
  const hands = r.profile.hands;
  main.innerHTML = `
    <div class="page-head"><div><h1>${d.retestOf ? 'Retest' : 'Before you ride'}</h1><div class="sub">${d.retestOf ? 'Same as last time unless something has changed. The marks will show what changed on the bike.' : 'A few questions so the results focus on what matters to you.'}</div></div></div>
    <div class="stack">
      ${hands.length > 1 ? `<div class="panel stack"><div class="field"><span class="label">Hand position to record first</span><div class="chips" id="ck-hand">${hands.map((h) => `<button class="chip ${h === d.hand ? 'on' : ''}" data-h="${h}">${esc(TF.HAND_POSITIONS[h])}</button>`).join('')}</div>
        <span class="hint">After a good recording you can record ${esc(TF.HAND_POSITIONS[hands.find((h) => h !== d.hand)] || 'another position')} too, without getting off the bike. Saddle advice uses your main position (${esc(TF.HAND_POSITIONS[hands[0]])}).</span></div></div>` : ''}
      <div class="panel">
        <h2>Any discomfort when you ride?</h2>
        <p class="muted small" style="margin-top:4px">This points the results at the measurements most often associated with where you feel it. It doesn't assume the cause is your bike fit.</p>
        <div id="ck-regions"></div>
        <div class="stack tight" style="margin-top:10px">
          <label class="check"><input type="checkbox" id="ck-numb" ${d.discomfort.numbness ? 'checked' : ''}><span>Numbness or tingling (hands, feet or saddle area)</span></label>
          <label class="check"><input type="checkbox" id="ck-injury" ${d.discomfort.recentInjury ? 'checked' : ''}><span>A recent injury, surgery or medical treatment affecting riding</span></label>
        </div>
      </div>
      <div id="ck-gate"></div>
      ${!CAPS.canRecord ? `<div class="banner bad">${icon('alert')}<div class="grow"><b>This browser can't record.</b> ${!CAPS.secure ? 'The camera needs the https address of Tango Fitter.' : 'Use an up-to-date iPhone, iPad or laptop browser.'}</div></div>` : ''}
      <div class="btn-row"><button class="btn primary lg" id="ck-go" ${CAPS.canRecord ? '' : 'disabled'}>${icon('camera')}Set up the camera</button><a class="btn quiet" href="#/" id="ck-cancel">Cancel</a></div>
      <p class="small faint">Fitting yourself or helping a friend, it works the same way. Sound on: the app talks you through it.</p>
    </div>`;
  const paintRegions = () => {
    $('#ck-regions', main).innerHTML = REGION_ORDER.map((k) => {
      const a = d.discomfort.regions[k] || { level: 'none' };
      return `<div class="region" data-r="${k}"><div class="rhead"><b>${esc(TF.REGIONS[k].label)}</b>
        <div class="seg sm">${Object.entries(LEVEL_LABELS).map(([v, l]) => `<button data-l="${v}" class="${(a.level || 'none') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${a.level && a.level !== 'none' ? `<div class="seg sm">${Object.entries(PATTERN_LABELS).map(([v, l]) => `<button data-p="${v}" class="${a.pattern === v ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}</div>`;
    }).join('');
    $$('.region', main).forEach((row) => {
      const k = row.dataset.r;
      $$('[data-l]', row).forEach((b) => (b.onclick = () => { const cur = d.discomfort.regions[k] || {}; d.discomfort.regions[k] = { level: b.dataset.l, pattern: b.dataset.l === 'none' ? null : cur.pattern || 'builds' }; paintRegions(); paintGate(); }));
      $$('[data-p]', row).forEach((b) => (b.onclick = () => { d.discomfort.regions[k].pattern = b.dataset.p; paintRegions(); paintGate(); }));
    });
  };
  const paintGate = () => {
    const g = TF.discomfortGate(d.discomfort);
    $('#ck-gate', main).innerHTML = g.gated ? `<div class="banner warn">${icon('alert')}<div class="grow"><b>Please see a professional before changing your bike.</b> You mentioned ${esc(g.reasons.join(', '))}. A clinician or professional bike fitter should look at that first. You can still record and see your measurements; any suggestions will be marked as for discussion with a professional.</div></div>` : '';
  };
  paintRegions(); paintGate();
  $('#ck-numb', main).onchange = (e) => { d.discomfort.numbness = e.target.checked; paintGate(); };
  $('#ck-injury', main).onchange = (e) => { d.discomfort.recentInjury = e.target.checked; paintGate(); };
  $$('#ck-hand .chip', main).forEach((c) => (c.onclick = () => { d.hand = c.dataset.h; $$('#ck-hand .chip', main).forEach((x) => x.classList.toggle('on', x === c)); }));
  $('#ck-cancel', main).onclick = () => { S.session = null; };
  $('#ck-go', main).onclick = async () => {
    // This tap unlocks sound and asks for the motion sensor (both need a tap on iOS).
    Sound.unlock();
    await requestMotion();
    const res = await runFit(r, d);
    if (res) { d.capture = res; d.step = 'analyse'; d.rerender(); }
  };
}

async function requestMotion() {
  try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission(); } catch { /* declined: the Level check shows "check by eye" */ }
}

function levelFromOrientation(e, backCamera) {
  if (e.beta == null || e.gamma == null) return null;
  const R = Math.PI / 180, b = e.beta * R, g = e.gamma * R;
  const up = { x: -Math.sin(g) * Math.cos(b), y: Math.sin(b), z: Math.cos(g) * Math.cos(b) };
  const pitch = Math.asin(Math.max(-1, Math.min(1, backCamera ? -up.z : up.z))) / R; // optical axis above (+) or below (−) level
  // Roll: how far gravity, seen in the screen's plane, is from the nearest screen edge. Independent of which way
  // round the phone is held (either landscape is fine; the Landscape light covers portrait).
  let theta = Math.atan2(up.y, up.x) / R; // angle of "up" in the device's x–y plane
  let roll = ((theta % 90) + 90) % 90; if (roll > 45) roll -= 90;
  if (Math.hypot(up.x, up.y) < 0.2) roll = 0; // phone lying flat: no meaningful roll
  return { pitch, roll };
}

/* ---------- hands-free replies: voice (where the browser has it) ---------- */
const Listener = {
  rec: null, active: false, onWord: null,
  available() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
  start(words, onWord) {
    if (!Settings.v.voiceReplies || !this.available()) return false;
    this.stop();
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    try {
      const rec = new R(); rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
      rec.onresult = (ev) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript.toLowerCase();
          const w = words.find((x) => new RegExp(`\\b${x}\\b`).test(t));
          if (w && this.onWord) { const f = this.onWord; this.stop(); f(w); return; }
        }
      };
      rec.onend = () => { if (this.active) { try { rec.start(); } catch { /* restarting too fast */ } } };
      rec.onerror = () => {};
      this.rec = rec; this.active = true; this.onWord = onWord;
      rec.start();
      return true;
    } catch { this.active = false; return false; }
  },
  stop() { this.active = false; this.onWord = null; if (this.rec) { try { this.rec.abort(); } catch { /* ignore */ } this.rec = null; } },
};

/* ---------- the full-screen fit: place → mark → ride → check ---------- */
const MARK_KEYS = TF.BIKE_MARKS.map((m) => m.key);
const STATIC_MARKS = ['rearAxle', 'tyreTop', 'tyreBack', 'frontAxle', 'bb', 'spindle']; // reused on a retest when the camera has not moved

function previousMarks(r, W, H) {
  const cutoff = Date.now() - C.calibration.reuseMaxHours * 3600e3;
  const s = r.sessions.filter((x) => !x.sample && x.marks && MARK_KEYS.every((k) => x.marks[k]) && Date.parse(x.created) > cutoff)
    .sort((a, b) => (a.created < b.created ? 1 : -1))[0];
  if (!s) return null;
  const c = s.clips[0];
  if (c && (c.width !== W || c.height !== H)) return null;
  return { session: s, marks: s.marks };
}

/**
 * runFit(rider, draft) → Promise<{ clips: [clip…], cal, marks, markedWithRider, replies } | null>
 * States: placing → marking → marked → waiting → counting | beeping → recording → checking → question → … → done.
 */
function runFit(r, d) {
  return new Promise((resolve) => {
    const T = C.triggers, F = C.framing, V = Settings.v, K = C.camera;
    const ui = el(`<div class="fit" role="dialog" aria-label="Camera">
      <div class="frame"><video playsinline muted autoplay></video><canvas class="still" hidden></canvas><div class="silwrap"></div><canvas class="ov"></canvas><div class="bigcount" hidden></div><div class="loupe" hidden><canvas width="264" height="264"></canvas></div></div>
      <div class="corner tl"><button class="pill btn-pill" id="fx-close">${icon('x')}Close</button><div class="lights" id="fx-lights"></div></div>
      <div class="markpill" id="fx-markpill" hidden></div>
      <div class="corner tr fadeable"><button class="pill btn-pill" id="fx-flip" title="Mirror the outline">${icon('flip')}Flip</button><button class="pill btn-pill" id="fx-cam" hidden>${icon('camera')}Camera</button><button class="pill btn-pill" id="fx-torch" hidden>Light</button><button class="pill btn-pill" id="fx-sound" hidden>${icon('volume')}Tap for sound</button></div>
      <div class="corner bl fadeable" id="fx-trig" hidden></div>
      <div class="status" id="fx-status"><span id="fx-big"></span><span id="fx-small"></span></div>
      <div class="corner br" id="fx-actions"></div>
      <div class="result-card" id="fx-result" hidden></div>
      <div class="question" id="fx-q" hidden></div>
      <div class="nudge" id="fx-nudge" hidden>${icon('refresh')}Turn your phone sideways for a bigger view</div>
    </div>`);
    document.body.appendChild(ui);
    document.body.style.overflow = 'hidden';
    $$('.toasts .toast').forEach((t) => t.remove());
    const $u = (sel) => $(sel, ui);
    const frame = $u('.frame'), video = $u('video'), still = $u('canvas.still'), ov = $u('canvas.ov'), silwrap = $u('.silwrap'), bigcount = $u('.bigcount');
    const ctx = ov.getContext('2d');
    const cap = {
      state: 'placing', stream: null, det: null, raf: 0, lastDetect: 0, lm: null, side: null, W: 0, H: 0,
      flip: !!V.silhouetteFlip, level: null, luma: NaN, lastLuma: 0, rider: false, riderSince: null, riderSeenOnce: false, cuts: { headCut: false, feetCut: false },
      marks: {}, markIdx: 0, frozenLm: null, cal: null, markedWithRider: false, ghosts: null, prevMarks: null,
      sc: new TF.StrokeCounter(), framingOkSince: null, framingBadSince: null, issueSince: null, saidIssue: {},
      recorder: null, chunks: [], recStart: 0, recFrames: [], recStrokes: 0, countStrokes: 0, tries: 0, sayCadence: true,
      hand: d.hand, clips: [], replies: [], question: null, gestureSince: { right: null, left: null },
      wakeLock: null, closed: false, timers: [], fadeTimer: 0, mime: '',
    };
    const later = (fn, ms) => { const id = setTimeout(fn, ms); cap.timers.push(id); return id; };
    const status = (big, small) => { $u('#fx-big').textContent = big || ''; $u('#fx-small').textContent = small || ''; $u('#fx-status').hidden = !big && !small; };
    const actions = (html) => { $u('#fx-actions').innerHTML = html || ''; };
    const riding = () => ['waiting', 'counting', 'beeping', 'recording'].includes(cap.state);
    const otherHand = () => r.profile.hands.find((h) => h !== d.hand && !cap.clips.some((c) => c.hand === h));

    /* ----- layout: the video frame, contained, with the overlays sized to it ----- */
    function layout() {
      const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
      const sw = window.innerWidth, sh = window.innerHeight;
      const s = Math.min(sw / vw, sh / vh);
      const w = vw * s, h = vh * s;
      Object.assign(frame.style, { width: `${w}px`, height: `${h}px`, left: `${(sw - w) / 2}px`, top: `${(sh - h) / 2}px` });
      const dpr = window.devicePixelRatio || 1;
      ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr);
      if (cap.W !== vw || cap.H !== vh) { cap.W = vw; cap.H = vh; still.width = vw; still.height = vh; drawSilhouette(); }
      const nudge = $u('#fx-nudge');
      nudge.hidden = !(sh > sw);
      // Held upright: the nudge sits in the letterbox just above the picture, clear of the lights.
      if (!nudge.hidden) nudge.style.top = `${Math.max(0, (sh - h) / 2 - 52)}px`;
    }
    function drawSilhouette() {
      if (!cap.W) return;
      silwrap.innerHTML = cap.state === 'placing' ? silhouetteSVG(cap.W, cap.H, cap.flip, cap.ghosts) : '';
    }
    const toCanvas = (p) => { const k = ov.width / cap.W; return { x: p.x * k, y: p.y * k }; };
    const lmPx = (lm, i) => ({ x: lm[i][0] * cap.W, y: lm[i][1] * cap.H });

    /* ----- camera ----- */
    async function openCamera() {
      if (cap.stream) cap.stream.getTracks().forEach((t) => t.stop());
      const cons = { audio: false, video: { width: { ideal: C.capture.idealWidth }, height: { ideal: C.capture.idealHeight }, frameRate: { ideal: C.capture.idealFps } } };
      if (V.cameraId) cons.video.deviceId = { exact: V.cameraId }; else cons.video.facingMode = { ideal: V.cameraFacing };
      try { cap.stream = await navigator.mediaDevices.getUserMedia(cons); }
      catch (e) {
        if (V.cameraId) { Settings.set('cameraId', ''); return openCamera(); }
        status('Camera not available', e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it for this site in your browser settings, then try again.' : (e.message || String(e)));
        return false;
      }
      video.srcObject = cap.stream;
      await video.play().catch(() => {});
      await new Promise((res) => (video.readyState >= 2 ? res() : video.addEventListener('loadeddata', res, { once: true })));
      layout();
      const track = cap.stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      $u('#fx-torch').hidden = !caps.torch;
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput');
      $u('#fx-cam').hidden = devs.length < 2;
      return true;
    }

    async function init() {
      status('Starting the camera…');
      if (!(await openCamera())) return;
      window.addEventListener('resize', layout);
      window.addEventListener('deviceorientation', onOrient);
      try { cap.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* not supported */ }
      if (Sound.ctx && Sound.ctx.state === 'suspended') $u('#fx-sound').hidden = false;
      cap.prevMarks = previousMarks(r, cap.W, cap.H);
      enterPlacing(true);
      loop();
      // The tracker loads in the background; placing needs no rider.
      try { cap.det = await loadPose('lite', () => {}); } catch (e) { console.warn('tracker', e); toast(`The tracker could not load: ${esc(e.message)} Check the internet connection.`, 6000); }
    }

    /* ----- lights ----- */
    function onOrient(e) { const lv = levelFromOrientation(e, V.cameraFacing !== 'user'); if (lv) cap.level = lv; }
    function paintLights() {
      const items = [];
      const tol = K.levelToleranceDeg;
      if (cap.level) {
        const ok = Math.abs(cap.level.pitch) <= tol && Math.abs(cap.level.roll) <= tol;
        const hint = ok ? '' : Math.abs(cap.level.pitch) > Math.abs(cap.level.roll) ? ` · tilted ${Math.round(Math.abs(cap.level.pitch))}° ${cap.level.pitch > 0 ? 'up' : 'down'}` : ` · rotated ${Math.round(Math.abs(cap.level.roll))}°`;
        items.push([ok ? 'ok' : 'warn', `Level${hint}`]);
      } else items.push(['unk', 'Level · check by eye']);
      items.push([cap.W > cap.H ? 'ok' : 'warn', 'Landscape']);
      $u('#fx-lights').hidden = cap.state !== 'placing';
      if (Number.isFinite(cap.luma)) items.push([cap.luma >= K.lightMin ? 'ok' : 'warn', cap.luma >= K.lightMin ? 'Light' : 'Light · too dark']);
      if (cap.rider && !riding()) items.push([cap.cuts.headCut || cap.cuts.feetCut ? 'warn' : 'ok', cap.cuts.feetCut ? 'Rider · feet cut off' : cap.cuts.headCut ? 'Rider · head cut off' : 'Rider in frame']);
      $u('#fx-lights').innerHTML = items.map(([c, t]) => `<span class="light ${c}"><i></i>${esc(t)}</span>`).join('');
    }
    function measureLight() {
      try {
        const c = measureLight.c || (measureLight.c = document.createElement('canvas'));
        c.width = 48; c.height = 27;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(video, 0, 0, 48, 27);
        const px = g.getImageData(0, 0, 48, 27).data;
        let sum = 0; for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        cap.luma = sum / (px.length / 4) / 255;
      } catch { /* a cross-origin or not-ready frame */ }
    }

    /* ----- one loop: presence at 2 fps while setting up, full rate while riding ----- */
    function loop() {
      if (cap.closed) return;
      cap.raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - cap.lastLuma > 500 && (cap.state === 'placing' || cap.state === 'marking' || cap.state === 'marked')) { cap.lastLuma = now; measureLight(); paintLights(); }
      if (!cap.det || video.readyState < 2) return;
      const fast = riding() || cap.state === 'question' || cap.state === 'checking';
      if (now - cap.lastDetect < 1000 / (fast ? C.capture.liveDetectFps : C.presence.checkFps)) return;
      cap.lastDetect = now;
      let lm = null;
      try { lm = cap.det.detect(video, now); } catch (e) { console.warn(e); }
      cap.lm = lm;
      const on = TF.riderPresent(lm, presenceMarks(), cap.W, cap.H);
      if (on && !cap.rider) { cap.riderSince = now; }
      cap.rider = on;
      const side = lm ? (cap.side || TF.framingCheck(lm).side) : 'left';
      const fc = TF.framingCheck(lm, side);
      cap.cuts = { headCut: !!fc.headCut, feetCut: !!fc.feetCut };
      if (cap.state === 'placing' || cap.state === 'marking' || cap.state === 'marked') { if (cap.state === 'placing') drawSkeleton(on ? lm : null, side); return; }
      if (lm && fc.ok && !cap.side) cap.side = fc.side;
      drawSkeleton(lm, side);
      // Strokes from the camera-side foot.
      let ev = null;
      if (lm) { const toe = lm[TF.LM[side].toe]; if (toe[2] >= 0.4) ev = cap.sc.push(now / 1000, toe[1]); }
      if (cap.state === 'recording') { cap.recFrames.push({ t: (now - cap.recStart) / 1000, lm }); if (ev) { cap.recStrokes++; Sound.beep('tick'); } }
      if (fc.ok) { cap.framingOkSince = cap.framingOkSince || now; cap.framingBadSince = null; } else { cap.framingBadSince = cap.framingBadSince || now; cap.framingOkSince = null; }
      gestures(lm, now);
      tick(now, fc, ev);
    }

    function drawSkeleton(lm, side) {
      ctx.clearRect(0, 0, ov.width, ov.height);
      if (cap.state === 'marking' || cap.state === 'marked') { paintMarks(); return; }
      if (!lm) return;
      const idx = TF.LM[side], dpr = window.devicePixelRatio || 1;
      const P = (n) => toCanvas(lmPx(lm, idx[n]));
      const seen = (n) => lm[idx[n]][2] >= F.visibilityThreshold;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,106,26,.95)'; ctx.lineWidth = 4 * dpr;
      for (const [a, b] of [['shoulder', 'elbow'], ['elbow', 'wrist'], ['shoulder', 'hip'], ['hip', 'knee'], ['knee', 'ankle'], ['ankle', 'heel'], ['heel', 'toe'], ['ankle', 'toe']]) {
        if (!seen(a) || !seen(b)) continue; const p = P(a), q = P(b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      for (const n of TF.REQUIRED_JOINTS) { const p = P(n); ctx.beginPath(); ctx.arc(p.x, p.y, 6 * dpr, 0, 7); ctx.fillStyle = seen(n) ? '#fff' : 'rgba(240,80,110,.95)'; ctx.fill(); }
    }

    /* ----- placing ----- */
    function enterPlacing(first) {
      cap.state = 'placing'; ui.classList.remove('faded');
      still.hidden = true; video.hidden = false; $u('#fx-markpill').hidden = true; $u('#fx-result').hidden = true; $u('#fx-trig').hidden = true; $u('#fx-q').hidden = true; bigcount.hidden = true;
      drawSilhouette(); paintLights();
      const hasMarks = MARK_KEYS.every((k) => cap.marks[k]);
      if (cap.prevMarks && !hasMarks && !cap.ghostsDismissed) {
        cap.ghosts = Object.fromEntries(STATIC_MARKS.map((k) => [k, cap.prevMarks.marks[k]]));
        drawSilhouette();
        status('Camera not moved since last time?', 'If the teal rings sit on the axles, the tyre and the bottom bracket, they line up.');
        actions(`<button class="btn" id="fx-ghost-no">Mark again</button><button class="btn primary" id="fx-ghost-yes">They line up</button>`);
        $u('#fx-ghost-yes').onclick = () => {
          cap.marks = JSON.parse(JSON.stringify(cap.ghosts)); cap.ghosts = null; cap.reused = true;
          enterMarking();
        };
        $u('#fx-ghost-no').onclick = () => { cap.ghosts = null; cap.ghostsDismissed = true; enterPlacing(); };
      } else {
        status('Line the wheels up with the outline', 'Level and bright, then mark the bike.');
        actions(`${hasMarks ? '<button class="btn" id="fx-remark">Mark again</button><button class="btn primary" id="fx-ready">Ready to ride</button>' : '<button class="btn primary" id="fx-mark">Mark the bike</button>'}`);
        const m = $u('#fx-mark'); if (m) m.onclick = () => { cap.marks = {}; enterMarking(); };
        const rr = $u('#fx-remark'); if (rr) rr.onclick = () => { cap.marks = {}; cap.cal = null; enterMarking(); };
        const rd = $u('#fx-ready'); if (rd) rd.onclick = onReady;
      }
      if (first) Sound.say('Line the wheels up with the outline. Level and bright. Then tap Mark the bike.');
    }

    /* ----- marking ----- */
    function freeze() {
      const g = still.getContext('2d'); g.drawImage(video, 0, 0, cap.W, cap.H);
      // The rider is read off the frozen frame itself (not the last live reading, up to half a second old), so a
      // spindle mark made with the rider on uses the heel and toe exactly where they were in the picture marked.
      let lm = null;
      if (cap.det) { try { lm = cap.det.detect(still, performance.now()); } catch (e) { console.warn(e); } }
      cap.frozenLm = lm ? lm.map((p) => p.slice()) : (cap.lm ? cap.lm.map((p) => p.slice()) : null);
      cap.frozenRider = cap.det ? TF.riderPresent(cap.frozenLm, presenceMarks(), cap.W, cap.H) : cap.rider;
      still.hidden = false; video.hidden = true;
    }
    // The bike's span for the presence check: the marks once there are enough, else the outline the bike was lined up with.
    function presenceMarks() {
      if (Object.keys(cap.marks).length >= 5) return cap.marks;
      if (!cap.W) return null;
      const g = silhouetteGeometry(cap.W, cap.H, cap.flip), b = BRAND.bike;
      return { rearAxle: g.map(b.rear), frontAxle: g.map(b.front), bb: g.map(b.bb) };
    }
    function enterMarking() {
      cap.state = 'marking'; cap.ghosts = null; drawSilhouette();
      freeze();
      cap.markIdx = MARK_KEYS.findIndex((k) => !cap.marks[k]); if (cap.markIdx < 0) cap.markIdx = MARK_KEYS.length;
      $u('#fx-result').hidden = true;
      paintMarkPrompt(); paintMarks();
      status('', '');
      if (cap.reused) Sound.say('Now mark the saddle nose and the top of the hood.');
      else if (cap.markIdx === 0) Sound.say('Tap the centre of the rear wheel. Hold your finger down to see a magnifier.');
    }
    function paintMarkPrompt() {
      const pill = $u('#fx-markpill');
      if (cap.state !== 'marking') { pill.hidden = true; return; }
      const cur = TF.BIKE_MARKS[cap.markIdx];
      pill.hidden = false;
      // Keep the prompt away from the point being marked: it goes to the side the point is not on.
      if (cur && ART.pts[cur.key]) {
        const g = silhouetteGeometry(cap.W, cap.H, cap.flip), p = g.map(ART.pts[cur.key]);
        pill.classList.toggle('right', p.x / cap.W < 0.5);
      }
      pill.innerHTML = cur
        ? `${riderSVG({ rider: false, highlight: cur.key, label: cur.label })}<div><b>${cap.markIdx + 1} of ${MARK_KEYS.length}: ${esc(cur.label)}</b><span>${esc(cur.help)}</span></div>`
        : '';
      const spindleNext = cur && cur.key === 'spindle';
      actions(`<button class="btn" id="fx-undo">${icon('undo')}Undo</button>${spindleNext ? `<button class="btn" id="fx-refresh">${icon('refresh')}Refresh frame</button>` : ''}<button class="btn quiet" id="fx-back">Back</button>`);
      $u('#fx-undo').onclick = undoMark;
      $u('#fx-back').onclick = () => { cap.marks = {}; cap.reused = false; enterPlacing(); };
      const rf = $u('#fx-refresh'); if (rf) rf.onclick = () => { freeze(); paintMarks(); toast('New frame taken.', 1500); };
      if (spindleNext && !cap.saidCrank) {
        cap.saidCrank = true;
        Sound.say(cap.rider || cap.frozenRider ? 'Ask your rider to set the near crank level, pointing forward, and hold still for a moment. Then tap Refresh frame.' : 'Set the near crank level, pointing forward. Then tap Refresh frame.');
      }
    }
    function paintMarks() {
      ctx.clearRect(0, 0, ov.width, ov.height);
      const dpr = window.devicePixelRatio || 1, R = 6 * dpr;
      for (const k of MARK_KEYS) {
        const p = cap.marks[k]; if (!p) continue;
        const q = toCanvas(p);
        ctx.fillStyle = '#FF6A1A'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.arc(q.x, q.y, R, 0, 7); ctx.fill(); ctx.stroke();
      }
      const m = cap.marks;
      if (m.bb && m.spindle) { const a = toCanvas(m.bb), b = toCanvas(m.spindle); ctx.strokeStyle = 'rgba(32,214,181,.95)'; ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      if (m.rearAxle && m.tyreTop) { const a = toCanvas(m.rearAxle), rr = Math.abs(toCanvas(m.tyreTop).y - a.y); ctx.strokeStyle = 'rgba(32,214,181,.7)'; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.arc(a.x, a.y, rr, 0, 7); ctx.stroke(); }
    }
    function undoMark() {
      const done = MARK_KEYS.filter((k) => cap.marks[k]); if (!done.length) return;
      delete cap.marks[done[done.length - 1]];
      cap.markIdx = MARK_KEYS.findIndex((k) => !cap.marks[k]);
      cap.state = 'marking'; $u('#fx-result').hidden = true; paintMarkPrompt(); paintMarks();
    }
    // Pointer: press shows the magnifier, slide, release places the mark.
    const loupe = $u('.loupe'), lctx = $('canvas', loupe).getContext('2d');
    const toVideo = (e) => { const b = frame.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * cap.W, y: (e.clientY - b.top) / b.height * cap.H, bx: e.clientX - b.left, by: e.clientY - b.top, bw: b.width }; };
    const showLoupe = (p) => {
      loupe.hidden = false; const z = 3, sz = 264, src = sz / z * (cap.W / p.bw);
      lctx.fillStyle = '#000'; lctx.fillRect(0, 0, sz, sz);
      lctx.drawImage(still, p.x - src / 2, p.y - src / 2, src, src, 0, 0, sz, sz);
      lctx.strokeStyle = '#FF6A1A'; lctx.lineWidth = 2; lctx.beginPath(); lctx.moveTo(sz / 2 - 18, sz / 2); lctx.lineTo(sz / 2 + 18, sz / 2); lctx.moveTo(sz / 2, sz / 2 - 18); lctx.lineTo(sz / 2, sz / 2 + 18); lctx.stroke();
      loupe.style.left = `${Math.max(0, Math.min(p.bw - 132, p.bx - 66))}px`; loupe.style.top = `${p.by > 160 ? p.by - 156 : p.by + 28}px`;
    };
    let pressing = false;
    frame.addEventListener('pointerdown', (e) => { if (cap.state !== 'marking' || cap.markIdx >= MARK_KEYS.length) return; pressing = true; frame.setPointerCapture(e.pointerId); showLoupe(toVideo(e)); });
    frame.addEventListener('pointermove', (e) => { if (pressing) showLoupe(toVideo(e)); });
    frame.addEventListener('pointerup', (e) => {
      if (!pressing) return; pressing = false; loupe.hidden = true;
      const p = toVideo(e);
      const key = MARK_KEYS[cap.markIdx];
      cap.marks[key] = { x: p.x, y: p.y };
      if (key === 'spindle') { cap.spindleLm = cap.frozenLm; cap.spindleRider = !!cap.frozenRider; }
      cap.markIdx = MARK_KEYS.findIndex((k) => !cap.marks[k]); if (cap.markIdx < 0) cap.markIdx = MARK_KEYS.length;
      paintMarks();
      if (cap.markIdx >= MARK_KEYS.length) finishMarks(); else paintMarkPrompt();
    });
    frame.addEventListener('pointercancel', () => { pressing = false; loupe.hidden = true; });

    function finishMarks() {
      cap.state = 'marked'; $u('#fx-markpill').hidden = true;
      const cal = TF.computeCalibration(cap.marks, r.bike, cap.H, cap.W);
      cal.markedWithRider = !!(cap.spindleRider || cap.frozenRider);
      if (cal.markedWithRider && cap.spindleLm) {
        const side = TF.framingCheck(cap.spindleLm).side, idx = TF.LM[side];
        const vis = (i) => cap.spindleLm[i][2] >= F.visibilityThreshold;
        if (vis(idx.heel) && vis(idx.toe)) cal.spindleFoot = { heel: lmPx(cap.spindleLm, idx.heel), toe: lmPx(cap.spindleLm, idx.toe) };
      }
      cap.cal = cal; cap.markedWithRider = cal.markedWithRider;
      const u = Settings.v.units, bm = cal.bikeMeasures, dist = cal.distance;
      const row = (ok, label, text) => `<div class="rrow ${ok ? 'ok' : 'warn'}"><i></i><b>${esc(label)}</b><span>${esc(text)}</span></div>`;
      const fixes = cal.warnings.map((w) => w.text);
      if (dist && dist.distance !== 'good') fixes.unshift(dist.text);
      if (dist && dist.centre !== 'good') fixes.push(dist.centreText);
      const card = $u('#fx-result');
      card.hidden = false;
      card.innerHTML = `<h3>${cal.ok && (!dist || dist.distance === 'good') ? 'The bike is marked' : 'Check the set-up'}</h3>
        ${row(cal.agreement <= C.calibration.scaleAgreementMax, 'Scale', `wheel and crank agree within ${(cal.agreement * 100).toFixed(1)}%`)}
        ${row(cal.squareRatio >= C.calibration.squareRatioMin, 'Square', `rear wheel ${Math.round(cal.squareRatio * 100)}% as wide as tall`)}
        ${row(Math.abs(cal.tiltDeg) <= 2, 'Level', `bike ${Math.abs(cal.tiltDeg).toFixed(1)}°${Math.abs(cal.tiltDeg) > 0.05 ? (cal.tiltDeg > 0 ? ' front high' : ' front low') : ''}`)}
        ${dist ? row(dist.distance === 'good', 'Distance', finite(dist.metres) ? `about ${dist.metres.toFixed(1)} m` : dist.distance) : ''}
        ${bm ? (() => { const L = (v) => esc(U.len(Number.isFinite(v) ? Math.round(v) : v, 'length'));
          const drop = Number.isFinite(bm.drop) && bm.drop < 0 ? `hoods ${L(-bm.drop)} above the saddle` : `saddle-to-hood drop ${L(bm.drop)}`;
          return `<p class="bike-nums">Saddle height ${L(bm.saddleHeight)} to the nose · saddle setback ${L(bm.saddleSetback)} · ${drop} · reach to the hoods ${L(bm.reach)}</p>`; })() : ''}
        ${fixes.length ? `<ul class="fixes">${fixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}`;
      actions(`<button class="btn" id="fx-remark2">Re-mark</button><button class="btn primary" id="fx-ready2">Ready to ride</button>`);
      $u('#fx-remark2').onclick = () => { cap.marks = {}; cap.cal = null; cap.reused = false; cap.saidCrank = false; enterPlacing(); };
      $u('#fx-ready2').onclick = onReady;
      Sound.say(cal.ok && (!dist || dist.distance === 'good') ? 'The bike is marked. Tap Ready to ride.' : `Check the set-up. ${fixes[0] || ''}`);
    }
    const finite = (v) => typeof v === 'number' && Number.isFinite(v);

    /* ----- ride ----- */
    function triggerText() {
      const v = Settings.v;
      const start = v.startMode === 'strokes' ? `Start after ${v.startStrokes} steady strokes` : v.startMode === 'beeps' ? `Start after ${v.startBeeps} beeps` : `Start after ${v.startSeconds} s`;
      const stop = v.stopMode === 'strokes' ? `Record ${v.stopStrokes} strokes` : `Record ${v.stopSeconds} s`;
      return { start, stop };
    }
    function paintTriggers() {
      const t = triggerText(), box = $u('#fx-trig');
      box.hidden = false;
      box.innerHTML = `<button class="pill btn-pill" id="fx-t-start">${esc(t.start)} ▾</button><button class="pill btn-pill" id="fx-t-stop">${esc(t.stop)} ▾</button>`;
      $u('#fx-t-start').onclick = () => chooseTrigger('start');
      $u('#fx-t-stop').onclick = () => chooseTrigger('stop');
    }
    async function chooseTrigger(which) {
      const v = Settings.v;
      const opts = which === 'start'
        ? [['strokes:10', 'After 10 steady strokes'], ['strokes:6', 'After 6 steady strokes'], ['seconds:15', 'After 15 s'], ['seconds:30', 'After 30 s'], ['beeps:5', 'After 5 beeps']]
        : [['seconds:20', 'Record 20 s'], ['seconds:30', 'Record 30 s'], ['strokes:15', 'Record 15 strokes'], ['strokes:25', 'Record 25 strokes']];
      const cur = which === 'start' ? `${v.startMode}:${v.startMode === 'strokes' ? v.startStrokes : v.startMode === 'beeps' ? v.startBeeps : v.startSeconds}` : `${v.stopMode}:${v.stopMode === 'strokes' ? v.stopStrokes : v.stopSeconds}`;
      const pick = await sheet({ title: which === 'start' ? 'Start recording' : 'Stop recording', body: `<div class="list">${opts.map(([k, l]) => `<button class="list-item" data-k="${k}"><span class="grow">${esc(l)}</span>${k === cur ? icon('check', 'chev') : ''}</button>`).join('')}</div>`,
        actions: [{ label: 'Close', value: null, kind: 'quiet' }], onOpen: (s, close) => $$('[data-k]', s).forEach((b) => (b.onclick = () => close(b.dataset.k))) });
      if (!pick) return;
      const [mode, n] = pick.split(':');
      if (which === 'start') { Settings.set('startMode', mode); Settings.set(mode === 'strokes' ? 'startStrokes' : mode === 'beeps' ? 'startBeeps' : 'startSeconds', Number(n)); }
      else { Settings.set('stopMode', mode); Settings.set(mode === 'strokes' ? 'stopStrokes' : 'stopSeconds', Number(n)); }
      paintTriggers();
    }
    function armFade() {
      clearTimeout(cap.fadeTimer); ui.classList.remove('faded');
      if (riding()) cap.fadeTimer = setTimeout(() => { if (riding()) ui.classList.add('faded'); }, 3000);
    }
    ui.addEventListener('pointerdown', armFade);

    function onReady(second) {
      cap.state = 'waiting'; $u('#fx-result').hidden = true; still.hidden = true; video.hidden = false; drawSilhouette();
      cap.sc.reset(); cap.framingOkSince = null; cap.issueSince = null; cap.saidIssue = {}; cap.sayCadence = true; cap.saidSeen = false;
      paintTriggers(); paintLights();
      actions(`<button class="btn quiet" id="fx-stop">Stop</button>`);
      $u('#fx-stop').onclick = () => stopEarly('tap');
      armFade();
      const v = Settings.v;
      const how = v.startMode === 'strokes' ? `I'll start recording after ${v.startStrokes} steady pedal strokes.` : v.startMode === 'beeps' ? `Recording starts after ${v.startBeeps} beeps.` : `Recording starts in ${v.startSeconds} seconds.`;
      let line;
      if (second === true) line = `Move your hands to the ${(TF.HAND_POSITIONS[cap.hand] || 'next position').toLowerCase()} and keep pedalling. ${how}`;
      else if (cap.rider) line = `Start pedalling at a steady effort you could hold for an hour, when you're ready. ${how}`;
      else line = `Walk to the bike and start pedalling at a steady effort you could hold for an hour. ${how}`;
      cap.saidSeen = !!cap.rider;
      status(second === true ? `Hands on the ${(TF.HAND_POSITIONS[cap.hand] || '').toLowerCase()}` : cap.rider ? 'Start pedalling when ready' : 'Get on the bike', how);
      Sound.say(line);
      if (v.startMode === 'seconds') countdown(v.startSeconds);
    }
    const framingOk = (now) => cap.framingOkSince && now - cap.framingOkSince >= F.stableMs;
    function sayIssue(now, fc) {
      // Head cut off, feet cut off or a joint missing for more than 3 s: say it once, with the fix.
      let key = null, line = null;
      if (!cap.lm) return;
      if (fc.feetCut) { key = 'feet'; line = 'Your feet are cut off at the bottom of the frame. The camera needs to be further back or a little higher.'; }
      else if (fc.missing.length) { key = 'missing:' + fc.missing.join(','); line = `I can't see ${TF.describeMissing(fc.missing)}. Check you're fully in the frame.`; }
      else if (fc.headCut) { key = 'head'; line = "Your head is cut off at the top. That doesn't affect the measurements, but the camera could go a little further back."; }
      if (!key) { cap.issueSince = null; return; }
      if (cap.issueKey !== key) { cap.issueKey = key; cap.issueSince = now; return; }
      if (now - cap.issueSince > 3000 && !cap.saidIssue[key]) { cap.saidIssue[key] = true; Sound.beep('problem'); Sound.say(line); }
    }
    function tick(now, fc, ev) {
      const cad = cap.sc.cadence(), v = Settings.v;
      if (cap.state === 'question') return;
      if (riding() && cap.lm && !cap.saidSeen && cap.rider) { cap.saidSeen = true; Sound.say('I can see you.', { interrupt: false }); }
      if (riding()) sayIssue(now, fc);
      if (cap.state === 'waiting') {
        if (v.startMode === 'seconds') return; // the countdown owns the status line
        $u('#fx-small').textContent = Number.isFinite(cad) ? `${Math.round(cad)} rpm` : triggerText().start;
        if (!framingOk(now)) return;
        if (v.startMode === 'beeps') { if (cap.sc.count >= 3) beginBeeps(); return; }
        if (!cap.sc.stable()) { status('Pedal steadily', Number.isFinite(cad) ? `Cadence ${Math.round(cad)} rpm, settling` : 'Steady, moderate effort'); return; }
        if (cap.sayCadence) {
          cap.sayCadence = false;
          const advice = cad < T.cadenceLow ? ` That's a little slow; aim for about ${T.cadenceLow + 10}.` : cad > T.cadenceHigh ? ` That's quick; ease to about ${T.cadenceHigh - 10}.` : '';
          Sound.say(`Cadence ${Math.round(cad)}.${advice} Counting ${v.startStrokes} strokes.`);
        }
        cap.state = 'counting'; cap.countStrokes = 0;
        return;
      }
      if (cap.state === 'counting') {
        if (!fc.ok && cap.framingBadSince && now - cap.framingBadSince > 1500) { cap.state = 'waiting'; bigcount.hidden = true; return; }
        if (ev) { cap.countStrokes++; Sound.beep('tick'); }
        const left = v.startStrokes - cap.countStrokes;
        bigcount.hidden = false; bigcount.textContent = String(Math.max(0, left));
        status('Keep pedalling', `Recording in ${plural(Math.max(0, left), 'stroke')} · ${Math.round(cad)} rpm`);
        if (left <= 0) startRecording();
        return;
      }
      if (cap.state === 'recording') {
        const e = (now - cap.recStart) / 1000;
        const goal = v.stopMode === 'strokes' ? `${cap.recStrokes} of ${v.stopStrokes} strokes` : `${Math.max(0, Math.ceil(v.stopSeconds - e))} s left`;
        status('Recording', `${goal}${Number.isFinite(cad) ? ` · ${Math.round(cad)} rpm` : ''}`);
        const rec = $u('#fx-rec'); if (rec) rec.innerHTML = `<span class="dot"></span>REC ${Math.floor(e)} s`;
        const done = v.stopMode === 'strokes' ? cap.recStrokes >= v.stopStrokes : e >= v.stopSeconds;
        if (done || e >= C.capture.maxClipSeconds) stopRecording();
      }
    }
    function countdown(n) {
      bigcount.hidden = false;
      const step = (k) => {
        if (cap.closed || cap.state !== 'waiting') return;
        bigcount.textContent = String(k);
        if (k <= 3 && k > 0) Sound.beep('count');
        if (k <= 0) {
          const wait = () => { if (cap.closed || cap.state !== 'waiting') return; if (framingOk(performance.now())) startRecording(); else { status('Waiting for a clear view', 'Recording starts as soon as I can see you clearly.'); later(wait, 250); } };
          wait(); return;
        }
        status(cap.rider ? 'Pedal steadily' : 'Get on the bike', `Recording in ${k} s`);
        later(() => step(k - 1), 1000);
      };
      step(n);
    }
    function beginBeeps() {
      cap.state = 'beeping'; let k = Settings.v.startBeeps; bigcount.hidden = false;
      const step = () => {
        if (cap.closed || cap.state !== 'beeping') return;
        if (k <= 0) { startRecording(); return; }
        bigcount.textContent = String(k); Sound.beep('count'); status('Keep pedalling', `Recording after ${plural(k, 'beep')}`);
        k--; later(step, C.triggers.beepIntervalMs);
      };
      step();
    }
    function startRecording() {
      bigcount.hidden = true; cap.chunks = []; cap.recFrames = []; cap.recStrokes = 0;
      const mime = C.capture.mimeTypes.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      try { cap.recorder = new MediaRecorder(cap.stream, mime ? { mimeType: mime, videoBitsPerSecond: C.capture.videoBitsPerSecond } : undefined); }
      catch (e) { status('Recording is not supported here', e.message); return; }
      cap.mime = cap.recorder.mimeType || mime || 'video/webm';
      cap.recorder.ondataavailable = (e) => { if (e.data && e.data.size) cap.chunks.push(e.data); };
      cap.recorder.start(1000);
      cap.recStart = performance.now(); cap.state = 'recording';
      $u('#fx-trig').hidden = true;
      if (!$u('#fx-rec')) $u('.corner.tl').insertAdjacentHTML('beforeend', '<span class="pill rec" id="fx-rec"><span class="dot"></span>REC</span>');
      Sound.beep('start'); Sound.say('Recording. Keep pedalling steadily.');
    }
    function removeRec() { const x = $u('#fx-rec'); if (x) x.remove(); }
    function stopRecording(discard) {
      const durationS = (performance.now() - cap.recStart) / 1000;
      removeRec();
      if (discard) { try { cap.recorder.onstop = null; cap.recorder.stop(); } catch { /* ignore */ } return; }
      cap.state = 'checking'; Sound.beep('stop');
      status('Done', 'Checking the recording…');
      Sound.say('Done. Checking.');
      cap.recorder.onstop = () => afterRecording(durationS);
      try { cap.recorder.stop(); } catch { afterRecording(durationS); }
    }
    async function afterRecording(durationS) {
      const blob = new Blob(cap.chunks, { type: cap.mime });
      const q = TF.captureQuality(cap.recFrames, cap.recStrokes);
      if (q.ok) {
        const s = cap.stream.getVideoTracks()[0].getSettings();
        cap.clips.push({ blob, mime: cap.mime, width: cap.W, height: cap.H, fps: s.frameRate || 30, durationS, hand: cap.hand,
          live: { strokes: cap.recStrokes, cadence: cap.sc.cadence() }, captureSettings: { startMode: Settings.v.startMode, stopMode: Settings.v.stopMode }, level: cap.level, warnings: q.warnings || [] });
        const next = cap.clips.length === 1 ? otherHand() : null;
        if (next) {
          const a = await ask({ kind: 'second', text: `Good capture. Record the ${TF.HAND_POSITIONS[next].toLowerCase()} too?`,
            speech: `Good capture. Want to record a second hand position, the ${TF.HAND_POSITIONS[next].toLowerCase()}? ${replyHint('yes', 'no')}`,
            yesLabel: `Record ${TF.HAND_POSITIONS[next].toLowerCase()}`, noLabel: 'Done', yesSay: `Recording the ${TF.HAND_POSITIONS[next].toLowerCase()} next.`, noSay: 'Done. You can get off the bike.', timeout: 'no' });
          if (a === 'yes') { cap.hand = next; onReady(true); return; }
        } else {
          Sound.say('Good capture. You can get off.');
        }
        status('Good capture', 'You can get off the bike.');
        finish(true);
        return;
      }
      Sound.beep('problem');
      cap.tries++;
      const auto = cap.tries <= C.capture.autoRetries;
      const a = await ask({ kind: 'retry', text: q.text || q.speech, speech: `${q.speech} ${replyHint('again', 'done')}${auto ? ' If you do nothing, I will go again.' : ''}`,
        yesLabel: 'Go again', noLabel: 'Stop and check the set-up', yesSay: 'Going again.', noSay: 'Stopping. Check the set-up.', timeout: auto ? 'yes' : 'no' });
      if (a === 'yes') onReady(cap.clips.length > 0);
      else { cap.tries = 0; enterPlacing(); }
    }
    function replyHint(yesWord, noWord) {
      const voice = Settings.v.voiceReplies && Listener.available();
      return `Raise your right hand${voice ? `, or say ${yesWord},` : ''} for yes. Left hand${voice ? `, or say ${noWord},` : ''} for no.`;
    }

    /* ----- questions: gesture, voice or tap ----- */
    function ask(q) {
      return new Promise((resolveQ) => {
        const prevState = cap.state;
        cap.state = 'question'; cap.question = q; ui.classList.remove('faded');
        const box = $u('#fx-q');
        box.hidden = false;
        box.innerHTML = `<p>${esc(q.text)}</p><div class="qrow"><button class="btn lg" id="fx-q-no">${esc(q.noLabel)}</button><button class="btn primary lg" id="fx-q-yes">${esc(q.yesLabel)}</button></div>
          <p class="qhint">${Listener.available() && Settings.v.voiceReplies ? 'Raise your right hand or say “yes” · left hand or “no”' : 'Raise your right hand for yes · left hand for no'}</p>`;
        let done = false;
        const answer = (val, via) => {
          if (done) return; done = true;
          Listener.stop(); clearTimeout(to);
          box.hidden = true; cap.question = null; cap.state = prevState === 'question' ? 'checking' : prevState;
          cap.replies.push({ q: q.kind, answer: val, via, at: new Date().toISOString() });
          if (via !== 'tap') Sound.say(`${via === 'gesture' ? (val === 'yes' ? 'Right hand' : 'Left hand') : via === 'voice' ? 'Got it' : "No answer"}: ${val === 'yes' ? q.yesSay : q.noSay}`);
          else Sound.say(val === 'yes' ? q.yesSay : q.noSay);
          resolveQ(val);
        };
        cap.answer = answer;
        $u('#fx-q-yes').onclick = () => answer('yes', 'tap');
        $u('#fx-q-no').onclick = () => answer('no', 'tap');
        Sound.say(q.speech).then(() => {
          if (done) return;
          Listener.start(['yes', 'again', 'no', 'done', 'stop'], (w) => answer(['yes', 'again'].includes(w) ? 'yes' : 'no', 'voice'));
        });
        const to = setTimeout(() => answer(q.timeout || 'no', 'auto'), 20000);
        cap.timers.push(to);
      });
    }
    function gestures(lm, now) {
      if (!lm) { cap.gestureSince.right = cap.gestureSince.left = null; return; }
      const noseY = lm[TF.LM.nose][1];
      const up = (i) => lm[i][2] >= 0.5 && lm[i][1] < noseY;
      for (const [side, idx] of [['right', TF.LM.right.wrist], ['left', TF.LM.left.wrist]]) {
        if (up(idx)) { cap.gestureSince[side] = cap.gestureSince[side] || now; } else cap.gestureSince[side] = null;
      }
      const held = (side) => cap.gestureSince[side] && now - cap.gestureSince[side] >= 1500;
      if (cap.state === 'question' && cap.answer) {
        if (held('right')) { cap.gestureSince.right = null; cap.answer('yes', 'gesture'); }
        else if (held('left')) { cap.gestureSince.left = null; cap.answer('no', 'gesture'); }
        return;
      }
      if (riding() && held('left')) { cap.gestureSince.left = null; stopEarly('gesture'); }
    }
    async function stopEarly(via) {
      const wasRecording = cap.state === 'recording';
      if (wasRecording) stopRecording(true);
      bigcount.hidden = true;
      const a = await ask({ kind: 'stop', text: 'Stop for now?', speech: `Stop for now? ${replyHint('again', 'stop')}`.replace('for yes', 'to keep going').replace('for no', 'to stop'),
        yesLabel: 'Keep going', noLabel: 'Stop', yesSay: 'Keeping going.', noSay: 'Stopped.', timeout: 'yes' });
      void via;
      if (a === 'yes') onReady(cap.clips.length > 0);
      else enterPlacing();
    }

    /* ----- finish ----- */
    function cleanup() {
      cap.closed = true;
      cancelAnimationFrame(cap.raf); clearTimeout(cap.fadeTimer);
      cap.timers.forEach(clearTimeout);
      window.removeEventListener('deviceorientation', onOrient); window.removeEventListener('resize', layout);
      Listener.stop();
      try { if (cap.recorder && cap.recorder.state === 'recording') { cap.recorder.onstop = null; cap.recorder.stop(); } } catch { /* ignore */ }
      if (cap.stream) cap.stream.getTracks().forEach((t) => t.stop());
      if (cap.det) cap.det.close();
      if (cap.wakeLock) cap.wakeLock.release().catch(() => {});
      ui.remove(); document.body.style.overflow = '';
    }
    let finished = false;
    function finish(ok) {
      if (finished) return; finished = true;
      const out = ok && cap.clips.length ? { clips: cap.clips, cal: cap.cal, marks: cap.marks, markedWithRider: cap.markedWithRider, replies: cap.replies } : null;
      later(() => { cleanup(); resolve(out); }, ok ? 1800 : 0);
    }

    $u('#fx-close').onclick = async () => {
      if (cap.state === 'recording' || cap.state === 'counting' || cap.state === 'beeping') { if (!(await confirmDanger('Stop recording?', 'The recording in progress will be discarded.', 'Stop'))) return; }
      if (cap.clips.length) { finish(true); return; }
      Sound.stop(); finished = true; cleanup(); resolve(null);
    };
    $u('#fx-flip').onclick = () => { cap.flip = !cap.flip; Settings.set('silhouetteFlip', cap.flip); drawSilhouette(); };
    $u('#fx-sound').onclick = () => { Sound.unlock(); $u('#fx-sound').hidden = true; Sound.say('Sound is on.'); };
    $u('#fx-torch').onclick = async () => {
      const track = cap.stream && cap.stream.getVideoTracks()[0]; if (!track) return;
      cap.torch = !cap.torch;
      try { await track.applyConstraints({ advanced: [{ torch: cap.torch }] }); } catch { toast('This camera’s light could not be switched.'); }
    };
    $u('#fx-cam').onclick = async () => {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput');
      const cur = cap.stream && cap.stream.getVideoTracks()[0].getSettings().deviceId;
      const pick = await sheet({ title: 'Camera', body: `<div class="list">${devs.map((x, i) => `<button class="list-item" data-id="${esc(x.deviceId)}"><span class="grow">${esc(x.label || `Camera ${i + 1}`)}</span>${x.deviceId === cur ? icon('check', 'chev') : ''}</button>`).join('')}</div>`,
        actions: [{ label: 'Close', value: null, kind: 'quiet' }], onOpen: (s, close) => $$('[data-id]', s).forEach((b) => (b.onclick = () => close(b.dataset.id))) });
      if (!pick) return;
      const dev = devs.find((x) => x.deviceId === pick);
      Settings.set('cameraId', pick); Settings.set('cameraFacing', /front|user|facetime/i.test(dev ? dev.label : '') ? 'user' : 'environment');
      cap.marks = {}; cap.cal = null; cap.side = null; cap.sc.reset();
      await openCamera(); enterPlacing();
    };
    setCleanup(() => { if (!finished) { finished = true; cleanup(); resolve(null); } });
    // Test hook: automated browser tests read the state.
    window.__TF_CAPTURE = cap;
    init();
  });
}

/* ---------- analyse and save ---------- */
async function analyseVideo(blob, mime, fpsWanted, onProgress, isCancelled) {
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
  const url = URL.createObjectURL(blob); video.src = url;
  try {
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error('This browser cannot play the recording.')); });
    let duration = video.duration;
    if (!Number.isFinite(duration)) {
      // MediaRecorder WebM files have no duration until the end has been seen.
      await new Promise((res) => { video.onseeked = res; video.currentTime = 1e9; setTimeout(res, 3000); });
      duration = video.duration; video.currentTime = 0;
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read the recording length.');
    onProgress({ phase: 'model', p: 0 });
    const det = await loadPose('heavy', (p, cached) => onProgress({ phase: 'model', p, cached }));
    const W = video.videoWidth, H = video.videoHeight, frames = [];
    const step = 1 / fpsWanted, total = Math.floor(duration / step);
    let timeouts = 0;
    for (let i = 0; i <= total; i++) {
      if (isCancelled()) throw new Error('cancelled');
      const t = Math.min(duration - 0.001, i * step);
      const ok = await new Promise((res) => { const to = setTimeout(() => res(false), C.analysis.seekTimeoutMs); video.onseeked = () => { clearTimeout(to); res(true); }; video.currentTime = t; });
      if (!ok) { if (++timeouts > 3) throw new Error('This browser could not step through the recording.'); continue; }
      let lm = null;
      try { lm = det.detect(video, t * 1000); } catch (e) { console.warn(e); }
      frames.push({ t, lm });
      if (i % 3 === 0) onProgress({ phase: 'frames', p: i / total, i, total });
      if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    det.close();
    return { frames, width: W, height: H, duration };
  } finally { URL.revokeObjectURL(url); }
}

async function renderAnalyse(main, r, d) {
  const cap = d.capture, n = cap.clips.length;
  main.innerHTML = `<div class="page-head"><div><h1>Analysing</h1><div class="sub">Every frame is measured with the detailed tracker. Keep this screen open.</div></div></div>
    <div class="panel stack"><div class="row"><span class="spinner"></span><b id="an-title">Preparing…</b></div>
      <div class="bar"><i id="an-bar" style="width:0%"></i></div><p class="small muted" id="an-sub"></p>
      <div><button class="btn sm quiet" id="an-cancel">Cancel</button></div></div>`;
  let cancelled = false;
  $('#an-cancel', main).onclick = () => { cancelled = true; };
  setCleanup(() => { cancelled = true; });
  const t0 = performance.now();
  try {
    const s = TF.newSession(r);
    const built = [];
    for (let ci = 0; ci < n; ci++) {
      const c = cap.clips[ci];
      const estStrokes = Math.max(1, c.live.strokes || 1);
      const res = await analyseVideo(c.blob, c.mime, C.analysis.fps, (pr) => {
        if (cancelled) return;
        const which = n > 1 ? ` (${TF.HAND_POSITIONS[c.hand]}, ${ci + 1} of ${n})` : '';
        if (pr.phase === 'model') { $('#an-title', main).textContent = (pr.cached ? 'Loading the tracker…' : 'Downloading the analysis engine (first time only)…') + which; $('#an-bar', main).style.width = `${Math.round(pr.p * 100)}%`; return; }
        const el2 = (performance.now() - t0) / 1000, left = pr.p > 0.05 ? el2 / pr.p * (1 - pr.p) : NaN;
        $('#an-title', main).textContent = `Analysing stroke ${Math.min(estStrokes, Math.floor(pr.p * estStrokes) + 1)} of ${estStrokes}${which}`;
        $('#an-bar', main).style.width = `${Math.round(pr.p * 100)}%`;
        $('#an-sub', main).textContent = `Frame ${pr.i} of ${pr.total}${Number.isFinite(left) ? ` · about ${Math.max(1, Math.round(left))} s left` : ''}`;
      }, () => cancelled);
      const clip = {
        id: TF.uid('c'), view: 'side', hand: c.hand, mime: c.mime, file: null, width: res.width, height: res.height, fps: c.fps, analysedFps: C.analysis.fps,
        durationS: res.duration, calibration: cap.cal ? JSON.parse(JSON.stringify(cap.cal)) : null, frames: res.frames,
        live: c.live, captureSettings: c.captureSettings, level: c.level || null, captureWarnings: c.warnings || [],
        analysisSeconds: Math.round((performance.now() - t0) / 100) / 10,
      };
      const a = TF.analyseClip(clip);
      if (!a.ok) { if (ci === 0) { d.error = a.error; d.step = 'failed'; d.rerender(); return; } continue; }
      const ext = /mp4/.test(c.mime) ? 'mp4' : 'webm';
      clip.file = TF.PATHS.clip(r.id, s.id, clip.id, ext);
      await putBlob(clip.file, c.blob);
      built.push({ clip, a });
    }
    s.discomfort = JSON.parse(JSON.stringify(d.discomfort));
    s.retestOf = d.retestOf;
    s.profile = JSON.parse(JSON.stringify(r.profile)); s.bike = JSON.parse(JSON.stringify(r.bike));
    s.marks = cap.marks ? JSON.parse(JSON.stringify(cap.marks)) : null;
    s.bikeMeasures = cap.cal ? cap.cal.bikeMeasures : null;
    s.markedWithRider = !!cap.markedWithRider;
    s.replies = cap.replies || [];
    s.clips.push(built[0].clip);
    if (built[1]) s.secondClip = built[1].clip;
    const a = built[0].a;
    const results = TF.buildResults(a, s.profile, built[0].clip.hand, s.discomfort, Settings.v.units, { history: historyFor(r, s), bikeMeasures: s.bikeMeasures });
    s.results = { snapshot: true, units: Settings.v.units, recommendation: results.recommendation, gate: results.gate, gauges: results.gauges, cadence: a.cadence, strokes: a.strokes.length };
    r.sessions.push(s);
    r.modified = s.modified = new Date().toISOString();
    S.cache.set(s.id, a);
    await saveFile();
    S.session = null;
    go(`#/session/${s.id}`);
    if (Settings.v.exportPrompt) setTimeout(() => offerExport(), 600);
  } catch (e) {
    if (cancelled || e.message === 'cancelled') { toast('Analysis cancelled.'); S.session = null; go('#/'); return; }
    console.error(e); d.error = e.message; d.step = 'failed'; d.rerender();
  }
}

async function offerExport() {
  const v = await sheet({ title: 'Save a copy of your fit file?', body: '<p class="muted">The session is saved on this device. Exporting keeps a permanent copy you can open on any device; the browser can clear its own storage.</p>',
    actions: [{ label: "Don't ask again", value: 'never', kind: 'quiet' }, { label: 'Not now', value: null }, { label: 'Export now', value: 'export', kind: 'primary' }] });
  if (v === 'export') exportFlow();
  if (v === 'never') { Settings.set('exportPrompt', false); toast('You can export any time from the file menu or Settings.'); }
}

function renderFailed(main, r, d) {
  main.innerHTML = `<div class="page-head"><div><h1>The analysis could not finish</h1></div></div>
    <div class="banner bad">${icon('alert')}<div class="grow"><b>${esc(d.error || 'Something went wrong.')}</b><br>Usually this means the rider was not clearly in view for long enough, or the recording was too short. Check the set-up and record again.</div></div>
    <div class="btn-row" style="margin-top:14px"><button class="btn primary" id="f-again">${icon('camera')}Record again</button><a class="btn quiet" href="#/help">Troubleshooting</a></div>`;
  $('#f-again', main).onclick = () => { d.step = 'checkin'; d.rerender(); };
}
