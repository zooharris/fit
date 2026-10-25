/* ==========================================================================
   A fit session: check-in → setup → capture → calibrate → analyse → save
   ========================================================================== */
const REGION_ORDER = C.discomfort.regions;
const LEVEL_LABELS = { none: 'None', mild: 'Mild', moderate: 'Moderate', severe: 'Severe' };
const PATTERN_LABELS = { new: 'New or occasional', builds: 'Builds during rides', persists: 'Lasts after rides' };

route('/session/new', async (main, { query }) => {
  const r = rider();
  if (!r) { go('#/rider/new'); return; }
  const retestOf = query.get('retest');
  const prev = retestOf ? findSession(retestOf) : null;
  const prevRec = prev ? (sessionResults(prev.rider, prev.session) || {}).recommendation : null;
  // The draft lives in memory until the analysis is saved.
  if (!S.session || S.session.riderId !== r.id || S.session.retestOf !== (retestOf || null)) {
    S.session = {
      riderId: r.id, retestOf: retestOf || null, step: 'checkin', hand: r.profile.hands[0],
      discomfort: prev && prev.session.discomfort ? JSON.parse(JSON.stringify(prev.session.discomfort)) : { regions: {}, numbness: false, recentInjury: false },
      change: prevRec && prevRec.current ? { action: prevRec.current.text, made: 'yes', note: '' } : null,
    };
  }
  const d = S.session;
  const step = () => ({ checkin: renderCheckin, setup: renderSetup, calibrate: renderCalibrate, analyse: renderAnalyse, failed: renderFailed }[d.step] || renderCheckin)(main, r, d);
  d.rerender = () => { main.innerHTML = ''; step(); };
  step();
}, { needsFile: true, nav: 'fit' });

function wizardHead(n, title, sub) {
  return `<div class="wizard-head"><div class="progress-dots">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div><span class="caption">Step ${n} of 4</span></div>
    <div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
}

/* ---------- 1. check-in ---------- */
function renderCheckin(main, r, d) {
  const gate = () => TF.discomfortGate(d.discomfort);
  const hands = r.profile.hands;
  main.innerHTML = `
    ${wizardHead(1, 'Before you ride', 'A few questions so the results focus on what matters to you.')}
    <div class="stack">
      ${d.change ? `<div class="panel accent stack"><div class="caption">Retest</div><p>Last time the suggestion was: <b>${esc(d.change.action)}</b></p>
        <div class="field"><span class="label">Did you make that change?</span><div class="seg" id="ck-made"><button data-v="yes">Yes, as suggested</button><button data-v="different">A different change</button><button data-v="no">No change</button></div></div>
        <div class="field" id="ck-note-wrap" ${d.change.made === 'different' ? '' : 'hidden'}><label for="ck-note">What did you change?</label><input id="ck-note" value="${esc(d.change.note)}" placeholder="e.g. raised the saddle 5 mm"></div></div>` : ''}
      ${hands.length > 1 ? `<div class="panel stack"><div class="field"><span class="label">Hand position for this recording</span><div class="chips" id="ck-hand">${hands.map((h) => `<button class="chip ${h === d.hand ? 'on' : ''}" data-h="${h}">${esc(TF.HAND_POSITIONS[h])}</button>`).join('')}</div>
        <span class="hint">This version records one hand position per session. Saddle advice uses your main position (${esc(TF.HAND_POSITIONS[hands[0]])}).</span></div></div>` : ''}
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
      <div class="btn-row"><button class="btn primary lg" id="ck-next">Next: set up ${icon('chevR')}</button><a class="btn quiet" href="#/" id="ck-cancel">Cancel</a></div>
    </div>`;
  const paintRegions = () => {
    $('#ck-regions', main).innerHTML = REGION_ORDER.map((k) => {
      const a = d.discomfort.regions[k] || { level: 'none' };
      return `<div class="region" data-r="${k}"><div class="rhead"><b>${esc(TF.REGIONS[k].label)}</b>
        <div class="seg sm">${Object.entries(LEVEL_LABELS).map(([v, l]) => `<button data-l="${v}" class="${a.level === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${a.level && a.level !== 'none' ? `<div class="seg sm">${Object.entries(PATTERN_LABELS).map(([v, l]) => `<button data-p="${v}" class="${a.pattern === v ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}</div>`;
    }).join('');
    $$('.region', main).forEach((row) => {
      const k = row.dataset.r;
      $$('[data-l]', row).forEach((b) => (b.onclick = () => { const cur = d.discomfort.regions[k] || {}; d.discomfort.regions[k] = { level: b.dataset.l, pattern: b.dataset.l === 'none' ? null : cur.pattern || 'builds' }; paintRegions(); paintGate(); }));
      $$('[data-p]', row).forEach((b) => (b.onclick = () => { d.discomfort.regions[k].pattern = b.dataset.p; paintRegions(); paintGate(); }));
    });
  };
  const paintGate = () => {
    const g = gate();
    $('#ck-gate', main).innerHTML = g.gated ? `<div class="banner warn">${icon('alert')}<div class="grow"><b>Please see a professional before changing your bike.</b> You mentioned ${esc(g.reasons.join(', '))}. A clinician or professional bike fitter should look at that first. You can still record and see your measurements; any suggestions will be marked as for discussion with a professional.</div></div>` : '';
  };
  paintRegions(); paintGate();
  $('#ck-numb', main).onchange = (e) => { d.discomfort.numbness = e.target.checked; paintGate(); };
  $('#ck-injury', main).onchange = (e) => { d.discomfort.recentInjury = e.target.checked; paintGate(); };
  $$('#ck-hand .chip', main).forEach((c) => (c.onclick = () => { d.hand = c.dataset.h; $$('#ck-hand .chip', main).forEach((x) => x.classList.toggle('on', x === c)); }));
  if (d.change) {
    $$('#ck-made button', main).forEach((b) => { b.classList.toggle('on', b.dataset.v === d.change.made); b.onclick = () => { d.change.made = b.dataset.v; $$('#ck-made button', main).forEach((x) => x.classList.toggle('on', x === b)); $('#ck-note-wrap', main).hidden = b.dataset.v !== 'different'; }; });
    $('#ck-note', main).oninput = (e) => { d.change.note = e.target.value; };
  }
  $('#ck-next', main).onclick = () => { d.step = 'setup'; d.rerender(); };
  $('#ck-cancel', main).onclick = () => { S.session = null; };
}

/* ---------- 2. setup ---------- */
function triggerSummary() {
  const v = Settings.v;
  const start = v.startMode === 'strokes' ? `after ${v.startStrokes} steady pedal strokes` : v.startMode === 'beeps' ? `after ${v.startBeeps} beeps` : `${v.startSeconds} seconds after you tap Start`;
  const stop = v.stopMode === 'strokes' ? `for ${v.stopStrokes} pedal strokes` : `for ${v.stopSeconds} seconds`;
  return { start, stop };
}
function renderSetup(main, r, d) {
  const t = triggerSummary();
  const cards = [
    { title: 'Bike on the trainer, level', art: SETUP_ART.rig(), points: ['Use a trainer or rollers so the bike stays still and upright.', 'Level the bike front to back (a front-wheel riser helps).', 'Use the bike, shoes and clothing you normally ride in.'] },
    { title: 'Camera beside the bike', art: SETUP_ART.camera(), points: ['Film the side without the chainring, so it doesn\'t hide your foot.', '2.5–3 m away, pointing straight at the side of the bike.', 'Landscape, on a stand or shelf so it does not move.'] },
    { title: 'Camera height and level', art: SETUP_ART.height(), points: ['Lens about level with the top of the wheels.', 'Keep the phone level: not tilted up or down. The app shows a level reading when the phone has a motion sensor.', 'Your whole body and both wheels in the frame.'] },
    { title: 'Clothing, light and sound', art: SETUP_ART.clothes(), points: ['Fitted clothing that stands out from the background; no baggy shorts.', 'Light from the camera side, not a bright window behind you.', 'Volume up. On iPhone, the silent switch off.'] },
  ];
  main.innerHTML = `
    ${wizardHead(2, 'Set up', 'Two minutes now saves a retake. The app checks each of these on the camera screen.')}
    ${!CAPS.canRecord ? `<div class="banner bad" style="margin-bottom:14px">${icon('alert')}<div class="grow"><b>This browser can't record.</b> ${!CAPS.secure ? 'The camera needs the https address of Tango Fitter.' : 'Use an up-to-date iPhone, iPad or laptop browser.'}</div></div>` : ''}
    <div class="stack">${cards.map((c, i) => `<div class="panel setup-card"><div class="art">${c.art}</div><div><div class="caption">${i + 1} of ${cards.length}</div><h2 style="margin:4px 0 8px">${esc(c.title)}</h2><ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div></div>`).join('')}
      <div class="panel stack"><h2>What happens next</h2>
        <p class="muted">Tap <b>Start</b> on the camera screen, then get on the bike and pedal at a steady, moderate effort you could hold for an hour. Recording starts ${esc(t.start)} and runs ${esc(t.stop)}. The app talks you through it, and checks the recording before you get off.</p>
        <details class="more"><summary>${icon('chevR')}What the beeps mean</summary><dl class="kv" style="margin-top:8px">${BEEP_LEGEND.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl></details>
        <div><a class="btn sm quiet" href="#/settings">Change timing or sound in Settings</a></div></div>
      <div class="btn-row"><button class="btn primary lg" id="su-go" ${CAPS.canRecord ? '' : 'disabled'}>${icon('camera')}Open the camera</button><button class="btn quiet" id="su-back">${icon('chevL')}Back</button></div>
    </div>`;
  $('#su-back', main).onclick = () => { d.step = 'checkin'; d.rerender(); };
  $('#su-go', main).onclick = async () => {
    const res = await runCapture(d);
    if (res && res.ok) { d.capture = res; d.step = 'calibrate'; d.rerender(); }
  };
}

/* ---------- 3. capture (full screen) ---------- */
function levelFromOrientation(e, backCamera) {
  if (e.beta == null || e.gamma == null) return null;
  const R = Math.PI / 180, b = e.beta * R, g = e.gamma * R;
  const up = { x: -Math.sin(g) * Math.cos(b), y: Math.sin(b), z: Math.cos(g) * Math.cos(b) };
  const pitch = Math.asin(Math.max(-1, Math.min(1, backCamera ? -up.z : up.z))) / R; // optical axis above (+) or below (−) horizontal
  const ang = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * R;
  const imgUp = { x: -Math.sin(ang), y: Math.cos(ang) }, imgRight = { x: Math.cos(ang), y: Math.sin(ang) };
  const roll = Math.atan2(up.x * imgRight.x + up.y * imgRight.y, up.x * imgUp.x + up.y * imgUp.y) / R;
  return { pitch, roll };
}

/**
 * runCapture(draft) → Promise<{ ok, blob, mime, width, height, fps, durationS, live: {frames, strokes, cadence}, calT } | null>
 * State machine: preview → waiting (rider gets on, cadence settles) → countdown → recording → checking → done / retry.
 */
function runCapture(d) {
  return new Promise((resolve) => {
    const T = C.triggers, F = C.framing, V = Settings.v;
    const ui = el(`<div class="capture" role="dialog" aria-label="Camera">
      <div class="stage"><video playsinline muted autoplay></video><canvas class="overlay"></canvas>${framingGuideSVG()}<div class="bigcount" hidden></div>
        <div class="hud-top"><button class="btn sm" id="cx">${icon('x')}Close</button>
          <div class="row wrap" style="justify-content:flex-end"><span class="pill" id="cfps"></span><span class="pill" id="clevel" hidden></span><span class="pill" id="cpill">Camera</span><button class="icon-btn" id="cflip" title="Switch camera">${icon('flip')}</button></div></div>
      </div>
      <div class="hud-bottom"><div class="status"><div class="big" id="cbig">Starting the camera…</div><div class="small" id="csmall"></div></div>
        <div class="checklist" id="cchk"></div>
        <div class="btn-row" style="justify-content:center"><button class="btn primary lg" id="cstart" disabled>${icon('play')}Start</button><button class="btn lg" id="cretry" hidden>${icon('refresh')}Try again</button><button class="btn primary lg" id="ccont" hidden>Continue ${icon('chevR')}</button></div>
      </div></div>`);
    document.body.appendChild(ui);
    document.body.style.overflow = 'hidden';
    const video = $('video', ui), canvas = $('canvas.overlay', ui), ctx = canvas.getContext('2d');
    const big = $('#cbig', ui), small = $('#csmall', ui), pill = $('#cpill', ui), chk = $('#cchk', ui), bigcount = $('.bigcount', ui);
    const setStatus = (b, s) => { big.textContent = b; small.textContent = s || ''; };
    const cap = {
      state: 'preview', stream: null, det: null, raf: 0, lastDetect: 0, lm: null, side: null,
      sc: new TF.StrokeCounter(), framingOkSince: null, framingBadSince: null, lowLightSince: null, lastHint: 0,
      recorder: null, chunks: [], recStart: 0, recFrames: [], recStrokes: 0, tries: 0, startedAt: 0, countStrokes: 0,
      level: null, wakeLock: null, closed: false, liveFps: 0, fpsCount: 0, fpsT: 0, sayCadenceAt: 0, timers: [],
    };
    const later = (fn, ms) => { const id = setTimeout(fn, ms); cap.timers.push(id); return id; };

    async function openCamera() {
      if (cap.stream) cap.stream.getTracks().forEach((t) => t.stop());
      const cons = { audio: false, video: { width: { ideal: C.capture.idealWidth }, height: { ideal: C.capture.idealHeight }, frameRate: { ideal: C.capture.idealFps } } };
      if (V.cameraId) cons.video.deviceId = { exact: V.cameraId }; else cons.video.facingMode = { ideal: V.cameraFacing };
      try { cap.stream = await navigator.mediaDevices.getUserMedia(cons); }
      catch (e) {
        if (V.cameraId) { Settings.set('cameraId', ''); return openCamera(); }
        setStatus('Camera not available', e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it for this site in your browser settings, then try again.' : (e.message || String(e)));
        return false;
      }
      video.srcObject = cap.stream;
      await video.play().catch(() => {});
      await new Promise((r) => (video.readyState >= 2 ? r() : video.addEventListener('loadeddata', r, { once: true })));
      const s = cap.stream.getVideoTracks()[0].getSettings();
      $('#cfps', ui).textContent = `${s.width || video.videoWidth}×${s.height || video.videoHeight} · ${Math.round(s.frameRate || 30)} fps`;
      return true;
    }

    async function init() {
      setStatus('Starting the camera…');
      if (!(await openCamera())) return;
      setStatus('Loading the tracker…', 'First time only: downloading the analysis engine.');
      try {
        cap.det = await loadPose('lite', (p, cached) => { if (!cached) setStatus('Loading the tracker…', `Downloading the analysis engine: ${Math.round(p * 100)}%`); });
      } catch (e) { setStatus('Could not load the tracker', `${e.message} Check the internet connection and try again.`); return; }
      $('#cstart', ui).disabled = false;
      setStatus('Frame the shot', 'Get the whole bike and your body in view, then tap Start.');
      loop();
    }

    function vToCanvas() {
      // Map normalised video coordinates to the canvas (object-fit: contain).
      const cw = canvas.clientWidth, ch = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(cw * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
      const vw = video.videoWidth || 16, vh = video.videoHeight || 9, s = Math.min(cw / vw, ch / vh);
      const ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
      return (p) => ({ x: (ox + p[0] * vw * s) * dpr, y: (oy + p[1] * vh * s) * dpr });
    }
    function drawSkeleton(lm, side) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!lm) return;
      const map = vToCanvas(), idx = TF.LM[side], dpr = window.devicePixelRatio || 1;
      const P = (n) => map(lm[idx[n]]);
      const seen = (n) => lm[idx[n]][2] >= F.visibilityThreshold;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const seg = (a, b) => { if (!seen(a) || !seen(b)) return; const p = P(a), q = P(b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); };
      ctx.strokeStyle = 'rgba(255,106,26,.95)'; ctx.lineWidth = 4 * dpr;
      [['shoulder', 'elbow'], ['elbow', 'wrist'], ['shoulder', 'hip'], ['hip', 'knee'], ['knee', 'ankle'], ['ankle', 'heel'], ['heel', 'toe'], ['ankle', 'toe']].forEach(([a, b]) => seg(a, b));
      for (const n of TF.REQUIRED_JOINTS) {
        const p = P(n); ctx.beginPath(); ctx.arc(p.x, p.y, 6 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = seen(n) ? '#fff' : 'rgba(240,80,110,.95)'; ctx.fill();
      }
    }
    function paintChecklist(fc) {
      const items = [['Rider', !!cap.lm], ['Knee', !fc.missing.includes('knee')], ['Ankle and foot', !fc.missing.includes('ankle') && !fc.missing.includes('toe')], ['Hip', !fc.missing.includes('hip')], ['Shoulder', !fc.missing.includes('shoulder')], ['Arm and hand', !fc.missing.includes('elbow') && !fc.missing.includes('wrist')]];
      if (cap.level) items.push(['Phone level', Math.abs(cap.level.pitch) <= 3 && Math.abs(cap.level.roll) <= 3]);
      if (video.videoHeight > video.videoWidth) items.push(['Landscape', false]);
      chk.innerHTML = items.map(([l, ok]) => `<span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✕'} ${esc(l)}</span>`).join('');
    }

    function loop() {
      if (cap.closed) return;
      cap.raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (!cap.det || video.readyState < 2 || now - cap.lastDetect < 1000 / C.capture.liveDetectFps) return;
      cap.lastDetect = now;
      let lm = null;
      try { lm = cap.det.detect(video, now); } catch (e) { console.warn(e); }
      cap.lm = lm;
      cap.fpsCount++; if (now - cap.fpsT > 1000) { cap.liveFps = cap.fpsCount * 1000 / (now - cap.fpsT); cap.fpsCount = 0; cap.fpsT = now; }
      const side = lm ? (cap.side || (TF.framingCheck(lm).side)) : 'left';
      const fc = TF.framingCheck(lm, side);
      if (lm && fc.ok && !cap.side) cap.side = fc.side;
      drawSkeleton(lm, side);
      paintChecklist(fc);
      // Framing timers.
      if (fc.ok) { cap.framingOkSince = cap.framingOkSince || now; cap.framingBadSince = null; } else { cap.framingBadSince = cap.framingBadSince || now; cap.framingOkSince = null; }
      if (lm && fc.meanVis < F.lowLightVisibility) cap.lowLightSince = cap.lowLightSince || now; else cap.lowLightSince = null;
      // Strokes from the camera-side foot.
      let ev = null;
      if (lm) { const toe = lm[TF.LM[side].toe]; if (toe[2] >= 0.4) ev = cap.sc.push(now / 1000, toe[1]); }
      if (cap.state === 'recording') {
        cap.recFrames.push({ t: (now - cap.recStart) / 1000, lm });
        if (ev) { cap.recStrokes++; Sound.beep('tick'); }
      }
      tick(now, fc, ev);
    }

    const framingOk = (now) => cap.framingOkSince && now - cap.framingOkSince >= F.stableMs;
    function hint(now, fc) {
      if (now - cap.lastHint < 8000) return;
      if (!cap.lm) { cap.lastHint = now; Sound.say("I can't see you yet. Check the camera can see the whole bike and your body."); return; }
      if (fc.missing.length) { cap.lastHint = now; Sound.say(`I can't see ${TF.describeMissing(fc.missing)}. Check you're fully in the frame.`); return; }
      if (cap.lowLightSince && now - cap.lowLightSince > F.lowLightMs) { cap.lastHint = now; Sound.say('It is a little dark. More light would help.'); }
    }

    function tick(now, fc, ev) {
      const cad = cap.sc.cadence();
      if (cap.state === 'preview') {
        if (!cap.lm) setStatus('Frame the shot', 'Nobody in view yet. Get the whole bike and your body in the frame.');
        else if (fc.missing.length) setStatus('Frame the shot', `Can't see ${TF.describeMissing(fc.missing)}.`);
        else setStatus('Looks good', 'Tap Start, then get on the bike.');
        pill.textContent = cap.lm ? 'Tracking' : 'Looking for you';
        return;
      }
      if (cap.state === 'waiting') {
        pill.textContent = Number.isFinite(cad) ? `${Math.round(cad)} rpm` : 'Waiting';
        if (!framingOk(now)) { setStatus('Get on the bike', fc.missing.length && cap.lm ? `Can't see ${TF.describeMissing(fc.missing)}.` : 'Start pedalling steadily when you are on.'); if (cap.framingBadSince && now - cap.framingBadSince > 4000) hint(now, fc); return; }
        if (V.startMode === 'seconds') return; // the countdown runs on its own timer
        if (V.startMode === 'beeps') { if (cap.sc.count >= 3) beginBeeps(); else setStatus('Start pedalling', 'The beeps begin once you are pedalling.'); return; }
        // strokes
        if (!cap.sc.stable()) { setStatus('Pedal steadily', Number.isFinite(cad) ? `Cadence ${Math.round(cad)} rpm. Waiting for it to settle.` : 'Start pedalling at a steady, moderate effort.'); return; }
        if (now > cap.sayCadenceAt) {
          cap.sayCadenceAt = Infinity;
          const advice = cad < T.cadenceLow ? ` That's a little slow; aim for about ${T.cadenceLow + 10}.` : cad > T.cadenceHigh ? ` That's quick; ease to about ${T.cadenceHigh - 10}.` : '';
          Sound.say(`Cadence ${Math.round(cad)}.${advice} Counting ${V.startStrokes} strokes.`);
        }
        cap.state = 'counting'; cap.countStrokes = 0;
        return;
      }
      if (cap.state === 'counting') {
        if (!fc.ok && cap.framingBadSince && now - cap.framingBadSince > 1500) { cap.state = 'waiting'; cap.sayCadenceAt = 0; Sound.beep('problem'); hint(0, fc); return; }
        if (ev) { cap.countStrokes++; Sound.beep('tick'); }
        const left = V.startStrokes - cap.countStrokes;
        bigcount.hidden = false; bigcount.textContent = String(Math.max(0, left));
        setStatus('Keep pedalling', `Recording in ${plural(Math.max(0, left), 'stroke')}.`);
        pill.textContent = `${Math.round(cad)} rpm`;
        if (left <= 0) startRecording();
        return;
      }
      if (cap.state === 'recording') {
        const el2 = (now - cap.recStart) / 1000;
        pill.innerHTML = `<span class="dot"></span> REC ${Math.floor(el2)} s`;
        pill.classList.add('rec');
        const goal = V.stopMode === 'strokes' ? `${cap.recStrokes} of ${V.stopStrokes} strokes` : `${Math.max(0, Math.ceil(V.stopSeconds - el2))} s left`;
        setStatus('Recording', `${goal} · ${Number.isFinite(cad) ? Math.round(cad) + ' rpm' : ''}`);
        const done = V.stopMode === 'strokes' ? cap.recStrokes >= V.stopStrokes : el2 >= V.stopSeconds;
        if (done || el2 >= C.capture.maxClipSeconds) stopRecording();
      }
    }

    async function onStart() {
      Sound.unlock();
      $('#cstart', ui).hidden = true;
      // Motion sensor for the level reading (iOS asks permission inside a tap).
      try {
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission();
      } catch { /* declined */ }
      window.addEventListener('deviceorientation', onOrient);
      try { cap.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* not supported */ }
      cap.state = 'waiting'; cap.sc.reset(); cap.framingOkSince = null;
      if (V.startMode === 'seconds') {
        Sound.say(`Recording starts in ${V.startSeconds} seconds. Get on the bike and start pedalling at a steady, moderate effort.`);
        countdown(V.startSeconds);
      } else if (V.startMode === 'beeps') {
        Sound.say(`Get on the bike and start pedalling at a steady, moderate effort. Recording starts after ${V.startBeeps} beeps.`);
      } else {
        Sound.say(`Get on the bike and start pedalling at a steady, moderate effort. I'll start recording after ${V.startStrokes} steady pedal strokes.`);
      }
    }
    function onOrient(e) {
      const lv = levelFromOrientation(e, V.cameraFacing !== 'user');
      if (!lv) return;
      cap.level = lv;
      const lp = $('#clevel', ui); lp.hidden = false;
      const ok = Math.abs(lv.pitch) <= 3 && Math.abs(lv.roll) <= 3;
      lp.textContent = ok ? 'Level ✓' : Math.abs(lv.pitch) > Math.abs(lv.roll) ? `Tilted ${Math.round(Math.abs(lv.pitch))}° ${lv.pitch > 0 ? 'up' : 'down'}` : `Rotated ${Math.round(Math.abs(lv.roll))}°`;
    }
    function countdown(n) {
      bigcount.hidden = false;
      const step = (k) => {
        if (cap.closed || cap.state !== 'waiting') return;
        bigcount.textContent = String(k);
        if (k <= 3 && k > 0) Sound.beep('count');
        if (k === 10 && n > 10) Sound.say('Ten seconds.', { interrupt: false });
        if (k <= 0) {
          if (framingOk(performance.now())) startRecording();
          else { setStatus('Waiting for a clear view', 'Recording starts as soon as I can see you clearly.'); const wait = () => { if (cap.closed || cap.state !== 'waiting') return; if (framingOk(performance.now())) startRecording(); else later(wait, 250); }; wait(); }
          return;
        }
        setStatus('Get on the bike', `Recording in ${k} s. Pedal at a steady, moderate effort.`);
        later(() => step(k - 1), 1000);
      };
      step(n);
    }
    function beginBeeps() {
      cap.state = 'beeping';
      let k = V.startBeeps;
      bigcount.hidden = false;
      const step = () => {
        if (cap.closed || cap.state !== 'beeping') return;
        if (k <= 0) { startRecording(); return; }
        bigcount.textContent = String(k); Sound.beep('count'); setStatus('Keep pedalling', `Recording after ${plural(k, 'beep')}.`);
        k--; later(step, C.triggers.beepIntervalMs);
      };
      step();
    }

    function startRecording() {
      bigcount.hidden = true;
      cap.chunks = []; cap.recFrames = []; cap.recStrokes = 0;
      const mime = C.capture.mimeTypes.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      try { cap.recorder = new MediaRecorder(cap.stream, mime ? { mimeType: mime, videoBitsPerSecond: C.capture.videoBitsPerSecond } : undefined); }
      catch (e) { setStatus('Recording is not supported here', e.message); return; }
      cap.mime = cap.recorder.mimeType || mime || 'video/webm';
      cap.recorder.ondataavailable = (e) => { if (e.data && e.data.size) cap.chunks.push(e.data); };
      cap.recorder.start(1000);
      cap.recStart = performance.now();
      cap.state = 'recording';
      Sound.beep('start');
      Sound.say('Recording. Keep pedalling steadily.');
    }
    function stopRecording() {
      cap.state = 'checking';
      pill.classList.remove('rec'); pill.textContent = 'Checking';
      Sound.beep('stop');
      const durationS = (performance.now() - cap.recStart) / 1000;
      cap.recorder.onstop = () => afterRecording(durationS);
      try { cap.recorder.stop(); } catch { afterRecording(durationS); }
    }
    function afterRecording(durationS) {
      const blob = new Blob(cap.chunks, { type: cap.mime });
      const q = TF.captureQuality(cap.recFrames, cap.recStrokes);
      const W = video.videoWidth, H = video.videoHeight;
      if (q.ok) {
        setStatus('Good capture', `${plural(cap.recStrokes, 'pedal stroke')} recorded. You can stop pedalling and get off the bike.`);
        Sound.say('Good capture. You can stop pedalling and get off the bike.');
        const s = cap.stream.getVideoTracks()[0].getSettings();
        cap.result = { ok: true, blob, mime: cap.mime, width: W, height: H, fps: s.frameRate || 30, durationS, live: { frames: cap.recFrames, strokes: cap.recStrokes, cadence: cap.sc.cadence(), fps: cap.liveFps }, calT: TF.pickCalibrationTime(cap.recFrames, W, H), level: cap.level, captureSettings: { startMode: V.startMode, stopMode: V.stopMode } };
        $('#ccont', ui).hidden = false;
        later(() => finish(cap.result), 5000);
        return;
      }
      Sound.beep('problem');
      cap.tries++;
      if (cap.tries <= C.capture.autoRetries) {
        const n = C.capture.retryCountdownSeconds;
        setStatus("Let's go again", `${q.text || q.speech} Keep pedalling; recording again in ${n} s.`);
        Sound.say(`${q.speech} Let's go again. Keep pedalling. Recording again in ${n} seconds.`);
        cap.state = 'waiting'; cap.framingOkSince = performance.now() - F.stableMs; countdown(n);
      } else {
        setStatus('That recording was not usable', `${q.text || q.speech} Check the set-up, then tap Try again.`);
        Sound.say(`${q.speech} Tap Try again when you're ready.`);
        $('#cretry', ui).hidden = false; cap.state = 'preview';
      }
    }

    function cleanup() {
      cap.closed = true;
      cancelAnimationFrame(cap.raf);
      cap.timers.forEach(clearTimeout);
      window.removeEventListener('deviceorientation', onOrient);
      try { if (cap.recorder && cap.recorder.state === 'recording') cap.recorder.stop(); } catch { /* ignore */ }
      if (cap.stream) cap.stream.getTracks().forEach((t) => t.stop());
      if (cap.det) cap.det.close();
      if (cap.wakeLock) cap.wakeLock.release().catch(() => {});
      Sound.stop();
      ui.remove(); document.body.style.overflow = '';
    }
    let finished = false;
    function finish(v) { if (finished) return; finished = true; cleanup(); resolve(v); }

    $('#cstart', ui).onclick = onStart;
    $('#ccont', ui).onclick = () => finish(cap.result);
    $('#cretry', ui).onclick = () => { $('#cretry', ui).hidden = true; cap.tries = 0; onStart(); };
    $('#cx', ui).onclick = async () => {
      if (cap.state === 'recording' || cap.state === 'counting' || cap.state === 'beeping') { if (!(await confirmDanger('Stop recording?', 'The recording in progress will be discarded.', 'Stop'))) return; }
      finish(null);
    };
    $('#cflip', ui).onclick = async () => {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput');
      if (devs.length < 2) { toast('Only one camera found.'); return; }
      const cur = cap.stream && cap.stream.getVideoTracks()[0].getSettings().deviceId;
      const i = devs.findIndex((x) => x.deviceId === cur);
      const next = devs[(i + 1) % devs.length];
      Settings.set('cameraId', next.deviceId);
      Settings.set('cameraFacing', /front|user|facetime/i.test(next.label) ? 'user' : 'environment');
      cap.side = null; cap.sc.reset();
      await openCamera();
    };
    setCleanup(() => finish(null));
    init();
  });
}

/* ---------- 4. calibrate ---------- */
const TAPS = [
  { key: 'rearAxle', label: 'Rear axle', help: 'The centre of the rear wheel.' },
  { key: 'tyreTop', label: 'Top of the rear tyre', help: 'The highest point of the rear tyre, directly above the axle.' },
  { key: 'tyreBack', label: 'Back of the rear tyre', help: 'The rearmost point of the rear tyre, level with the axle.' },
  { key: 'frontAxle', label: 'Front axle', help: 'The centre of the front wheel.' },
  { key: 'bb', label: 'Bottom bracket', help: 'The centre of the crank, where the crank arms meet the frame.' },
  { key: 'spindle', label: 'Pedal spindle', help: 'The centre of the pedal on the near side. The crank should be level and pointing forward; use ◀ ▶ to find that frame.' },
];

function lastCalibration(r) {
  const cutoff = Date.now() - C.calibration.reuseMaxHours * 3600e3;
  const s = r.sessions.slice().reverse().find((x) => Date.parse(x.created) > cutoff && x.clips[0] && x.clips[0].calibration && x.clips[0].calibration.taps && !x.sample);
  return s ? { session: s, cal: s.clips[0].calibration } : null;
}

async function renderCalibrate(main, r, d) {
  const cap = d.capture;
  main.innerHTML = `${wizardHead(3, 'Mark the bike', 'Pose tracking finds you, not the bike. Six taps let the app measure in millimetres and follow the pedal.')}
    <div class="calib">
      <div id="cal-reuse"></div>
      <div class="panel tight tap-prompt" id="cal-prompt"></div>
      <div class="tap-steps" id="cal-steps"></div>
      <div class="calib-stage" id="cal-stage"><canvas id="cal-canvas"></canvas></div>
      <div class="row wrap between">
        <div class="row"><button class="btn sm" id="cal-prev" title="Previous frame">◀ Frame</button><button class="btn sm" id="cal-next" title="Next frame">Frame ▶</button><span class="small faint" id="cal-t"></span></div>
        <div class="row"><button class="btn sm" id="cal-undo">${icon('undo')}Undo</button><button class="btn sm quiet" id="cal-skip">Skip taps</button></div>
      </div>
      <div id="cal-result"></div>
    </div>`;
  const stage = $('#cal-stage', main), canvas = $('#cal-canvas', main), ctx = canvas.getContext('2d');
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
  const url = URL.createObjectURL(cap.blob); video.src = url;
  setCleanup(() => URL.revokeObjectURL(url));
  await new Promise((res) => { video.onloadeddata = res; video.onerror = res; setTimeout(res, 6000); });
  if (!Number.isFinite(video.duration)) { video.currentTime = 1e9; await new Promise((res) => { video.onseeked = res; setTimeout(res, 1500); }); }
  const W = video.videoWidth || cap.width, H = video.videoHeight || cap.height;
  canvas.width = W; canvas.height = H;
  const st = { taps: {}, i: 0, t: cap.calT, frame: null };
  const dt = 1 / Math.max(24, Math.round(cap.fps || 30));
  async function showFrame(t) {
    st.t = Math.max(0, Math.min((Number.isFinite(video.duration) ? video.duration : cap.durationS) - 0.01, t));
    await new Promise((res) => { video.onseeked = res; video.currentTime = st.t; setTimeout(res, 2500); });
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmp.getContext('2d').drawImage(video, 0, 0, W, H);
    st.frame = tmp;
    $('#cal-t', main).textContent = `${st.t.toFixed(2)} s`; $('#cal-t', main).dataset.t = String(st.t);
    paint();
  }
  function paint(cursor) {
    ctx.drawImage(st.frame, 0, 0);
    const R = Math.max(5, W / 160);
    if (st.ghost) for (const [k, p] of Object.entries(st.ghost)) { ctx.strokeStyle = '#20D6B5'; ctx.lineWidth = R / 2; ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.6, 0, 7); ctx.stroke(); }
    for (const tp of TAPS) {
      const p = st.taps[tp.key]; if (!p) continue;
      ctx.fillStyle = '#FF6A1A'; ctx.strokeStyle = '#fff'; ctx.lineWidth = R / 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.fill(); ctx.stroke();
    }
    if (st.taps.bb && st.taps.spindle) { ctx.strokeStyle = 'rgba(32,214,181,.9)'; ctx.lineWidth = R / 2; ctx.beginPath(); ctx.moveTo(st.taps.bb.x, st.taps.bb.y); ctx.lineTo(st.taps.spindle.x, st.taps.spindle.y); ctx.stroke(); }
    if (cursor) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, W / 900); ctx.beginPath(); ctx.moveTo(cursor.x - R * 3, cursor.y); ctx.lineTo(cursor.x + R * 3, cursor.y); ctx.moveTo(cursor.x, cursor.y - R * 3); ctx.lineTo(cursor.x, cursor.y + R * 3); ctx.stroke(); }
  }
  function paintPrompt() {
    const cur = TAPS[st.i];
    $('#cal-steps', main).innerHTML = TAPS.map((t, i) => `<span class="${st.taps[t.key] ? 'done' : i === st.i ? 'cur' : ''}">${i + 1}. ${esc(t.label)}</span>`).join('');
    $('#cal-prompt', main).innerHTML = cur
      ? `${riderSVG({ rider: false, highlight: cur.key, label: cur.label })}<div><b>Tap ${st.i + 1} of ${TAPS.length}: ${esc(cur.label)}</b><div class="small muted">${esc(cur.help)} Hold to magnify, slide, release.</div></div>`
      : `<div></div><div><b>All six points marked.</b><div class="small muted">Check the result below.</div></div>`;
  }
  // Pointer: press shows a loupe; release places the point.
  const loupe = el('<div class="loupe" hidden><canvas width="264" height="264"></canvas></div>'); stage.appendChild(loupe);
  const lctx = $('canvas', loupe).getContext('2d');
  const toImg = (e) => { const b = canvas.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * W, y: (e.clientY - b.top) / b.height * H, bx: e.clientX - b.left, by: e.clientY - b.top }; };
  const showLoupe = (p) => {
    loupe.hidden = false; const z = 3, sz = 264, src = sz / z * (W / canvas.getBoundingClientRect().width);
    lctx.clearRect(0, 0, sz, sz); lctx.drawImage(canvas, p.x - src / 2, p.y - src / 2, src, src, 0, 0, sz, sz);
    lctx.strokeStyle = '#FF6A1A'; lctx.lineWidth = 2; lctx.beginPath(); lctx.moveTo(sz / 2 - 18, sz / 2); lctx.lineTo(sz / 2 + 18, sz / 2); lctx.moveTo(sz / 2, sz / 2 - 18); lctx.lineTo(sz / 2, sz / 2 + 18); lctx.stroke();
    const above = p.by > 150; loupe.style.left = `${Math.max(0, p.bx - 66)}px`; loupe.style.top = `${above ? p.by - 150 : p.by + 24}px`;
  };
  let pressing = false;
  canvas.addEventListener('pointerdown', (e) => { if (st.i >= TAPS.length) return; pressing = true; canvas.setPointerCapture(e.pointerId); const p = toImg(e); paint(p); showLoupe(p); });
  canvas.addEventListener('pointermove', (e) => { if (!pressing) return; const p = toImg(e); paint(p); showLoupe(p); });
  canvas.addEventListener('pointerup', (e) => {
    if (!pressing) return; pressing = false; loupe.hidden = true;
    const p = toImg(e);
    const k = TAPS[st.i].key;
    st.taps[k] = { x: p.x, y: p.y };
    if (k === 'spindle') st.spindleT = st.t;
    st.i = TAPS.findIndex((t) => !st.taps[t.key]); if (st.i < 0) st.i = TAPS.length;
    paint(); paintPrompt();
    if (st.i >= TAPS.length) finishTaps();
  });
  canvas.addEventListener('pointercancel', () => { pressing = false; loupe.hidden = true; paint(); });
  $('#cal-prev', main).onclick = () => showFrame(st.t - dt);
  $('#cal-next', main).onclick = () => showFrame(st.t + dt);
  $('#cal-undo', main).onclick = () => {
    const done = TAPS.filter((t) => st.taps[t.key]); if (!done.length) return;
    delete st.taps[done[done.length - 1].key]; st.i = TAPS.findIndex((t) => !st.taps[t.key]); $('#cal-result', main).innerHTML = ''; paint(); paintPrompt();
  };
  $('#cal-skip', main).onclick = async () => {
    if (!(await sheet({ title: 'Skip the taps?', body: '<p class="muted">Without them the angles are still measured, but there is no knee-over-pedal measurement and suggestions come without amounts in millimetres.</p>', actions: [{ label: 'Go back and tap', value: false, kind: 'quiet' }, { label: 'Skip', value: true }] }))) return;
    d.calibration = null; d.step = 'analyse'; d.rerender();
  };

  function finishTaps(reused) {
    const cal = TF.computeCalibration(st.taps, r.bike, H);
    cal.calT = st.spindleT ?? st.t;
    if (reused && reused.footSpindle) cal.footSpindle = reused.footSpindle;
    const u = Settings.v.units;
    const okc = (b) => (b ? `<span class="status-good">${icon('check').replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')}</span>` : `<span class="status-warn">${icon('alert').replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')}</span>`);
    $('#cal-result', main).innerHTML = `<div class="panel ${cal.ok ? '' : 'warn'} stack">
      <h2>${cal.ok ? 'Calibration looks good' : 'Check the camera set-up'}</h2>
      <dl class="kv">
        <dt>Scale</dt><dd>${okc(cal.agreement <= C.calibration.scaleAgreementMax)} Crank and wheel agree within ${(cal.agreement * 100).toFixed(1)}% (${(cal.pxPerMm).toFixed(3)} px per mm)</dd>
        <dt>Camera square</dt><dd>${okc(cal.squareRatio >= C.calibration.squareRatioMin)} Rear wheel ${Math.round(cal.squareRatio * 100)}% as wide as tall</dd>
        <dt>Camera height</dt><dd>${okc(cal.bbHeightFrac >= C.calibration.bbBandTop && cal.bbHeightFrac <= C.calibration.bbBandBottom)} Bottom bracket ${Math.round(cal.bbHeightFrac * 100)}% down the frame</dd>
        <dt>Bike level</dt><dd>${okc(Math.abs(cal.tiltDeg) <= 2)} ${Math.abs(cal.tiltDeg).toFixed(1)}° ${cal.tiltDeg > 0.05 ? 'front high' : cal.tiltDeg < -0.05 ? 'front low' : ''}</dd>
        ${cap.level ? `<dt>Phone level</dt><dd>${okc(Math.abs(cap.level.pitch) <= 3)} ${Math.abs(cap.level.pitch).toFixed(1)}° ${cap.level.pitch >= 0 ? 'up' : 'down'}</dd>` : ''}
      </dl>
      ${cal.warnings.map((w) => `<div class="banner warn">${icon('alert')}<div class="grow">${esc(w.text)}</div></div>`).join('')}
      <div class="btn-row"><button class="btn primary" id="cal-go">${cal.ok ? 'Analyse the recording' : 'Analyse anyway'} ${icon('chevR')}</button>
        <button class="btn" id="cal-redo">Redo taps</button>${!cal.ok ? `<button class="btn quiet" id="cal-rerecord">Fix the camera and record again</button>` : ''}</div>
    </div>`;
    $('#cal-go', main).onclick = () => { d.calibration = cal; d.step = 'analyse'; d.rerender(); };
    $('#cal-redo', main).onclick = () => { st.taps = {}; st.i = 0; st.ghost = null; $('#cal-result', main).innerHTML = ''; paint(); paintPrompt(); };
    const rr = $('#cal-rerecord', main); if (rr) rr.onclick = () => { d.step = 'setup'; d.rerender(); };
    $('#cal-result', main).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  await showFrame(cap.calT);
  paintPrompt();
  // Offer the last calibration when the camera may not have moved (retests).
  const last = lastCalibration(r);
  if (last && last.cal.taps && last.cal.footSpindle) {
    st.ghost = Object.fromEntries(Object.entries(last.cal.taps).filter(([k]) => k !== 'spindle'));
    paint();
    $('#cal-reuse', main).innerHTML = `<div class="banner info">${icon('info')}<div class="grow"><b>Camera not moved since ${esc(fmtDateTime(last.session.created))}?</b> The teal rings show that session's points. If they sit on the axles, tyre and bottom bracket, reuse them.</div>
      <div class="row"><button class="btn sm primary" id="cal-use">They line up</button><button class="btn sm quiet" id="cal-no">Tap again</button></div></div>`;
    $('#cal-use', main).onclick = () => {
      st.taps = JSON.parse(JSON.stringify(last.cal.taps)); st.spindleT = st.t; st.i = TAPS.length; st.ghost = null; $('#cal-reuse', main).innerHTML = '';
      paint(); paintPrompt(); finishTaps(last.cal);
    };
    $('#cal-no', main).onclick = () => { st.ghost = null; $('#cal-reuse', main).innerHTML = ''; paint(); };
  }
}

/* ---------- 5. analyse and save ---------- */
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
  const cap = d.capture;
  main.innerHTML = `${wizardHead(4, 'Analysing', 'Every frame is measured with the detailed tracker. Keep this screen open.')}
    <div class="panel stack"><div class="row"><span class="spinner"></span><b id="an-title">Preparing…</b></div>
      <div class="bar"><i id="an-bar" style="width:0%"></i></div><p class="small muted" id="an-sub"></p>
      <div><button class="btn sm quiet" id="an-cancel">Cancel</button></div></div>`;
  let cancelled = false;
  $('#an-cancel', main).onclick = () => { cancelled = true; };
  setCleanup(() => { cancelled = true; });
  const estStrokes = Math.max(1, cap.live.strokes || 1);
  const t0 = performance.now();
  try {
    const res = await analyseVideo(cap.blob, cap.mime, C.analysis.fps, (pr) => {
      if (cancelled) return;
      if (pr.phase === 'model') { $('#an-title', main).textContent = pr.cached ? 'Loading the tracker…' : 'Downloading the analysis engine (first time only)…'; $('#an-bar', main).style.width = `${Math.round(pr.p * 100)}%`; return; }
      const el2 = (performance.now() - t0) / 1000, left = pr.p > 0.05 ? el2 / pr.p * (1 - pr.p) : NaN;
      $('#an-title', main).textContent = `Analysing stroke ${Math.min(estStrokes, Math.floor(pr.p * estStrokes) + 1)} of ${estStrokes}`;
      $('#an-bar', main).style.width = `${Math.round(pr.p * 100)}%`;
      $('#an-sub', main).textContent = `Frame ${pr.i} of ${pr.total}${Number.isFinite(left) ? ` · about ${Math.max(1, Math.round(left))} s left` : ''}`;
    }, () => cancelled);
    const clip = {
      id: TF.uid('c'), view: 'side', hand: d.hand, mime: cap.mime, file: null, width: res.width, height: res.height, fps: cap.fps, analysedFps: C.analysis.fps,
      durationS: res.duration, calibration: d.calibration ? JSON.parse(JSON.stringify(d.calibration)) : null, frames: res.frames,
      live: { strokes: cap.live.strokes, cadence: cap.live.cadence, fps: cap.live.fps }, captureSettings: cap.captureSettings, level: cap.level || null,
      analysisSeconds: Math.round((performance.now() - t0) / 100) / 10,
    };
    const a = TF.analyseClip(clip);
    if (!a.ok) { d.error = a.error; d.step = 'failed'; d.rerender(); return; }
    if (clip.calibration) clip.calibration.footSpindle = a.calibration ? a.calibration.footSpindle : null;
    // Save the session.
    const s = TF.newSession(r);
    s.discomfort = JSON.parse(JSON.stringify(d.discomfort));
    s.retestOf = d.retestOf; s.change = d.change;
    s.profile = JSON.parse(JSON.stringify(r.profile)); s.bike = JSON.parse(JSON.stringify(r.bike));
    const ext = /mp4/.test(cap.mime) ? 'mp4' : 'webm';
    clip.file = TF.PATHS.clip(r.id, s.id, clip.id, ext);
    await putBlob(clip.file, cap.blob);
    s.clips.push(clip);
    const results = TF.buildResults(a, s.profile, clip.hand, s.discomfort, Settings.v.units);
    s.results = { snapshot: true, units: Settings.v.units, recommendation: results.recommendation, gate: results.gate, gauges: results.gauges, cadence: a.cadence, strokes: a.strokes.length };
    r.sessions.push(s);
    r.modified = s.modified = new Date().toISOString();
    S.cache.set(s.id, a);
    await saveFile();
    S.session = null;
    go(`#/session/${s.id}`);
    if (Settings.v.exportPrompt) setTimeout(() => offerExport(), 600);
  } catch (e) {
    if (cancelled || e.message === 'cancelled') { toast('Analysis cancelled.'); d.step = 'calibrate'; d.rerender(); return; }
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
  main.innerHTML = `${wizardHead(4, 'The analysis could not finish', '')}
    <div class="banner bad">${icon('alert')}<div class="grow"><b>${esc(d.error || 'Something went wrong.')}</b><br>Usually this means the rider was not clearly in view for long enough, or the recording was too short. Check the set-up and record again.</div></div>
    <div class="btn-row" style="margin-top:14px"><button class="btn primary" id="f-again">${icon('camera')}Record again</button><a class="btn quiet" href="#/help">Troubleshooting</a></div>`;
  $('#f-again', main).onclick = () => { d.step = 'setup'; d.rerender(); };
}
