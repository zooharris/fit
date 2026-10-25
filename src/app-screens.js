/* ==========================================================================
   Screens: welcome / home, rider profile, history, settings, help
   ========================================================================== */
const CAPS = compatibility();

function bikeSummary(r) {
  const p = r.profile, b = r.bike;
  const hands = (p.hands || []).map((h) => TF.HAND_POSITIONS[h]).join(', ');
  const wheel = b.wheel === 'custom' ? `${U.len(b.wheelDiameterMm, 'length')} wheel` : (TF.WHEELS[b.wheel] || {}).label;
  return [TF.BIKE_TYPES[p.bikeType]?.label, TF.GOALS[p.goal], hands, `${U.len(b.crankLength, 'length')} cranks`, wheel].filter(Boolean).join(' · ');
}

function compatBanners() {
  const out = [];
  if (!CAPS.secure) out.push(`<div class="banner bad">${icon('alert')}<div class="grow"><b>The camera needs a secure (https) address.</b> Open Tango Fitter from its https link to record. You can still review fit files here.</div></div>`);
  else if (!CAPS.canRecord) out.push(`<div class="banner warn">${icon('alert')}<div class="grow"><b>This browser can't record.</b> It is missing ${[!CAPS.camera && 'camera access', !CAPS.recorder && 'video recording', !CAPS.wasm && 'WebAssembly'].filter(Boolean).join(', ')}. You can review and export fits; record on an up-to-date iPhone, iPad or laptop.</div></div>`);
  if (CAPS.old) out.push(`<div class="banner warn">${icon('alert')}<div class="grow">This browser version is older than Tango Fitter supports (iOS ${C.compatibility.minIOS}, Safari ${C.compatibility.minSafari}, Chrome ${C.compatibility.minChrome}). Some things may not work.</div></div>`);
  return out.join('');
}

/* ---------- welcome (no file open) ---------- */
function renderWelcome(main) {
  main.innerHTML = `
    ${compatBanners()}
    <section class="hero-grid">
      <div class="hero">
        <div class="brand-hero">${logoMarkSVG(56)}<span class="wordmark"><b>Tango</b><span>Fitter</span></span></div>
        <h1>A precise bike fit from your phone's camera.</h1>
        <p>Film yourself pedalling on a trainer. Tango Fitter tracks your joints, measures the angles a professional fitter uses, and tells you the one change to make next, then checks it with a retest.</p>
        <div class="btn-row">
          <button class="btn primary lg" id="w-new">${icon('plus')}Start a new fit file</button>
          <button class="btn lg" id="w-open">${icon('upload')}Open a fit file</button>
          <button class="btn quiet lg" id="w-sample">Explore a sample fit</button>
        </div>
      </div>
      <div class="hero-art">${riderSVG({ angles: true, label: 'Rider on a bike with knee, hip and elbow angles measured' })}</div>
    </section>
    <div class="steps3 section">
      <div class="panel"><span class="n">1</span><b>Film</b><span class="muted small">Phone on a stand, 2.5–3 m from the bike. Voice prompts guide you hands-free while you pedal.</span></div>
      <div class="panel"><span class="n">2</span><b>Measure</b><span class="muted small">Knee, hip, back, shoulder, elbow, wrist and ankle angles, and knee over pedal spindle, averaged over every stroke.</span></div>
      <div class="panel"><span class="n">3</span><b>Adjust</b><span class="muted small">One change at a time, with a measured amount, then a retest to confirm it.</span></div>
    </div>
    <p class="small faint section">Everything stays on this device. Nothing is uploaded; you keep your fits in a file you can save, send and open anywhere.</p>`;
  $('#w-new', main).onclick = () => newFileFlow();
  $('#w-open', main).onclick = () => openFileFlow();
  $('#w-sample', main).onclick = async () => { const s = await createSampleFile(); toast('Sample fit created. It is made from a simulated rider.'); go(`#/session/${s.id}`); };
}

/* ---------- home ---------- */
route('/', async (main) => {
  if (!S.file) { renderWelcome(main); return; }
  const r = rider();
  if (!r) { go('#/rider/new'); return; }
  const sessions = r.sessions.slice().sort((a, b) => (a.created < b.created ? 1 : -1));
  const last = sessions[0];
  let lastCard = '';
  if (last) {
    const res = sessionResults(r, last);
    const rec = res && res.recommendation && res.recommendation.current;
    lastCard = `
      <div class="panel ${rec ? 'accent' : ''} reco">
        <div class="eyebrow"><span class="caption">Latest fit · ${esc(fmtDate(last.created))}</span>${last.sample ? '<span class="tag teal">Sample</span>' : ''}</div>
        ${rec ? `<div class="action">${esc(rec.text)}</div><p class="why">${esc(rec.why)}</p>` : res ? `<div class="action" style="color:var(--good)">Saddle position is in range</div><p class="why">${res.recommendation && res.recommendation.later.length ? 'Reach, drop and the other checks come in the next version; see the results for the measurements.' : 'Your measurements are within the target ranges for your bike and riding style.'}</p>` : '<p class="why">This session has no results yet.</p>'}
        <div class="btn-row">
          ${rec ? `<a class="btn primary" href="#/session/new?retest=${last.id}">${icon('refresh')}I've made the change — retest</a>` : `<a class="btn primary" href="#/session/new">${icon('camera')}New fit session</a>`}
          <a class="btn" href="#/session/${last.id}">See results</a>
        </div>
      </div>`;
  }
  main.innerHTML = `
    ${compatBanners()}
    <div class="page-head"><div><h1>${esc(r.name)}</h1><div class="sub">${esc(bikeSummary(r))}</div></div>
      <div class="btn-row"><a class="btn sm" href="#/rider/${r.id}">${icon('edit')}Edit profile</a></div></div>
    ${unexported() ? `<div class="banner warn" style="margin-bottom:14px">${icon('alert')}<div class="grow"><b>Not exported yet.</b> Changes since the last export are only on this device; the browser can clear its storage. Export to keep a permanent copy.</div><button class="btn sm" id="h-export">${icon('download')}Export</button></div>` : ''}
    ${CAPS.ios && !CAPS.standalone && !S.meta.hideInstallTip ? `<div class="banner info" style="margin-bottom:14px">${icon('info')}<div class="grow">Tip: tap <b>Share → Add to Home Screen</b>. Tango Fitter then opens full screen, and iOS keeps its storage instead of clearing it after a week without use.</div><button class="btn sm quiet" id="h-tip">Dismiss</button></div>` : ''}
    ${last ? lastCard : `
      <div class="panel accent">
        <div class="caption">Your first fit</div>
        <h2 style="margin:6px 0 8px">Ready when you are</h2>
        <p class="muted">You'll answer a few questions, set the phone up beside your bike, pedal for about a minute while the app guides you by voice, then tap six points on the bike so the app can measure in ${Settings.v.units === 'imperial' ? 'inches' : 'millimetres'}.</p>
        <div class="btn-row" style="margin-top:14px"><a class="btn primary lg" href="#/session/new">${icon('camera')}Start a fit session</a><a class="btn quiet" href="#/help">How it works</a></div>
      </div>`}
    ${sessions.length ? `<div class="section"><div class="section-head"><h2>Recent sessions</h2><a class="btn sm quiet" href="#/history">All history ${icon('chevR')}</a></div>
      <div class="list">${sessions.slice(0, 4).map((s) => sessionRow(r, s)).join('')}</div></div>` : ''}
    ${last ? `<div class="section"><a class="btn" href="#/session/new">${icon('camera')}New fit session</a></div>` : ''}`;
  const ex = $('#h-export', main); if (ex) ex.onclick = () => exportFlow();
  const tip = $('#h-tip', main); if (tip) tip.onclick = async () => { S.meta.hideInstallTip = true; await saveMeta(); render(); };
}, { nav: 'fit' });

function sessionRow(r, s, showRider) {
  const res = sessionResults(r, s);
  const rec = res && res.recommendation && res.recommendation.current;
  const ke = res && res.gauges.find((g) => g.metric === 'kneeExtension');
  const clip = s.clips[0];
  const hand = clip ? TF.HAND_POSITIONS[clip.hand] : '';
  const headline = !res ? 'No results' : rec ? rec.action : 'Saddle position in range';
  return `<a class="list-item" href="#/session/${s.id}">
    <span class="grow"><span class="title">${esc(fmtDateTime(s.created))}${s.sample ? ' <span class="tag teal">Sample</span>' : ''}${s.retestOf ? ' <span class="tag">Retest</span>' : ''}</span><br>
    <span class="sub">${showRider ? `${esc(r.name)} · ` : ''}${esc(headline)}${hand ? ` · ${esc(hand)}` : ''}${ke && TF.finite(ke.value) ? ` · knee ${Math.round(ke.value)}°` : ''}</span></span>
    ${icon('chevR', 'chev')}</a>`;
}

/** Results for a session, recomputed from its frames (so units and wording follow current settings). */
function sessionAnalysis(s) {
  if (S.cache.has(s.id)) return S.cache.get(s.id);
  const clip = s.clips[0];
  if (!clip || !clip.frames || !clip.frames.length) return null;
  const a = TF.analyseClip(Object.assign({}, clip, { calibration: clip.calibration ? JSON.parse(JSON.stringify(clip.calibration)) : null }));
  S.cache.set(s.id, a);
  return a;
}
function sessionResults(r, s) {
  const a = sessionAnalysis(s);
  if (!a || !a.ok) return null;
  const res = TF.buildResults(a, s.profile || r.profile, (s.clips[0] || {}).hand, s.discomfort, Settings.v.units);
  res.cadence = a.cadence; res.strokes = a.strokes.length;
  return res;
}

/* ---------- rider profile ---------- */
route('/rider/:id', async (main, { id }) => {
  const isNew = id === 'new';
  const existing = isNew ? null : S.file.riders.find((r) => r.id === id);
  if (!isNew && !existing) { go('#/'); return; }
  const r = existing ? JSON.parse(JSON.stringify(existing)) : TF.newRider(S.file.riders.length ? '' : '');
  const p = r.profile, b = r.bike;
  const bikeChips = Object.entries(TF.BIKE_TYPES).map(([k, v]) => `<button type="button" class="chip" data-bike="${k}">${esc(v.label)}</button>`).join('');
  main.innerHTML = `
    <div class="page-head"><div><h1>${isNew ? 'Add a rider' : 'Rider profile'}</h1><div class="sub">The bike and goal set the target ranges your measurements are compared with.</div></div></div>
    <form id="rf" class="stack" novalidate>
      <div class="panel stack">
        <div class="field"><label for="r-name">Rider name</label><input id="r-name" required value="${esc(r.name === 'Rider' ? '' : r.name)}" placeholder="e.g. Todd" autocomplete="off"></div>
      </div>
      <div class="panel stack">
        <h2>Bike and riding</h2>
        <div class="field"><span class="label">Bike type</span><div class="chips" id="r-bike">${bikeChips}</div></div>
        <div class="field"><span class="label">Riding goal</span><div class="chips" id="r-goal"></div><span class="hint" id="r-goal-hint"></span></div>
        <div class="field"><span class="label">Hand positions you use</span><div class="chips" id="r-hands"></div><span class="hint">Tap in order of use: the first is your main position and is the one recorded in this version.</span></div>
        <div class="form">
          <div class="field"><label for="r-crank">Crank length</label><select id="r-crank">${TF.CRANK_LENGTHS.map((c) => `<option value="${c}">${c} mm</option>`).join('')}</select><span class="hint">Stamped on the inside of the crank arm.</span></div>
          <div class="field"><label for="r-wheel">Wheel and tyre</label><select id="r-wheel">${Object.entries(TF.WHEELS).map(([k, w]) => `<option value="${k}">${esc(w.label)}</option>`).join('')}</select><span class="hint">Printed on the tyre sidewall.</span></div>
          <div class="field" id="r-wd-wrap" hidden><label for="r-wd">Wheel outer diameter</label><div class="input-unit"><input id="r-wd" inputmode="decimal" type="number" step="0.1"><span>${U.lenLabel()}</span></div><span class="hint">Measure across the whole wheel including the tyre.</span></div>
          <div class="field"><label for="r-bikename">Bike name <span class="faint">(optional)</span></label><input id="r-bikename" value="${esc(b.name)}" placeholder="e.g. Pinarello" autocomplete="off"></div>
        </div>
      </div>
      <details class="panel more" ${p.height || p.inseam || p.age || p.flexibility ? 'open' : ''}>
        <summary>${icon('chevR')}More about the rider <span class="faint">(optional)</span></summary>
        <div class="stack" style="margin-top:12px">
          <div class="form">
            <div class="field"><label for="r-height">Height</label><div class="input-unit"><input id="r-height" type="number" inputmode="decimal" step="0.1" value="${esc(U.heightToInput(p.height))}"><span>${U.heightLabel()}</span></div></div>
            <div class="field"><label for="r-inseam">Inseam</label><div class="input-unit"><input id="r-inseam" type="number" inputmode="decimal" step="0.1" value="${esc(U.heightToInput(p.inseam))}"><span>${U.heightLabel()}</span></div></div>
            <div class="field"><label for="r-age">Age</label><input id="r-age" type="number" inputmode="numeric" value="${esc(p.age ?? '')}"></div>
            <div class="field"><label for="r-sex">Sex</label><select id="r-sex"><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option></select></div>
          </div>
          <div class="field"><span class="label">Flexibility: with straight knees, can you touch your toes?</span>
            <div class="seg" id="r-flex"><button type="button" data-v="easily">Easily</button><button type="button" data-v="nearly">Nearly</button><button type="button" data-v="no">No</button><button type="button" data-v="">Skip</button></div>
            <span class="hint">Less flexible riders get slightly more open hip and back targets.</span></div>
        </div>
      </details>
      <div class="btn-row"><button type="submit" class="btn primary">${isNew ? 'Add rider' : 'Save'}</button><a class="btn quiet" href="#/">Cancel</a>
        ${!isNew ? `<span style="flex:1"></span><button type="button" class="btn danger" id="r-del">${icon('trash')}Remove rider</button>` : ''}</div>
    </form>`;

  const state = { bikeType: p.bikeType, goal: p.goal, hands: (p.hands || []).slice(), flexibility: p.flexibility || '' };
  const paint = () => {
    $$('#r-bike .chip', main).forEach((c) => c.classList.toggle('on', c.dataset.bike === state.bikeType));
    const bt = TF.BIKE_TYPES[state.bikeType];
    if (!bt.goals.includes(state.goal)) state.goal = bt.goals[Math.min(bt.goals.length - 1, 2)];
    $('#r-goal', main).innerHTML = bt.goals.map((g) => `<button type="button" class="chip ${g === state.goal ? 'on' : ''}" data-goal="${g}">${esc(TF.GOALS[g])}</button>`).join('');
    $('#r-goal-hint', main).textContent = { race: 'Low and long; for racing.', performance: 'Fast but sustainable for long efforts.', endurance: 'Comfortable for long days; the usual choice.', casual: 'Relaxed, more upright.', upright: 'Sitting tall; for cruising and commuting.' }[state.goal] || '';
    state.hands = state.hands.filter((h) => bt.hands.includes(h));
    if (!state.hands.length) state.hands = [bt.hands[0]];
    $('#r-hands', main).innerHTML = bt.hands.map((h) => { const i = state.hands.indexOf(h); return `<button type="button" class="chip ${i >= 0 ? 'on' : ''}" data-hand="${h}">${i >= 0 ? `<span class="ord">${i + 1}</span>` : ''}${esc(TF.HAND_POSITIONS[h])}</button>`; }).join('');
    $$('#r-goal .chip', main).forEach((c) => (c.onclick = () => { state.goal = c.dataset.goal; paint(); }));
    $$('#r-hands .chip', main).forEach((c) => (c.onclick = () => { const h = c.dataset.hand; const i = state.hands.indexOf(h); if (i >= 0) { if (state.hands.length > 1) state.hands.splice(i, 1); } else state.hands.push(h); paint(); }));
    $$('#r-flex button', main).forEach((x) => x.classList.toggle('on', x.dataset.v === state.flexibility));
  };
  $$('#r-bike .chip', main).forEach((c) => (c.onclick = () => { state.bikeType = c.dataset.bike; paint(); }));
  $$('#r-flex button', main).forEach((x) => (x.onclick = () => { state.flexibility = x.dataset.v; paint(); }));
  const crankSel = $('#r-crank', main);
  if (!TF.CRANK_LENGTHS.includes(Number(b.crankLength))) crankSel.insertAdjacentHTML('beforeend', `<option value="${b.crankLength}">${b.crankLength} mm</option>`);
  crankSel.value = String(b.crankLength);
  const wheelSel = $('#r-wheel', main); wheelSel.value = b.wheel || C.calibration.defaultWheel;
  const wd = () => { $('#r-wd-wrap', main).hidden = wheelSel.value !== 'custom'; };
  wheelSel.onchange = wd; wd();
  if (b.wheelDiameterMm) $('#r-wd', main).value = U.isImp() ? (b.wheelDiameterMm / 25.4).toFixed(2) : Math.round(b.wheelDiameterMm);
  $('#r-sex', main).value = p.sex || '';
  paint();

  $('#rf', main).onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#r-name', main).value.trim();
    if (!name) { $('#r-name', main).focus(); toast('Please enter the rider’s name.'); return; }
    let wheelD = null;
    if (wheelSel.value === 'custom') {
      const v = Number($('#r-wd', main).value);
      wheelD = U.isImp() ? v * 25.4 : v;
      if (!(wheelD > 300 && wheelD < 900)) { toast('Enter the wheel’s outer diameter (between 300 and 900 mm).'); $('#r-wd', main).focus(); return; }
    }
    r.name = name;
    Object.assign(r.profile, { bikeType: state.bikeType, goal: state.goal, hands: state.hands, flexibility: state.flexibility,
      height: U.heightFromInput($('#r-height', main).value), inseam: U.heightFromInput($('#r-inseam', main).value),
      age: $('#r-age', main).value ? Number($('#r-age', main).value) : null, sex: $('#r-sex', main).value });
    Object.assign(r.bike, { crankLength: Number(crankSel.value), wheel: wheelSel.value, wheelDiameterMm: wheelD, name: $('#r-bikename', main).value.trim() });
    r.modified = new Date().toISOString();
    if (isNew) S.file.riders.push(r); else Object.assign(existing, r, { sessions: existing.sessions });
    S.riderId = r.id;
    await saveFile();
    toast(isNew ? `Added ${esc(name)}.` : 'Profile saved.');
    go('#/');
  };
  const del = $('#r-del', main);
  if (del) del.onclick = async () => {
    const n = existing.sessions.length;
    if (!(await confirmDanger(`Remove ${existing.name}?`, `This removes ${esc(existing.name)} and ${plural(n, 'session')} from “${esc(S.file.name)}” on this device. Copies already exported are not affected.`, 'Remove rider'))) return;
    for (const s of existing.sessions) await deleteBlobs(`riders/${existing.id}/sessions/${s.id}/`);
    S.file.riders = S.file.riders.filter((x) => x.id !== existing.id);
    S.riderId = S.file.riders[0] ? S.file.riders[0].id : null;
    await saveFile();
    toast('Rider removed.');
    go('#/');
  };
}, { needsFile: true, nav: 'fit' });

/* ---------- history ---------- */
route('/history', async (main) => {
  const r = rider();
  const showAll = S.meta.historyAll && S.file.riders.length > 1;
  const items = (showAll ? allSessions() : (r ? r.sessions.map((s) => ({ rider: r, session: s })) : []))
    .sort((a, b) => (a.session.created < b.session.created ? 1 : -1));
  main.innerHTML = `
    <div class="page-head"><div><h1>History</h1><div class="sub">${showAll ? 'Every rider in this file' : esc(r ? r.name : '')} · ${plural(items.length, 'session')}</div></div>
      ${S.file.riders.length > 1 ? `<div class="seg" id="hs"><button data-v="one">${esc(r ? r.name : 'This rider')}</button><button data-v="all">All riders</button></div>` : ''}</div>
    ${items.length ? `<div class="list">${items.map((x) => sessionRow(x.rider, x.session, showAll)).join('')}</div>`
      : `<div class="empty panel">${icon('history')}<p>No sessions yet.</p><a class="btn primary" style="margin-top:12px" href="#/session/new">${icon('camera')}Start a fit session</a></div>`}`;
  $$('#hs button', main).forEach((b) => { b.classList.toggle('on', (b.dataset.v === 'all') === !!showAll); b.onclick = async () => { S.meta.historyAll = b.dataset.v === 'all'; await saveMeta(); render(); }; });
}, { needsFile: true, nav: 'history' });

/* ---------- settings ---------- */
route('/settings', async (main) => {
  const v = Settings.v;
  const seg = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(([val, lab]) => `<button data-v="${val}" class="${String(val) === String(cur) ? 'on' : ''}">${esc(lab)}</button>`).join('')}</div>`;
  let sizes = null;
  main.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><div class="sub">These settings are kept on this device.</div></div></div>
    <div class="stack">
      <div class="panel stack"><h2>Display</h2>
        <div class="field"><span class="label">Units</span>${seg('s-units', [['metric', 'Metric (mm)'], ['imperial', 'Imperial (in)']], v.units)}</div>
        <div class="field"><span class="label">Theme</span>${seg('s-theme', [['system', 'Match device'], ['dark', 'Dark'], ['light', 'Light']], v.theme)}</div>
      </div>
      <div class="panel stack"><h2>Hands-free guidance</h2>
        <div class="field"><span class="label">Sound</span>${seg('s-audio', [['both', 'Voice and beeps'], ['voice', 'Voice only'], ['beeps', 'Beeps only']], v.audioMode)}
          <span class="hint">On iPhone, turn the ring/silent switch off and the volume up, or you will not hear the prompts.</span></div>
        <div><button class="btn sm" id="s-test">${icon('volume')}Test sound</button></div>
        <div class="field"><span class="label">Start recording</span>${seg('s-start', [['seconds', 'After a delay'], ['beeps', 'After beeps'], ['strokes', 'After pedal strokes']], v.startMode)}
          <div class="row wrap" style="margin-top:6px" id="s-start-n"></div></div>
        <div class="field"><span class="label">Stop recording</span>${seg('s-stop', [['seconds', 'After a time'], ['strokes', 'After pedal strokes']], v.stopMode)}
          <div class="row wrap" style="margin-top:6px" id="s-stop-n"></div></div>
        <details class="more"><summary>${icon('chevR')}What the beeps mean</summary><dl class="kv" style="margin-top:8px">${BEEP_LEGEND.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl></details>
      </div>
      ${S.file ? `<div class="panel stack"><h2>Fit file</h2>
        <dl class="kv"><dt>Name</dt><dd>${esc(S.file.name)} <button class="btn sm quiet" id="s-rename">Rename</button></dd>
          <dt>Contents</dt><dd>${plural(S.file.riders.length, 'rider')}, ${plural(allSessions().length, 'session')}</dd>
          <dt>Size</dt><dd id="s-size">…</dd>
          <dt>Last export</dt><dd>${S.meta.lastExportedAt ? esc(fmtDateTime(S.meta.lastExportedAt)) : 'Never'}${unexported() ? ' · <span class="status-warn">changes not exported</span>' : ''}</dd></dl>
        <p class="small muted">The browser keeps a working copy, but it can clear its storage. The exported .tango file is the permanent copy: it holds every rider, session, video, snapshot and report.</p>
        <div class="btn-row"><button class="btn primary" id="s-export">${icon('download')}Export (Full)</button><button class="btn" id="s-export-lite">Export Lite (no videos)</button><button class="btn" id="s-open">${icon('upload')}Open a file</button><button class="btn quiet" id="s-new">${icon('plus')}New file</button></div>
        <label class="switch"><input type="checkbox" id="s-prompt" ${v.exportPrompt ? 'checked' : ''}><span>Offer to export after each session</span></label>
      </div>
      <div class="panel stack"><h2>Riders</h2>
        <div class="list">${S.file.riders.map((r) => `<a class="list-item" href="#/rider/${r.id}"><span class="avatar">${esc(initials(r.name))}</span><span class="grow"><span class="title">${esc(r.name)}</span><br><span class="sub">${esc(bikeSummary(r))}</span></span>${icon('chevR', 'chev')}</a>`).join('')}</div>
        <div><a class="btn sm" href="#/rider/new">${icon('plus')}Add a rider</a></div>
      </div>` : ''}
      <div class="panel stack"><h2>About</h2>
        <dl class="kv"><dt>Version</dt><dd>${esc(C.app.name)} ${esc(C.app.version)}</dd>
          <dt>This browser</dt><dd>${CAPS.canRecord ? '<span class="status-good">Can record and analyse</span>' : '<span class="status-warn">Review only</span>'}${CAPS.ios ? ' · iPhone/iPad' : ''}${CAPS.standalone ? ' · Home Screen app' : ''}</dd>
          <dt>Analysis engine</dt><dd id="s-model">Checking…</dd></dl>
        <p class="small muted">Tango Fitter is a self-fit guide, not medical advice. Stop and see a professional fitter or a clinician for pain, numbness, injury or a large difference between your left and right sides.</p>
      </div>
    </div>`;
  const bindSeg = (id, key, after) => $$(`#${id} button`, main).forEach((b) => (b.onclick = () => { Settings.set(key, b.dataset.v); if (after) after(); render(); }));
  bindSeg('s-units', 'units'); bindSeg('s-theme', 'theme', applyTheme); bindSeg('s-audio', 'audioMode'); bindSeg('s-start', 'startMode'); bindSeg('s-stop', 'stopMode');
  const numField = (wrap, key, label, min, max) => {
    const f = el(`<label class="row small muted">${esc(label)} <input type="number" inputmode="numeric" min="${min}" max="${max}" value="${v[key]}" style="width:80px;min-height:36px;padding:6px 8px;border-radius:8px;border:1px solid var(--line-2);background:var(--bg)"></label>`);
    $('input', f).onchange = (e) => { const n = Math.max(min, Math.min(max, Math.round(Number(e.target.value) || v[key]))); e.target.value = n; Settings.set(key, n); };
    wrap.appendChild(f);
  };
  const sn = $('#s-start-n', main);
  if (v.startMode === 'seconds') numField(sn, 'startSeconds', 'Seconds after you tap Start', 5, 60);
  if (v.startMode === 'beeps') numField(sn, 'startBeeps', 'Number of beeps (one a second)', 3, 20);
  if (v.startMode === 'strokes') numField(sn, 'startStrokes', 'Steady strokes before recording', 3, 30);
  const st = $('#s-stop-n', main);
  if (v.stopMode === 'seconds') numField(st, 'stopSeconds', 'Seconds of recording', 10, C.capture.maxClipSeconds);
  if (v.stopMode === 'strokes') numField(st, 'stopStrokes', 'Strokes to record', C.triggers.minStrokes + 2, 50);
  $('#s-test', main).onclick = async () => { Sound.unlock(); Sound.beep('count'); await sleep(400); Sound.beep('start'); await Sound.say('This is how Tango Fitter will talk to you while you ride.'); };
  if (S.file) {
    $('#s-rename', main).onclick = async () => { const n = await promptText('Rename the fit file', 'File name', S.file.name); if (n) { S.file.name = n; await saveFile(); render(); } };
    $('#s-export', main).onclick = () => exportFlow('full');
    $('#s-export-lite', main).onclick = () => exportFlow('lite');
    $('#s-open', main).onclick = () => openFileFlow();
    $('#s-new', main).onclick = () => newFileFlow();
    $('#s-prompt', main).onchange = (e) => Settings.set('exportPrompt', e.target.checked);
    estimateSizes().then((sz) => { sizes = sz; const d = $('#s-size', main); if (d) d.textContent = `${mb(sz.full)} full · ${mb(sz.lite)} lite`; });
  }
  (async () => {
    let cached = false;
    try { const c = await caches.open('tango-models-v1'); cached = !!(await c.match(C.libraries.poseHeavy)) && !!(await c.match(C.libraries.poseLite)); } catch { /* none */ }
    const d = $('#s-model', main); if (d) d.textContent = cached ? 'Downloaded; works offline' : 'Downloads on first use (about 35 MB, once)';
  })();
}, { nav: 'settings' });

/* ---------- help ---------- */
route('/help', async (main) => {
  main.innerHTML = `<div class="help">
    <div class="page-head"><div><h1>Help</h1><div class="sub">How a fit works, and how to get good measurements.</div></div></div>
    <div class="panel"><b>In short:</b> <span class="muted">set the bike on a trainer, stand the phone 2.5–3 m away pointing square at the bike, pedal steadily while the app records, tap six points on the bike, then make the one change it suggests and retest.</span></div>
    <h2>Setting up</h2>
    <ul>
      <li><b>Trainer.</b> The bike must stay still and level for the whole recording. A rear-wheel or direct-drive trainer, or rollers with a front wheel riser, all work. Level the bike front to back.</li>
      <li><b>Which side.</b> Film the non-drive side (the side without the chainring) so the chainring does not hide your foot.</li>
      <li><b>Camera.</b> Landscape, 2.5–3 m away, pointing straight at the side of the bike, lens about level with the top of the wheels, and the phone level (not tilted up or down). Your whole body and both wheels must be in the frame.</li>
      <li><b>Clothing and light.</b> Fitted clothing in a colour that stands out from the background; no baggy shorts or jackets. Light from the camera's side, not behind you.</li>
      <li><b>Sound.</b> Volume up and, on iPhone, the silent switch off. The app talks you through the recording so you don't need to look at the screen.</li>
    </ul>
    <h2>Recording</h2>
    <p>Tap <b>Start</b>, walk to the bike, and start pedalling at a steady, moderate effort you could hold for an hour (about 80–95 rpm). By default the app waits until your cadence is steady, counts ${Settings.v.startStrokes} strokes, and records for ${Settings.v.stopSeconds} seconds. You can change both in Settings. If something goes wrong, for example your knee was out of view, it tells you and tries again by itself.</p>
    <details class="more"><summary>${icon('chevR')}What the beeps mean</summary><dl class="kv" style="margin-top:8px">${BEEP_LEGEND.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl></details>
    <h2>The six taps</h2>
    <p>Pose tracking finds your joints but cannot see the bike. After recording, the app shows a still frame with the crank level and asks you to tap: the rear axle, the top of the rear tyre, the back edge of the rear tyre, the front axle, the bottom bracket, and the pedal spindle. Hold your finger down to see a magnifier, slide to the exact point, and let go. From the crank length and wheel size you entered, these taps give the app its scale in millimetres, the bike's level, and the pedal position through the stroke. The two scales (wheel and crank) are checked against each other: if they disagree, the camera was not square to the bike.</p>
    <h2>Reading the results</h2>
    <p>Each measurement is shown against a target range for your bike, riding goal and hand position: <span class="status-good">green</span> is in range, <span class="status-warn">yellow</span> is close, <span class="status-bad">red</span> is outside. Every value also carries a confidence (three bars) based on how clearly the joints were seen and how steady the value was from stroke to stroke. Low-confidence values are greyed out and never drive a recommendation.</p>
    <p>The app recommends <b>one change at a time</b>, in the order fitters use because changes interact: saddle height first, then saddle fore/aft. Amounts are given as a range (for example “raise the saddle 5–10 mm”). Make the change, then tap <b>retest</b>. Reach, drop, bar width and cleats arrive in the next version; their measurements are already shown.</p>
    <h2>Discomfort and safety</h2>
    <p>The questions about discomfort help the app point at the measurements most often associated with where you feel it. The app never assumes discomfort is caused by your bike fit: if the related measurements are in range it says so, and lists other common causes. If you report severe discomfort, discomfort that lasts after rides, numbness, or a recent injury, it recommends seeing a clinician or professional fitter before changing anything.</p>
    <p><b>Tango Fitter is a self-fit guide, not medical advice.</b></p>
    <h2>Fit files</h2>
    <p>A fit file (.tango) holds riders, every session, the videos, snapshots and reports. It can hold a whole household. The app keeps a working copy on this device, but browsers can clear their storage, so export after each session (the app offers to). Open the file on any iPhone, iPad or computer; if the video format won't play on that device, the playback shows the tracked skeleton instead, with every measurement intact. <b>Lite</b> exports leave the videos out to keep the file small.</p>
    <h2>Troubleshooting</h2>
    <ul>
      <li><b>“Camera not allowed.”</b> Allow camera access for this site in the browser's settings (iPhone: Settings → Safari → Camera), then reload.</li>
      <li><b>No sound.</b> Volume up; iPhone silent switch off; tap Test sound in Settings.</li>
      <li><b>“I lost sight of your knee.”</b> Better light, more contrast between clothing and background, and check the whole body is in the frame.</li>
      <li><b>Scales disagree / wheel looks oval.</b> Turn the phone so it points straight at the side of the bike, and keep it level.</li>
      <li><b>First analysis is slow.</b> The analysis engine (about 35 MB) downloads once; after that it works offline.</li>
    </ul>
    <p class="small faint" style="margin-top:22px">${esc(C.app.name)} ${esc(C.app.version)}</p>
  </div>`;
}, { nav: 'help' });
