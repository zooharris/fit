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
  if (!Settings.v.introSeen) { go('#/intro'); return; }
  if (!S.file) { renderWelcome(main); return; }
  const r = rider();
  if (!r) { go('#/rider/new'); return; }
  const sessions = r.sessions.slice().sort((a, b) => (a.created < b.created ? 1 : -1));
  const last = sessions[0];
  let changeCard = '';
  if (last) {
    const res = sessionResults(r, last);
    const rec = res && res.recommendation && res.recommendation.current;
    const stillToDo = rec && rec.history && rec.history.status === 'notMade';
    changeCard = `
      <div class="panel ${rec && !stillToDo ? 'accent' : ''} reco">
        <div class="eyebrow"><span class="caption">${rec ? (stillToDo ? 'Still to do' : rec.kind === 'stop' ? 'Time for a professional' : 'Your next change') : 'Latest fit'} · ${esc(fmtDate(last.created))}</span>${last.sample ? '<span class="tag teal">Sample</span>' : ''}</div>
        ${rec ? `<div class="action">${esc(rec.text)}</div><p class="why">${esc(rec.why)}</p>` : res ? `<div class="action" style="color:var(--good)">Saddle position is in range</div><p class="why">Nothing to change on the saddle.</p>` : '<p class="why">This session has no results yet.</p>'}
        <div class="btn-row">${rec && rec.kind !== 'stop' && !last.sample ? `<a class="btn" href="#/session/new?retest=${last.id}">${icon('refresh')}Retest</a>` : ''}<a class="btn" href="#/session/${last.id}">Results</a></div>
      </div>`;
  }
  main.innerHTML = `
    ${compatBanners()}
    <div class="panel rider-card">
      <span class="avatar">${esc(initials(r.name))}</span>
      <div class="grow"><div class="title">${esc(r.name)}</div><div class="sub">${esc(bikeSummary(r))}</div></div>
      <a class="btn sm" href="#/rider/${r.id}">${icon('edit')}Edit</a>
    </div>
    ${unexported() ? `<div class="banner warn">${icon('alert')}<div class="grow"><b>Not exported yet.</b> The browser can clear its storage; export to keep a permanent copy.</div><button class="btn sm" id="h-export">${icon('download')}Export</button></div>` : ''}
    ${changeCard}
    <a class="btn primary lg block start-fit" href="#/session/new">${icon('camera')}Start a fit</a>
    ${!last ? `<p class="small muted">Set the phone beside your bike, mark eight points on the bike, then pedal for about a minute while the app guides you by voice. Fitting yourself or helping a friend, it works the same way.</p>` : ''}
    ${sessions.length ? `<div class="section"><div class="section-head"><h2>Recent sessions</h2><a class="btn sm quiet" href="#/sessions">All sessions ${icon('chevR')}</a></div>
      <div class="list">${sessions.slice(0, 3).map((x) => sessionRow(r, x)).join('')}</div></div>` : ''}`;
  const ex = $('#h-export', main); if (ex) ex.onclick = () => exportFlow();
}, { nav: 'fit' });

/* ---------- onboarding: three screens, first run and from Help ---------- */
route('/intro', async (main, { query }) => {
  const i = Math.max(0, Math.min(2, Number(query.get('i') || 0)));
  const screens = [
    { art: SETUP_ART.rig(), title: 'What you need', text: ['A trainer or rollers, a phone stand or shelf, and 2.5 to 3 metres of room beside the bike.', 'Sound on. Fit yourself, or help a friend: it works both ways.'] },
    { art: riderSVG({ angles: true, label: 'Rider on a bike with angles measured' }), title: 'How a fit goes', text: ['Place the phone so the bike sits in the outline, then mark eight points on the bike.', 'Ride for about a minute while the app talks you through it. You get one change to make, then a retest to check it.'] },
    { art: `<div class="intro-icon">${logoIconSVG(120)}</div>`, title: CAPS.ios ? 'Add it to your Home Screen' : 'Your fits stay with you', text: CAPS.ios ? ['In Safari, tap Share, then Add to Home Screen. Tango Fitter opens full screen and iOS keeps its storage.', 'Your fits stay on this device; export the fit file to keep a permanent copy.'] : ['Everything stays on this device. Nothing is uploaded.', 'Export the fit file to keep a permanent copy, and open it on any phone, tablet or computer.'] },
  ];
  const sc = screens[i];
  const done = async () => { Settings.set('introSeen', true); go(query.get('from') === 'help' ? '#/help' : '#/'); };
  main.innerHTML = `<div class="intro">
    <div class="progress-dots">${screens.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="intro-art">${sc.art}</div>
    <h1>${esc(sc.title)}</h1>
    ${sc.text.map((t) => `<p class="muted">${esc(t)}</p>`).join('')}
    <div class="btn-row">${i < 2 ? `<button class="btn primary lg" id="in-next">Next ${icon('chevR')}</button><button class="btn quiet" id="in-skip">Skip</button>` : `<button class="btn primary lg" id="in-done">Get started</button>`}</div>
  </div>`;
  const from = query.get('from') ? `&from=${query.get('from')}` : '';
  const nx = $('#in-next', main); if (nx) nx.onclick = () => go(`#/intro?i=${i + 1}${from}`);
  const sk = $('#in-skip', main); if (sk) sk.onclick = done;
  const dn = $('#in-done', main); if (dn) dn.onclick = done;
}, { nav: 'fit' });

function sessionRow(r, s, showRider) {
  return `<a class="list-item" href="#/session/${s.id}"><span class="grow">${sessionRowInner(r, s, showRider)}</span>${icon('chevR', 'chev')}</a>`;
}
function sessionRowInner(r, s, showRider) {
  const res = sessionResults(r, s);
  const rec = res && res.recommendation && res.recommendation.current;
  const ke = res && res.gauges.find((g) => g.metric === 'kneeExtension');
  const clip = s.clips[0];
  const hand = clip ? TF.HAND_POSITIONS[clip.hand] : '';
  const headline = !res ? 'No results' : rec ? (rec.kind === 'stop' ? 'See a professional' : rec.text.replace(/, then retest\.$/, '')) : 'Saddle position in range';
  return `<span class="title">${esc(fmtDateTime(s.created))}${s.sample ? ' <span class="tag teal">Sample</span>' : ''}${s.retestOf ? ' <span class="tag">Retest</span>' : ''}</span><br>
    <span class="sub">${showRider ? `${esc(r.name)} · ` : ''}${esc(headline)}${hand ? ` · ${esc(hand)}` : ''}${ke && TF.finite(ke.value) ? ` · knee extension ${Math.round(ke.value)}°` : ''}</span>`;
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
/** The rider's earlier sessions, oldest first, for the same hand position: what each recommended and measured. */
function historyFor(r, s) {
  const hand = (s.clips[0] || {}).hand;
  return r.sessions
    .filter((x) => x.id !== s.id && !x.sample && x.created < (s.created || '9') && x.results && (x.clips[0] || {}).hand === hand)
    .sort((a, b) => (a.created < b.created ? -1 : 1))
    .map((x) => TF.historyEntry(x.results, x.bikeMeasures, x.created));
}
function sessionResults(r, s) {
  const a = sessionAnalysis(s);
  if (!a || !a.ok) return null;
  const res = TF.buildResults(a, s.profile || r.profile, (s.clips[0] || {}).hand, s.discomfort, Settings.v.units, { history: historyFor(r, s), bikeMeasures: s.bikeMeasures });
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

/* ---------- sessions (brief D2) ---------- */
route('/history', async () => { go('#/sessions'); });
route('/sessions', async (main, { query }) => {
  const riders = S.file.riders;
  const cur = rider();
  const which = S.meta.sessionsRider === 'all' && riders.length > 1 ? 'all' : (cur ? cur.id : null);
  const items = (which === 'all' ? allSessions() : (cur ? cur.sessions.map((x) => ({ rider: cur, session: x })) : []))
    .sort((a, b) => (a.session.created < b.session.created ? 1 : -1));
  const selecting = query.get('select') === '1';
  const picked = new Set();
  const row = (x) => selecting
    ? `<label class="list-item pick"><input type="checkbox" data-id="${x.session.id}"><span class="grow">${sessionRowInner(x.rider, x.session, which === 'all')}</span></label>`
    : sessionRow(x.rider, x.session, which === 'all');
  main.innerHTML = `
    <div class="page-head"><div><h1>Sessions</h1><div class="sub">${which === 'all' ? 'Every rider in this file' : esc(cur ? cur.name : '')} · ${plural(items.length, 'session')}</div></div>
      ${items.length > 1 || selecting ? `<div class="row">${selecting ? '<a class="btn sm quiet" href="#/sessions">Done</a>' : `<a class="btn sm" href="#/sessions?select=1" id="ss-select">${icon('check')}Compare or delete</a>`}</div>` : ''}</div>
    ${riders.length > 1 ? `<div class="chips" id="ss-riders" style="margin-bottom:12px">${riders.map((r) => `<button class="chip ${which === r.id ? 'on' : ''}" data-r="${r.id}">${esc(r.name)}</button>`).join('')}<button class="chip ${which === 'all' ? 'on' : ''}" data-r="all">All riders</button></div>` : ''}
    ${selecting ? `<div class="select-bar panel tight"><span class="grow small muted" id="ss-count">Pick two sessions to compare, or any to delete.</span><button class="btn sm" id="ss-compare" disabled>Compare</button><button class="btn sm danger" id="ss-delete" disabled>${icon('trash')}Delete</button></div>` : ''}
    ${items.length ? `<div class="list">${items.map(row).join('')}</div>`
      : `<div class="empty panel">${icon('history')}<p>No sessions yet.</p><a class="btn primary" style="margin-top:12px" href="#/session/new">${icon('camera')}Start a fit</a></div>`}`;
  $$('#ss-riders .chip', main).forEach((b) => (b.onclick = async () => {
    if (b.dataset.r === 'all') S.meta.sessionsRider = 'all';
    else { S.meta.sessionsRider = 'one'; S.riderId = b.dataset.r; renderShell('sessions'); }
    await saveMeta(); render();
  }));
  if (!selecting) return;
  const paint = () => {
    $('#ss-count', main).textContent = picked.size ? `${plural(picked.size, 'session')} picked${picked.size === 2 ? '' : picked.size < 2 ? ' · pick two to compare' : ' · compare needs exactly two'}` : 'Pick two sessions to compare, or any to delete.';
    $('#ss-compare', main).disabled = picked.size !== 2;
    $('#ss-delete', main).disabled = picked.size === 0;
  };
  $$('input[data-id]', main).forEach((c) => (c.onchange = () => { if (c.checked) picked.add(c.dataset.id); else picked.delete(c.dataset.id); paint(); }));
  $('#ss-compare', main).onclick = () => { const [a, b] = [...picked]; go(`#/compare/${a}/${b}`); };
  $('#ss-delete', main).onclick = async () => {
    const list = [...picked].map(findSession).filter(Boolean);
    const names = list.map((f) => fmtDateTime(f.session.created)).join(', ');
    if (!(await confirmDanger(`Delete ${plural(list.length, 'session')}?`, `${esc(names)}: the sessions, with their videos, snapshots and reports, are removed from this device. Copies already exported are not affected.`, 'Delete'))) return;
    for (const f of list) {
      await deleteBlobs(`riders/${f.rider.id}/sessions/${f.session.id}/`);
      f.rider.sessions = f.rider.sessions.filter((x) => x.id !== f.session.id);
      S.cache.delete(f.session.id); S.cache.delete(`${f.session.id}:2`);
    }
    await saveFile();
    toast(`${plural(list.length, 'session')} deleted.`);
    go('#/sessions');
  };
  paint();
}, { needsFile: true, nav: 'sessions' });

/* ---------- settings: collapsible groups (brief D1) ---------- */
route('/settings', async (main) => {
  const v = Settings.v;
  const seg = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(([val, lab]) => `<button data-v="${val}" class="${String(val) === String(cur) ? 'on' : ''}">${esc(lab)}</button>`).join('')}</div>`;
  const start = v.startMode === 'strokes' ? `${v.startStrokes} strokes` : v.startMode === 'beeps' ? `${v.startBeeps} beeps` : `${v.startSeconds} s`;
  const stop = v.stopMode === 'strokes' ? `${v.stopStrokes} strokes` : `${v.stopSeconds} s`;
  const open = v.settingsOpen || 'display';
  const group = (key, title, value, body) => `<details class="panel group" data-g="${key}" ${open === key ? 'open' : ''}><summary><h2>${esc(title)}</h2><span class="hval">${esc(value)}</span>${icon('chevR')}</summary><div class="stack gbody">${body}</div></details>`;
  const fileVal = S.file ? `${S.file.name} · ${unexported() ? 'not exported' : 'exported'}` : 'No file open';
  main.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><div class="sub">Kept on this device. Tap a group to open it.</div></div></div>
    <div class="stack groups">
      ${group('display', 'Display', `${v.units === 'imperial' ? 'Imperial' : 'Metric'} · ${{ system: 'Match device', dark: 'Dark', light: 'Light' }[v.theme]}`, `
        <div class="field"><span class="label">Units</span>${seg('s-units', [['metric', 'Metric (mm)'], ['imperial', 'Imperial (in)']], v.units)}</div>
        <div class="field"><span class="label">Theme</span>${seg('s-theme', [['system', 'Match device'], ['dark', 'Dark'], ['light', 'Light']], v.theme)}</div>`)}
      ${group('sound', 'Sound and guidance', `${{ both: 'Voice and beeps', voice: 'Voice only', beeps: 'Beeps only' }[v.audioMode]} · replies ${v.voiceReplies ? 'by hand or voice' : 'by hand'}`, `
        <div class="field"><span class="label">Sound</span>${seg('s-audio', [['both', 'Voice and beeps'], ['voice', 'Voice only'], ['beeps', 'Beeps only']], v.audioMode)}
          <span class="hint">On iPhone, turn the silent switch off and the volume up, or you will not hear the prompts.</span></div>
        <div><button class="btn sm" id="s-test">${icon('volume')}Test sound</button></div>
        <label class="switch"><input type="checkbox" id="s-voice" ${v.voiceReplies ? 'checked' : ''}><span>Answer questions by voice too ("yes", "again", "no", "done")</span></label>
        <span class="hint">Raising a hand and tapping always work. ${'SpeechRecognition' in window || 'webkitSpeechRecognition' in window ? 'This browser can listen.' : 'This browser can’t listen, so the app asks for a raised hand instead.'}</span>
        <details class="more"><summary>${icon('chevR')}What the beeps mean</summary><dl class="kv" style="margin-top:8px">${BEEP_LEGEND.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl></details>`)}
      ${group('recording', 'Recording', `Start after ${start} · record ${stop}`, `
        <p class="small muted">These are the defaults; you can also change them on the riding screen, and the change is remembered.</p>
        <div class="field"><span class="label">Start recording</span>${seg('s-start', [['strokes', 'After steady strokes'], ['seconds', 'After a delay'], ['beeps', 'After beeps']], v.startMode)}
          <div class="row wrap" style="margin-top:6px" id="s-start-n"></div></div>
        <div class="field"><span class="label">Stop recording</span>${seg('s-stop', [['seconds', 'After a time'], ['strokes', 'After pedal strokes']], v.stopMode)}
          <div class="row wrap" style="margin-top:6px" id="s-stop-n"></div></div>
        <div class="field"><span class="label">Camera</span>${seg('s-facing', [['environment', 'Back camera'], ['user', 'Front camera']], v.cameraFacing)}
          <span class="hint">${v.cameraId ? 'A specific camera was chosen on the camera screen. <button class="btn sm quiet" id="s-camreset">Use the default</button>' : 'On a laptop or with several cameras, pick one with the Camera button on the camera screen.'}</span></div>
        ${S.file ? `<label class="switch"><input type="checkbox" id="s-prompt" ${v.exportPrompt ? 'checked' : ''}><span>Ask to export after each session</span></label>` : ''}`)}
      ${S.file ? group('file', 'Fit file', fileVal, `
        <dl class="kv"><dt>Name</dt><dd>${esc(S.file.name)} <button class="btn sm quiet" id="s-rename">Rename</button></dd>
          <dt>Contents</dt><dd>${plural(S.file.riders.length, 'rider')}, ${plural(allSessions().length, 'session')}</dd>
          <dt>Size</dt><dd id="s-size">…</dd>
          <dt>Last export</dt><dd>${S.meta.lastExportedAt ? esc(fmtDateTime(S.meta.lastExportedAt)) : 'Never'}${unexported() ? ' · <span class="status-warn">changes not exported</span>' : ''}</dd></dl>
        <p class="small muted">The browser keeps a working copy, but it can clear its storage. The exported .tango file is the permanent copy: every rider, session, video, snapshot and report.</p>
        <div class="btn-row"><button class="btn" id="s-export">${icon('download')}Export (Full)</button><button class="btn" id="s-export-lite">Export Lite (no videos)</button><button class="btn" id="s-open">${icon('upload')}Open a file</button><button class="btn quiet" id="s-new">${icon('plus')}New file</button></div>`) : ''}
      ${S.file ? group('riders', 'Riders', S.file.riders.map((r) => r.name).join(', ') || 'None', `
        <div class="list">${S.file.riders.map((r) => `<a class="list-item" href="#/rider/${r.id}"><span class="avatar">${esc(initials(r.name))}</span><span class="grow"><span class="title">${esc(r.name)}</span><br><span class="sub">${esc(bikeSummary(r))}</span></span>${icon('chevR', 'chev')}</a>`).join('')}</div>
        <div><a class="btn sm" href="#/rider/new">${icon('plus')}Add a rider</a></div>`) : ''}
      ${group('about', 'About', `${C.app.name} ${C.app.version}`, `
        <dl class="kv"><dt>Version</dt><dd>${esc(C.app.name)} ${esc(C.app.version)}</dd>
          <dt>This browser</dt><dd>${CAPS.canRecord ? '<span class="status-good">Can record and analyse</span>' : '<span class="status-warn">Review only</span>'}${CAPS.ios ? ' · iPhone/iPad' : ''}${CAPS.standalone ? ' · Home Screen app' : ''}</dd>
          <dt>Analysis engine</dt><dd id="s-model">Checking…</dd></dl>
        <p class="small muted">Tango Fitter is a self-fit guide, not medical advice. Stop and see a professional fitter or a clinician for pain, numbness, injury or a large difference between your left and right sides.</p>
        <div><a class="btn sm quiet" href="#/intro?from=help">Show the introduction</a></div>`)}
    </div>`;
  // One group open at a time, remembered on this device.
  $$('details.group', main).forEach((d) => d.addEventListener('toggle', () => {
    if (!d.open) return;
    $$('details.group', main).forEach((o) => { if (o !== d) o.open = false; });
    Settings.set('settingsOpen', d.dataset.g);
  }));
  const bindSeg = (id, key, after) => $$(`#${id} button`, main).forEach((b) => (b.onclick = () => { Settings.set(key, b.dataset.v); if (after) after(); render(); }));
  bindSeg('s-units', 'units'); bindSeg('s-theme', 'theme', applyTheme); bindSeg('s-audio', 'audioMode'); bindSeg('s-start', 'startMode'); bindSeg('s-stop', 'stopMode');
  bindSeg('s-facing', 'cameraFacing', () => Settings.set('cameraId', ''));
  const cr = $('#s-camreset', main); if (cr) cr.onclick = () => { Settings.set('cameraId', ''); render(); };
  $('#s-voice', main).onchange = (e) => Settings.set('voiceReplies', e.target.checked);
  const numField = (wrap, key, label, min, max) => {
    const f = el(`<label class="row small muted">${esc(label)} <input type="number" inputmode="numeric" min="${min}" max="${max}" value="${v[key]}" style="width:80px;min-height:36px;padding:6px 8px;border-radius:8px;border:1px solid var(--line-2);background:var(--bg)"></label>`);
    $('input', f).onchange = (e) => { const n = Math.max(min, Math.min(max, Math.round(Number(e.target.value) || v[key]))); e.target.value = n; Settings.set(key, n); };
    wrap.appendChild(f);
  };
  const sn = $('#s-start-n', main);
  if (v.startMode === 'seconds') numField(sn, 'startSeconds', 'Seconds before recording', 5, 60);
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
    estimateSizes().then((sz) => { const d = $('#s-size', main); if (d) d.textContent = `${mb(sz.full)} full · ${mb(sz.lite)} lite`; });
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
    <div class="panel"><b>In short:</b> <span class="muted">put the bike on a trainer, stand the phone beside it so the bike sits in the outline on screen, mark eight points on the bike, then ride for about a minute while the app talks you through it. Make the one change it suggests, then retest. Fitting yourself or helping a friend, it works the same way.</span>
      <div style="margin-top:10px"><a class="btn sm" href="#/intro?from=help">Show the introduction again</a></div></div>
    <h2>Getting ready</h2>
    <p><b>Fitting yourself:</b> set the phone up first, mark the bike with the saddle empty, then walk over and get on; the app waits and starts when it sees you pedalling steadily. <b>Helping a friend:</b> they can already be on the bike while you set up; the app notices and speaks to them. Either way the screens are the same.</p>
    <ul>
      <li><b>Trainer.</b> The bike must stay still and level. A rear-wheel or direct-drive trainer, or rollers with a front-wheel riser, all work.</li>
      <li><b>Which side.</b> Film the side without the chainring, so it doesn't hide the foot.</li>
      <li><b>Clothing and light.</b> Fitted clothing that stands out from the background; light from the camera's side, not a bright window behind the bike.</li>
      <li><b>Sound.</b> Volume up and, on iPhone, the silent switch off. Everything the rider needs to know while pedalling is spoken.</li>
    </ul>
    <h2>Placing the camera</h2>
    <p>Turn the phone sideways and stand it 2.5–3 m from the bike, pointing straight at its side, with the lens about level with the top of the wheels. The camera fills the screen with an outline of a bike and rider: move the phone until the real wheels sit inside the outline's wheels. Nobody needs to be on the bike. Three checks along the top turn green: <b>Level</b> (from the phone's motion sensor; on a laptop, check by eye), <b>Landscape</b>, and <b>Light</b>. If someone is already on the bike, a fourth appears, <b>Rider in frame</b>, and turns amber if their head or feet are cut off. <b>Flip</b> mirrors the outline for a bike facing the other way.</p>
    <h2>Marking the bike</h2>
    <p>Tap <b>Mark the bike</b>. The picture freezes; mark eight points in turn: the rear axle, the top of the rear tyre, the back of the rear tyre, the front axle, the bottom bracket, the pedal spindle, the saddle nose and the top of the hood. Hold your finger down to see a magnifier, slide to the exact point and let go. Before the pedal spindle, set the near crank level and pointing forward (or ask your rider to, and hold still), then tap <b>Refresh frame</b>. Every point can be seen whether or not someone is on the bike.</p>
    <p>From your crank length and wheel size, the marks give the app its scale, check that the camera is square and level and at a good distance, and measure the bike itself: saddle height to the nose, setback, drop to the hoods and reach. On a retest those numbers show exactly what changed. If the camera hasn't moved since a recent session, the app shows the earlier marks as teal rings; if they sit on the axles, tyre and bottom bracket, tap <b>They line up</b> and mark only the saddle nose and hood.</p>
    <h2>Riding, and answering hands-free</h2>
    <p>Tap <b>Ready to ride</b>. If the saddle is empty, the app says "walk to the bike and start pedalling"; if someone is already on, "start pedalling when you're ready". Pedal at a steady effort you could hold for an hour (about 80–95 rpm). By default it waits until your cadence is steady, counts ${Settings.v.startStrokes} strokes and records for ${Settings.v.stopSeconds} seconds; the two small buttons at the bottom left change that. It checks the recording before you get off.</p>
    <p>When it asks a question (go again after a bad recording, record a second hand position, stop), answer by <b>raising your right hand above your head for yes</b> or your <b>left hand for no</b>, holding it for a moment; or say "yes" / "again" or "no" / "done" where the browser can listen; or tap the big buttons. It always says what it understood before acting. After a bad recording, doing nothing means it goes again, up to twice.</p>
    <details class="more"><summary>${icon('chevR')}What the beeps mean</summary><dl class="kv" style="margin-top:8px">${BEEP_LEGEND.map(([a2, b2]) => `<dt>${esc(a2)}</dt><dd>${esc(b2)}</dd>`).join('')}</dl></details>
    <h2>Reading the results</h2>
    <p>The results page starts with <b>the one change</b> to make: how much, in both mm and inches, why, and what the retest should show. Below it is <b>your position</b> at the bottom of the pedal stroke with the angles drawn on (tap it to play the recording), then, on a retest, what changed on the bike and how the measurement moved. Playback and the set-up checks are folded away underneath; tap to open them.</p>
    <p>Each measurement is shown against a target range for your bike, riding goal and hand position: <span class="status-good">green</span> is in range, <span class="status-warn">yellow</span> is close, <span class="status-bad">red</span> is outside. Every value also carries a confidence (three bars) based on how clearly the joints were seen and how steady the value was from stroke to stroke. Low-confidence values are greyed out and never drive a recommendation.</p>
    <p>The app recommends <b>one change at a time</b>, in the order fitters use because changes interact: saddle height first, then saddle fore/aft. Amounts are a range in 5 mm steps (for example “raise the saddle 5–10 mm”), never more than 10 mm at a time. Make the change, then tap <b>Retest</b>: the bike marks show whether the change was made and how much the measurement moved. If three rounds of changes have not brought a measurement into range, the app says to see a professional fitter. Reach, drop, bar width and cleats arrive in the next version; their measurements are already shown.</p>
    <h2>The bike's numbers</h2>
    <p>The eight marks measure the bike itself: <b>saddle height</b> (from the centre of the cranks to the saddle nose), <b>saddle setback</b> (how far the saddle nose sits behind the pedals), <b>saddle-to-bar drop</b> (how far the hoods sit below the saddle nose) and <b>reach to the hoods</b> (how far forward they are from the saddle nose). They are measured along the bike, so a slightly tilted trainer doesn't change them. A tape measure from the centre of the bottom bracket to the saddle nose should agree within about 5 mm. On a retest they show what you actually changed, so the advice can say "one more step" or "still to do".</p>
    <h2>Comparing sessions</h2>
    <p>In <b>Sessions</b>, tap <b>Compare or delete</b>, pick two sessions and tap <b>Compare</b>: the measurements and the bike's numbers side by side with the change between them, and both positions drawn on top of each other (the earlier one in grey), lined up on the bottom bracket. The same screen deletes the sessions you pick, after asking.</p>
    <h2>Discomfort and safety</h2>
    <p>The questions about discomfort help the app point at the measurements most often associated with where you feel it. The app never assumes discomfort is caused by your bike fit: if the related measurements are in range it says so, and lists other common causes. If you report severe discomfort, discomfort that lasts after rides, numbness, or a recent injury, it recommends seeing a clinician or professional fitter before changing anything.</p>
    <p><b>Tango Fitter is a self-fit guide, not medical advice.</b></p>
    <h2>Fit files</h2>
    <p>Export from the line at the bottom of each results page, or from Settings → Fit file. A fit file (.tango) holds riders, every session, the videos, snapshots and reports. It can hold a whole household. The app keeps a working copy on this device, but browsers can clear their storage, so export after each session (the app offers to). Open the file on any iPhone, iPad or computer; if the video format won't play on that device, the playback shows the tracked skeleton instead, with every measurement intact. <b>Lite</b> exports leave the videos out to keep the file small.</p>
    <h2>Troubleshooting</h2>
    <ul>
      <li><b>“Camera not allowed.”</b> Allow camera access for this site in the browser's settings (iPhone: Settings → Safari → Camera), then reload.</li>
      <li><b>No sound.</b> Volume up; iPhone silent switch off; tap Test sound in Settings.</li>
      <li><b>“I lost sight of your knee.”</b> Better light, more contrast between clothing and background, and check the whole body is in the frame.</li>
      <li><b>“Your feet are cut off.”</b> Move the phone further back or a little higher.</li>
      <li><b>Head cut off.</b> It doesn't affect the measurements, but moving the phone a little further back keeps the whole rider in view.</li>
      <li><b>Level light stays amber.</b> Hold the phone upright and sideways, not tipped back; the light says which way it's tilted. On a laptop it reads "check by eye".</li>
      <li><b>The hand-raise isn't noticed.</b> Raise the hand clearly above your head and hold it for a second or two; or tap the button.</li>
      <li><b>Scales disagree / wheel looks oval.</b> Turn the phone so it points straight at the side of the bike, and keep it level.</li>
      <li><b>First analysis is slow.</b> The analysis engine (about 35 MB) downloads once; after that it works offline.</li>
    </ul>
    <p class="small faint" style="margin-top:22px">${esc(C.app.name)} ${esc(C.app.version)}</p>
  </div>`;
}, { nav: 'help' });
