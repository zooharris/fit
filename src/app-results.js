/* ==========================================================================
   Results (brief Part C): the change, your position, the retest, measurements,
   your bike, what you told us, playback, set-up quality, report; and compare
   ========================================================================== */
const STATUS_WORDS = { green: 'In range', yellowlow: 'A little low', yellowhigh: 'A little high', redlow: 'Low', redhigh: 'High', none: 'Unclear' };
const statusWord = (g) => (g.status === 'green' ? STATUS_WORDS.green : g.status === 'none' ? (g.confidence === 'none' ? 'Not measured' : STATUS_WORDS.none) : STATUS_WORDS[g.status + g.side]);
const statusClass = (g) => ({ green: 'good', yellow: 'warn', red: 'bad', none: 'none' }[g.status] || 'none');
const confLabel = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence', none: 'Not measured' };

function gaugeHTML(g, flagged) {
  const u = Settings.v.units, m = TF.METRICS[g.metric];
  const band = g.band, has = TF.finite(g.value) && band;
  let bar = '<div class="gbar none"></div>';
  if (band) {
    const [ylo, yhi] = band.yellow, span = yhi - ylo, lo = ylo - span * 0.35, hi = yhi + span * 0.35;
    const pct = (v) => `${Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)).toFixed(1)}%`;
    bar = `<div class="gbar"><span class="y" style="left:${pct(ylo)};right:${(100 - parseFloat(pct(yhi))).toFixed(1)}%"></span><span class="g" style="left:${pct(band.green[0])};right:${(100 - parseFloat(pct(band.green[1]))).toFixed(1)}%"></span>${has ? `<span class="m" style="left:${pct(g.value)}"></span>` : ''}</div>`;
  }
  const sc = statusClass(g);
  // Label, value, status word, bar; everything else on tap (brief C1.4).
  return `<button class="gauge ${flagged ? 'flagged' : ''}" data-metric="${g.metric}" aria-expanded="false">
    <div class="top"><span class="name">${esc(m.label)}</span><span class="tiny status-${sc}" style="font-weight:600">${esc(statusWord(g))}</span></div>
    <div class="top"><span class="val ${TF.finite(g.value) ? '' : 'none'}">${TF.finite(g.value) ? esc(TF.fmtMetric(g.metric, g.value, u)) : '—'}</span><span class="conf ${g.confidence}" title="${esc(confLabel[g.confidence])}"><i></i><i></i><i></i></span></div>
    ${bar}
    <div class="about" hidden><b>Target ${esc(TF.fmtBand(g.metric, band, u))}</b> · ${esc(m.where)}<br>${esc(m.about)}<br><span class="faint">${esc(confLabel[g.confidence])}${g.reason ? `: ${esc(g.reason)}` : '.'}</span>${TF.finite(g.spread) && Math.round(g.spread / 2) > 0 ? `<br><span class="faint">Stroke-to-stroke spread ±${esc(m.unit === 'mm' ? TF.fmtLength(g.spread / 2, u, 'adjust') : `${Math.round(g.spread / 2)}°`)}.</span>` : ''}</div>
  </button>`;
}
const gaugeGrid = (gauges, flagged) => `<div class="gauges">${gauges.slice().sort((a, b) => (flagged.has(b.metric) ? 1 : 0) - (flagged.has(a.metric) ? 1 : 0) || (b.status === 'red' ? 2 : b.status === 'yellow' ? 1 : 0) - (a.status === 'red' ? 2 : a.status === 'yellow' ? 1 : 0)).map((g) => gaugeHTML(g, flagged.has(g.metric))).join('')}</div>`;

/** The amount in the other unit system, for the line under the action. */
function otherUnits(amount) {
  if (!amount) return '';
  const other = Settings.v.units === 'imperial' ? 'metric' : 'imperial';
  return TF.fmtRange(amount.lo, amount.hi, other);
}

/** 1. The change (brief C1.1). */
function changeHTML(s, res) {
  const rec = res.recommendation, gate = res.gate, cal = s.clips[0] && s.clips[0].calibration;
  const prof = gate.gated ? `<span class="tag warn">For discussion with a professional</span>` : '';
  const c = rec.current;
  if (c) {
    const stop = c.kind === 'stop';
    const stillToDo = c.history && c.history.status === 'notMade';
    const amt = c.amount ? `<p class="amount">${esc(TF.fmtRange(c.amount.lo, c.amount.hi, Settings.v.units))} <span class="faint">· ${esc(otherUnits(c.amount))}</span></p>` : '';
    return `<div class="panel ${stop ? 'warnpanel' : 'accent'} reco change" id="change">
      <div class="eyebrow"><span class="caption">${stop ? 'Time for a professional' : stillToDo ? 'Still to do' : 'Your next change'}</span>${!stop ? `<span class="tag ${c.strength === 'recommended' ? 'accent' : ''}">${c.strength === 'recommended' ? 'Recommended' : 'Fine-tune'}</span>` : ''}${prof}</div>
      <div class="action big">${esc(c.text)}</div>
      ${amt}
      <p class="why">${esc(c.why)}</p>
      ${c.expect ? `<p class="expect">${icon('refresh')}<span>${esc(c.expect)}</span></p>` : ''}
      ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
      ${c.howTo ? `<p class="small faint" style="margin-top:8px">${esc(c.howTo)}</p>` : ''}
      ${!stop && !s.sample ? `<div class="btn-row"><a class="btn primary" href="#/session/new?retest=${s.id}" id="rs-retest">${icon('refresh')}I've made this change — retest</a></div>` : ''}
      ${rec.queued.length ? `<div class="hr"></div><div class="caption">After that</div><div class="next-list">${rec.queued.map((q, i) => `<div class="it"><span class="n">${i + 2}</span><div>${esc(q.text)}<div class="small muted">${esc(q.why)}</div></div></div>`).join('')}</div>` : ''}
      ${!cal ? `<div class="banner warn" style="margin-top:12px">${icon('alert')}<div class="grow">This session was recorded without the bike marks, so there is no knee-over-pedal measurement and no amounts in millimetres.</div></div>` : ''}
    </div>`;
  }
  return `<div class="panel reco ok change" id="change">
    <div class="eyebrow"><span class="caption">Saddle position</span>${prof}</div>
    <div class="action big">Saddle height and fore/aft are in range</div>
    <p class="why">Nothing to change on the saddle. ${rec.later.length ? 'Reach and drop are shown below; the next version will advise on them.' : 'Your measurements are within the target ranges for your bike and riding style.'}</p>
  </div>`;
}

/** A bike number as shown, and the change between two (rounded from the true difference, as in the advice).
    A negative drop (bars higher than the saddle) is shown as "bars above the saddle". */
function bikeShown(k, v, barsAbove) {
  if (!TF.finite(v)) return { text: '—', n: NaN };
  if (k === 'effectiveSeatAngle') return { text: `${v.toFixed(1)}°`, n: v };
  const mm = barsAbove && k === 'drop' ? -v : v;
  // The change is rounded from the true difference, so it matches "after raising the saddle 10 mm" in the advice.
  return { text: U.len(Settings.v.units === 'imperial' ? mm : Math.round(mm), 'length'), n: mm };
}
function bikeDeltaText(k, a, b) {
  if (!TF.finite(a) || !TF.finite(b)) return '';
  const d = b - a;
  if (k === 'effectiveSeatAngle') return Math.abs(d) < 0.3 ? '' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}°`;
  return Math.abs(d) < 2 ? '' : TF.fmtSignedMm(Math.round(d), Settings.v.units);
}
const angleDelta = (a, b) => { const d = Math.round(b) - Math.round(a); return d === 0 ? 'no change' : `${d > 0 ? '+' : '−'}${Math.abs(d)}°`; };

/** 5. Your bike: the mark-derived numbers, each with what it means. */
function bikeHTML(bm, prevBm) {
  if (!bm) return '';
  const u = Settings.v.units;
  const meaning = { saddleHeight: 'From the centre of the cranks to the saddle nose.', saddleSetback: 'How far the saddle nose sits behind the pedals.', drop: 'How far the hoods sit below the saddle nose.', reach: 'How far forward the hoods are from the saddle nose.', effectiveSeatAngle: 'How steeply the saddle sits above the pedals.' };
  void u;
  const rows = Object.keys(TF.BIKE_MEASURES).map((k) => {
    const v = bm[k]; if (!TF.finite(v)) return '';
    const above = k === 'drop' && v < 0;
    const now = bikeShown(k, v, above);
    let label = TF.BIKE_MEASURES[k].label, mean = meaning[k];
    if (above) { label = 'Bars above the saddle'; mean = 'How far the hoods sit higher than the saddle nose.'; }
    const before = prevBm ? bikeShown(k, prevBm[k], above) : null;
    const dt = before ? bikeDeltaText(k, before.n, now.n) : '';
    const val = now.text;
    const delta = dt ? `<span class="tag">${esc(dt)} since last time</span>` : '';
    return `<div class="bike-row"><div><b>${esc(label)}</b><div class="small muted">${esc(mean)}</div></div><div class="bv">${esc(val)}${delta}</div></div>`;
  }).join('');
  return `<div class="section" id="bike"><div class="section-head"><h2>Your bike</h2><span class="small faint">Measured from the eight marks</span></div><div class="panel bike-list">${rows}</div></div>`;
}

/** The analysis of a session's second hand position, cached separately. */
function secondAnalysis(s) {
  const key = `${s.id}:2`;
  if (S.cache.has(key)) return S.cache.get(key);
  const c = s.secondClip;
  if (!c || !c.frames || !c.frames.length) return null;
  const a = TF.analyseClip(Object.assign({}, c, { calibration: c.calibration ? JSON.parse(JSON.stringify(c.calibration)) : null }));
  S.cache.set(key, a);
  return a;
}

/** The retest strip (brief C1.3), or '' when this is not a retest. */
function retestStrip(r, s, res) {
  const prev = s.retestOf ? findSession(s.retestOf) : null;
  if (!prev) return '';
  const pr = sessionResults(prev.rider, prev.session);
  if (!pr) return '';
  const pm = pr.recommendation && pr.recommendation.current ? pr.recommendation.current.metric : 'kneeExtension';
  const before = pr.gauges.find((g) => g.metric === pm), after = res.gauges.find((g) => g.metric === pm);
  const pc = prev.session.clips[0] || {}, nc = s.clips[0] || {};
  const sum = TF.retestSummary({ cal: pc.calibration && Object.assign({}, pc.calibration, { bikeMeasures: prev.session.bikeMeasures || (pc.calibration || {}).bikeMeasures }) },
    { cal: nc.calibration && Object.assign({}, nc.calibration, { bikeMeasures: s.bikeMeasures || (nc.calibration || {}).bikeMeasures }) }, pm, before && before.value, after && after.value, Settings.v.units);
  const line = [sum.bike, sum.metric].filter(Boolean).join(' · ');
  return `<div class="panel tight retest" id="retest"><div class="caption">Since ${esc(fmtDate(prev.session.created))}</div>
    <p class="delta">${esc(line.charAt(0).toUpperCase() + line.slice(1))}</p>
    ${sum.cameraMoved ? `<p class="small muted">The camera had moved, so the bike numbers were measured afresh; small differences may be the camera, not the bike.</p>` : ''}
    ${before && after ? `<div class="ba"><div><div class="tiny faint">Before</div>${gaugeHTML(before, false)}</div><div><div class="tiny faint">After</div>${gaugeHTML(after, false)}</div></div>` : ''}
    <a class="btn sm quiet" href="#/session/${prev.session.id}">Open the earlier session</a></div>`;
}

route('/session/:id', async (main, { id }) => {
  const found = findSession(id);
  if (!found) { go('#/'); return; }
  const { rider: r, session: s } = found;
  if (r.id !== S.riderId) { S.riderId = r.id; saveMeta(); renderShell('fit'); }
  const a = sessionAnalysis(s);
  const res = sessionResults(r, s);
  const clip = s.clips[0] || {};
  if (!res) {
    main.innerHTML = `<div class="page-head"><div><h1>Fit results</h1><div class="sub">${esc(fmtDateTime(s.created))}</div></div></div><div class="banner bad">${icon('alert')}<div class="grow">${esc((a && a.error) || 'This session has no usable measurements.')}</div></div>
      <div class="btn-row" style="margin-top:14px"><button class="btn danger" id="rs-del">${icon('trash')}Delete session</button></div>`;
    $('#rs-del', main).onclick = () => deleteSession(r, s);
    return;
  }
  const flagged = new Set(res.highlighted);
  const cal = clip.calibration;
  const prevS = s.retestOf ? findSession(s.retestOf) : null;
  const wide = window.matchMedia('(min-width: 900px)').matches;
  // Second hand position, when recorded.
  let secondHTML = '';
  const a2 = secondAnalysis(s);
  if (a2 && a2.ok) {
    const res2 = TF.buildResults(a2, s.profile || r.profile, s.secondClip.hand, s.discomfort, Settings.v.units);
    secondHTML = `<div class="section" id="second"><div class="section-head"><h2>${esc(TF.HAND_POSITIONS[s.secondClip.hand] || 'Second position')}</h2><span class="small faint">Your second hand position, recorded in the same session</span></div>
      ${gaugeGrid(res2.gauges.filter((g) => ['hipClosed', 'backAngle', 'shoulder', 'elbow', 'wrist'].includes(g.metric)), new Set())}
      <p class="small faint" style="margin-top:8px">Saddle advice uses your main position (${esc(TF.HAND_POSITIONS[clip.hand] || '')}); this shows how the upper body changes in the ${esc((TF.HAND_POSITIONS[s.secondClip.hand] || '').toLowerCase())}.</p></div>`;
  }
  const u = Settings.v.units;
  main.innerHTML = `
    <div class="page-head"><div><h1>Fit results</h1><div class="sub">${esc(fmtDateTime(s.created))} · ${esc(r.name)} · ${esc(TF.HAND_POSITIONS[clip.hand] || '')} · ${Math.round(res.cadence)} rpm · ${plural(res.strokes, 'stroke')}</div></div>
      <div class="row">${s.sample ? '<span class="tag teal">Sample from a simulated rider</span>' : ''}${s.retestOf ? '<span class="tag">Retest</span>' : ''}</div></div>
    ${res.gate.gated ? `<div class="banner warn" style="margin-bottom:14px">${icon('alert')}<div class="grow"><b>Please see a professional before changing your bike.</b> You mentioned ${esc(res.gate.reasons.join(', '))}. A clinician or professional fitter should look at that first. The measurements are below; treat any suggestion as something to discuss with them.</div></div>` : ''}
    ${changeHTML(s, res)}
    <div class="section" id="position"><div class="section-head"><h2>Your position</h2><span class="small faint">Bottom of the stroke · tap to play</span></div>
      <button class="position-shot" id="rs-pos" aria-label="Your position at the bottom of the stroke; tap to open playback" style="aspect-ratio:${clip.width || 16}/${clip.height || 9}"><span class="spinner"></span></button></div>
    ${retestStrip(r, s, res)}
    <div class="section" id="gauges"><div class="section-head"><h2>Measurements</h2><span class="small faint">Tap one for the target and details</span></div>
      ${gaugeGrid(res.gauges, flagged)}</div>
    ${bikeHTML(s.bikeMeasures, prevS ? prevS.session.bikeMeasures : null)}
    ${secondHTML}
    ${res.discomfortNotes.length ? `<div class="section"><h2>What you told us</h2><div class="panel stack">${res.discomfortNotes.map((n) => `<div><b>${esc(n.label)}</b> <span class="tag ${n.level === 'severe' ? 'bad' : n.level === 'moderate' ? 'warn' : ''}">${esc(LEVEL_LABELS[n.level])}</span>${n.pattern ? ` <span class="tiny faint">${esc(PATTERN_LABELS[n.pattern])}</span>` : ''}<p class="small muted" style="margin-top:4px">${esc(n.text)}</p></div>`).join('')}</div></div>` : ''}
    <details class="section fold" id="playback" ${wide ? 'open' : ''}><summary>${icon('chevR')}<h2>Playback</h2></summary><div id="player-wrap"></div></details>
    <details class="section fold" id="quality"><summary>${icon('chevR')}<h2>Set-up quality</h2></summary><div class="panel">
      <dl class="kv">
        ${cal ? `<dt>Scale</dt><dd>${(cal.pxPerMm).toFixed(3)} pixels per mm; crank and wheel agree within ${(cal.agreement * 100).toFixed(1)}%</dd><dt>Camera square</dt><dd>Rear wheel ${Math.round(cal.squareRatio * 100)}% as wide as tall</dd><dt>Bike level</dt><dd>${Math.abs(cal.tiltDeg).toFixed(1)}°${Math.abs(cal.tiltDeg) > 0.05 ? (cal.tiltDeg > 0 ? ' front high (corrected)' : ' front low (corrected)') : ''}</dd>${cal.distance && TF.finite(cal.distance.metres) ? `<dt>Camera distance</dt><dd>about ${cal.distance.metres.toFixed(1)} m</dd>` : ''}`
    : '<dt>Bike marks</dt><dd class="status-warn">None: no millimetre measurements</dd>'}
        <dt>Marked with</dt><dd>${s.markedWithRider ? 'the rider on the bike' : 'the saddle empty'}</dd>
        <dt>Recording</dt><dd>${clip.width}×${clip.height}, ${Math.round(clip.fps || 30)} frames a second, ${(clip.durationS || 0).toFixed(1)} s, analysed at ${clip.analysedFps} frames a second${clip.analysisSeconds ? ` in ${clip.analysisSeconds} s` : ''}</dd>
        <dt>Tracking</dt><dd>${esc(a.side === 'left' ? 'Left' : 'Right')} side towards the camera; pedal stroke from ${a.phaseSource === 'crank' ? 'the crank' : 'the foot path'}</dd>
        <dt>Bike</dt><dd>${esc(U.len(s.bike.crankLength, 'length'))} cranks, ${esc(s.bike.wheel === 'custom' ? U.len(s.bike.wheelDiameterMm, 'length') + ' wheel' : (TF.WHEELS[s.bike.wheel] || {}).label || '')}</dd>
        ${clip.level ? `<dt>Phone level</dt><dd>${Math.abs(clip.level.pitch).toFixed(1)}° ${clip.level.pitch >= 0 ? 'up' : 'down'}, rotated ${Math.abs(clip.level.roll).toFixed(1)}°</dd>` : ''}
        ${s.replies && s.replies.length ? `<dt>Answers</dt><dd>${s.replies.map((x) => `${esc({ gesture: 'hand raised', voice: 'voice', tap: 'tap', auto: 'no answer' }[x.via] || x.via)}`).join(', ')}</dd>` : ''}
      </dl>${a.notes && a.notes.length ? `<ul class="small muted" style="margin-top:8px;padding-left:18px">${a.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div></details>
    <div class="section btn-row">
      <button class="btn" id="rs-report">${icon('report')}Report (PDF)</button>
      <span style="flex:1"></span>
      <button class="btn danger" id="rs-del">${icon('trash')}Delete session</button>
    </div>
    <div class="export-line ${unexported() ? 'warn' : ''}">${icon(unexported() ? 'alert' : 'check')}<span class="grow">${unexported() ? 'Not exported yet: export the fit file to keep a permanent copy.' : `Fit file exported ${S.meta.lastExportedAt ? esc(fmtDateTime(S.meta.lastExportedAt)) : ''}.`}</span><button class="btn sm" id="rs-export">${icon('download')}Export</button></div>
    <p class="small faint section">Tango Fitter is a self-fit guide, not medical advice. Measurements depend on camera placement and lighting; suggestions are starting points to confirm with a retest. Stop and see a professional for pain, numbness, injury or a large left–right difference.</p>`;
  $$('.gauge', main).forEach((g) => (g.onclick = () => { const ab = $('.about', g); ab.hidden = !ab.hidden; g.setAttribute('aria-expanded', String(!ab.hidden)); }));
  $('#rs-report', main).onclick = () => makeReport(r, s);
  $('#rs-export', main).onclick = () => exportFlow();
  $('#rs-del', main).onclick = () => deleteSession(r, s);
  const pb = $('#playback', main);
  $('#rs-pos', main).onclick = () => { pb.open = true; pb.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  void u;
  // Your position: the bottom-of-stroke frame, with the video when it plays here.
  positionShot(a, s).then((url) => { const b = $('#rs-pos', main); if (b && url) b.innerHTML = `<img src="${url}" alt="">`; else if (b) b.innerHTML = '<span class="small faint">Not available</span>'; });
  await mountPlayer($('#player-wrap', main), r, s, a);
}, { needsFile: true, nav: 'fit' });

/** The bottom-of-stroke frame with the skeleton and angles, as an image URL. */
async function positionShot(a, s) {
  const clip = s.clips[0];
  const bdc = (a.strokeFrames.bdc || []).find((x) => x >= 0);
  if (!(bdc >= 0)) return null;
  const vid = await videoAt(clip, a.smoothed[bdc].t);
  const c = await renderFrameCanvas(a, clip, bdc, vid ? vid.video : null, {});
  if (vid) vid.done();
  return c.toDataURL('image/jpeg', 0.86);
}
/** A clip's video seeked to t, or null when it can't play here. */
async function videoAt(clip, t) {
  if (!clip.file) return null;
  const b = await getBlob(clip.file);
  if (!b || (clip.mime && document.createElement('video').canPlayType(clip.mime.split(';')[0]) === '')) return null;
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; const url = URL.createObjectURL(b); v.src = url;
  const ok = await new Promise((res) => { v.onloadeddata = () => res(true); v.onerror = () => res(false); setTimeout(() => res(false), 5000); });
  if (!ok) { URL.revokeObjectURL(url); return null; }
  await new Promise((res) => { v.onseeked = res; v.currentTime = t; setTimeout(res, 2000); });
  return { video: v, done: () => URL.revokeObjectURL(url) };
}

/* ---------- compare two sessions (brief C2) ---------- */
route('/compare/:a/:b', async (main, { a: ida, b: idb }) => {
  const fa = findSession(ida), fb = findSession(idb);
  if (!fa || !fb) { go('#/sessions'); return; }
  // Older on the left, newer on the right.
  const [older, newer] = fa.session.created <= fb.session.created ? [fa, fb] : [fb, fa];
  const ra = sessionResults(older.rider, older.session), rb = sessionResults(newer.rider, newer.session);
  const aa = sessionAnalysis(older.session), ab = sessionAnalysis(newer.session);
  if (!ra || !rb) { toast('One of these sessions has no usable measurements.'); go('#/sessions'); return; }
  const u = Settings.v.units;
  const rows = TF.METRIC_ORDER.map((k) => {
    const ga = ra.gauges.find((g) => g.metric === k), gb = rb.gauges.find((g) => g.metric === k);
    const d = TF.finite(ga.value) && TF.finite(gb.value) ? gb.value - ga.value : NaN;
    const ch = !TF.finite(d) ? '—' : TF.METRICS[k].unit === 'mm' ? (Math.round(gb.value) === Math.round(ga.value) ? 'no change' : TF.fmtSignedMm(Math.round(gb.value) - Math.round(ga.value), u)) : angleDelta(ga.value, gb.value);
    const cell = (g) => `<td><span class="dot-s ${statusClass(g)}"></span>${TF.finite(g.value) ? esc(TF.fmtMetric(k, g.value, u)) : '—'}</td>`;
    return `<tr><th>${esc(TF.METRICS[k].label)}<div class="tiny faint">Target ${esc(TF.fmtBand(k, gb.band, u))}</div></th>${cell(ga)}${cell(gb)}<td class="ch">${esc(ch)}</td></tr>`;
  }).join('');
  const bmA = older.session.bikeMeasures, bmB = newer.session.bikeMeasures;
  const bikeRows = bmA && bmB ? ['saddleHeight', 'saddleSetback', 'drop', 'reach'].map((k) => {
    const above = k === 'drop' && bmA[k] < 0 && bmB[k] < 0;
    const a1 = bikeShown(k, bmA[k], above), b1 = bikeShown(k, bmB[k], above);
    return `<tr><th>${esc(above ? 'Bars above the saddle' : TF.BIKE_MEASURES[k].label)}</th><td>${esc(a1.text)}</td><td>${esc(b1.text)}</td><td class="ch">${esc(bikeDeltaText(k, a1.n, b1.n) || 'no change')}</td></tr>`;
  }).join('') : '';
  // Same day: show the times so the two columns can be told apart.
  const sameDay = older.session.created.slice(0, 10) === newer.session.created.slice(0, 10);
  const when = (x) => (sameDay ? fmtDateTime(x.session.created) : fmtDate(x.session.created));
  const head = `<tr><th></th><th>${esc(when(older))}<div class="tiny faint">${esc(TF.HAND_POSITIONS[(older.session.clips[0] || {}).hand] || '')}</div></th><th>${esc(when(newer))}<div class="tiny faint">${esc(TF.HAND_POSITIONS[(newer.session.clips[0] || {}).hand] || '')}</div></th><th>Change</th></tr>`;
  main.innerHTML = `
    <div class="page-head"><div><h1>Compare</h1><div class="sub">${esc(older.rider.name)}${older.rider !== newer.rider ? ` and ${esc(newer.rider.name)}` : ''} · ${esc(when(older))} and ${esc(when(newer))}</div></div></div>
    <div class="panel tight"><canvas class="compare-shot" id="cmp-shot" style="aspect-ratio:${(newer.session.clips[0] || {}).width || 16}/${(newer.session.clips[0] || {}).height || 9}"></canvas>
      <p class="small muted" style="margin-top:8px"><span class="key orange"></span>${esc(when(newer))} <span class="key grey"></span>${esc(when(older))} (earlier) · both at the bottom of the stroke, lined up on the bottom bracket</p></div>
    <div class="section"><h2>Measurements</h2><div class="panel table-wrap"><table class="cmp">${head}${rows}</table></div></div>
    ${bikeRows ? `<div class="section"><h2>The bike</h2><div class="panel table-wrap"><table class="cmp">${head}${bikeRows}</table></div></div>` : ''}
    <div class="section btn-row"><a class="btn" href="#/session/${older.session.id}">Open the earlier session</a><a class="btn" href="#/session/${newer.session.id}">Open the later session</a><a class="btn quiet" href="#/sessions">Back to sessions</a></div>`;
  const shot = $('#cmp-shot', main);
  const redraw = () => drawCompare(shot, aa, older.session, ab, newer.session);
  redraw();
  const ro = new ResizeObserver(redraw); ro.observe(shot);
  setCleanup(() => ro.disconnect());
}, { needsFile: true, nav: 'sessions' });

/** The two bottom-of-stroke skeletons overlaid: the older as a grey ghost on the newer, aligned on the bottom bracket and scaled to the same mm. */
function drawCompare(canvas, aOld, sOld, aNew, sNew) {
  const cOld = sOld.clips[0], cNew = sNew.clips[0];
  const b = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round((b.width || 600) * dpr); canvas.height = Math.round(canvas.width * cNew.height / cNew.width);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0A1220'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const k = canvas.width / cNew.width;
  const iNew = (aNew.strokeFrames.bdc || []).find((x) => x >= 0), iOld = (aOld.strokeFrames.bdc || []).find((x) => x >= 0);
  if (!(iNew >= 0)) return;
  drawOverlay(ctx, aNew, cNew, iNew, { scale: k, angles: false, keypoint: true, skeleton: false });
  if (!(iOld >= 0)) { drawOverlay(ctx, aNew, cNew, iNew, { scale: k, angles: false, bike: false }); return; }
  // Map the older frame into the newer one: same bottom bracket, same pixels per mm, same facing.
  const calO = cOld.calibration, calN = cNew.calibration;
  const bbO = calO ? (calO.bbRefined || calO.taps.bb) : null, bbN = calN ? (calN.bbRefined || calN.taps.bb) : null;
  const sc = calO && calN ? calN.pxPerMm / calO.pxPerMm : 1;
  const flip = aOld.facing !== aNew.facing ? -1 : 1;
  const map = (p) => (bbO && bbN ? { x: (bbN.x + flip * (p.x - bbO.x) * sc) * k, y: (bbN.y + (p.y - bbO.y) * sc) * k } : { x: p.x * k, y: p.y * k });
  const j = aOld.smoothed[iOld] && aOld.smoothed[iOld].j; if (!j) return;
  ctx.strokeStyle = 'rgba(176,190,210,.8)'; ctx.lineWidth = Math.max(4, canvas.width / 160); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [x, y] of [['shoulder', 'elbow'], ['elbow', 'wrist'], ['shoulder', 'hip'], ['hip', 'knee'], ['knee', 'ankle'], ['ankle', 'heel'], ['heel', 'toe'], ['ankle', 'toe']]) {
    if (!j[x] || !j[y]) continue; const p = map(j[x]), q = map(j[y]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  // Redraw the newer on top so it stays clear.
  drawOverlay(ctx, aNew, cNew, iNew, { scale: k, angles: false, bike: false });
}

async function deleteSession(r, s) {
  if (!(await confirmDanger('Delete this session?', `The session from ${esc(fmtDateTime(s.created))}, with its video, snapshots and reports, is removed from this device. Copies already exported are not affected.`, 'Delete session'))) return;
  await deleteBlobs(`riders/${r.id}/sessions/${s.id}/`);
  r.sessions = r.sessions.filter((x) => x.id !== s.id);
  S.cache.delete(s.id);
  await saveFile();
  toast('Session deleted.');
  go('#/');
}

/* ---------- drawing the overlay (shared by playback, snapshots and the report) ---------- */
function drawOverlay(ctx, a, clip, i, opts) {
  const o = Object.assign({ skeleton: true, angles: true, bike: true, scale: 1, keypoint: false }, opts || {});
  const k = o.scale, f = a.smoothed[i], ang = a.frameAngles[i];
  if (!f) return;
  const P = (p) => ({ x: p.x * k, y: p.y * k });
  const lw = Math.max(2, clip.width / 400) * k;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const cal = clip.calibration;
  if (o.bike && cal && cal.taps) {
    const t = cal.taps, teal = '#20D6B5';
    if (o.keypoint) {
      // Draw the bike from the taps so the skeleton has context.
      const wr = Math.abs(t.tyreTop.y - t.rearAxle.y);
      ctx.strokeStyle = 'rgba(169,182,201,.35)'; ctx.lineWidth = lw * 2;
      for (const ax of [t.rearAxle, t.frontAxle]) { const p = P(ax); ctx.beginPath(); ctx.arc(p.x, p.y, wr * k, 0, 7); ctx.stroke(); }
      const bb = P(t.bb), ra = P(t.rearAxle); ctx.beginPath(); ctx.moveTo(ra.x, ra.y); ctx.lineTo(bb.x, bb.y); ctx.stroke();
    }
    const bb = P(t.bb);
    const ph = a.phase && a.phase[i];
    ctx.fillStyle = teal; ctx.beginPath(); ctx.arc(bb.x, bb.y, lw * 2.2, 0, 7); ctx.fill();
    if (ph && ph.spindle) { const sp = P(ph.spindle); ctx.strokeStyle = teal; ctx.lineWidth = lw * 1.6; ctx.beginPath(); ctx.moveTo(bb.x, bb.y); ctx.lineTo(sp.x, sp.y); ctx.stroke(); ctx.beginPath(); ctx.arc(sp.x, sp.y, lw * 2, 0, 7); ctx.fill(); }
    for (const ax of [t.rearAxle, t.frontAxle]) { const p = P(ax); ctx.beginPath(); ctx.arc(p.x, p.y, lw * 1.6, 0, 7); ctx.fill(); }
  }
  if (!o.skeleton) return;
  const j = f.j;
  const seg = (a1, b1) => { if (!j[a1] || !j[b1]) return; const p = P(j[a1]), q = P(j[b1]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); };
  ctx.strokeStyle = 'rgba(10,18,32,.55)'; ctx.lineWidth = lw * 3.2;
  [['shoulder', 'elbow'], ['elbow', 'wrist'], ['wrist', 'index'], ['shoulder', 'hip'], ['hip', 'knee'], ['knee', 'ankle'], ['ankle', 'heel'], ['heel', 'toe'], ['ankle', 'toe']].forEach(([x, y]) => seg(x, y));
  ctx.strokeStyle = '#FF6A1A'; ctx.lineWidth = lw * 1.8;
  [['shoulder', 'elbow'], ['elbow', 'wrist'], ['wrist', 'index'], ['shoulder', 'hip'], ['hip', 'knee'], ['knee', 'ankle'], ['ankle', 'heel'], ['heel', 'toe'], ['ankle', 'toe']].forEach(([x, y]) => seg(x, y));
  for (const n of ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle']) { if (!j[n]) continue; const p = P(j[n]); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#FF6A1A'; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(p.x, p.y, lw * 2.4, 0, 7); ctx.fill(); ctx.stroke(); }
  if (!o.angles) return;
  const label = (pt, txt, dx, dy) => {
    const p = P(pt), fs = Math.max(12, clip.width / 48) * k;
    ctx.font = `700 ${fs}px Archivo, system-ui, sans-serif`;
    const w = ctx.measureText(txt).width, x = p.x + dx * fs, y = p.y + dy * fs;
    ctx.fillStyle = 'rgba(10,18,32,.82)'; roundRect(ctx, x - fs * 0.35, y - fs * 0.95, w + fs * 0.7, fs * 1.3, fs * 0.3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y);
  };
  const arcAt = (c, p1, p2, r) => { if (!c || !p1 || !p2) return; const cc = P(c); const a1 = Math.atan2(p1.y - c.y, p1.x - c.x), a2 = Math.atan2(p2.y - c.y, p2.x - c.x); let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = lw * 0.9; ctx.beginPath(); ctx.arc(cc.x, cc.y, r * k, a1, a1 + d, d < 0); ctx.stroke(); };
  const R = clip.width / 30;
  arcAt(j.knee, j.hip, j.ankle, R); arcAt(j.hip, j.shoulder, j.knee, R * 1.2); arcAt(j.elbow, j.shoulder, j.wrist, R * 0.8);
  const side = a.facing;
  if (TF.finite(ang.knee) && j.knee) label(j.knee, `${Math.round(ang.knee)}°`, side > 0 ? 0.9 : -3, -0.4);
  if (TF.finite(ang.hip) && j.hip) label(j.hip, `${Math.round(ang.hip)}°`, side > 0 ? -3.4 : 0.9, -0.9);
  if (TF.finite(ang.elbow) && j.elbow) label(j.elbow, `${Math.round(ang.elbow)}°`, side > 0 ? -0.4 : -2, 2.2);
  if (TF.finite(ang.ankle) && j.ankle) label(j.ankle, `${Math.round(ang.ankle)}°`, side > 0 ? -3.6 : 1, 0.4);
  if (TF.finite(ang.shoulder) && j.shoulder) label(j.shoulder, `${Math.round(ang.shoulder)}°`, side > 0 ? -1 : -1, -1.4);
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* ---------- playback ---------- */
async function mountPlayer(wrap, r, s, a) {
  const clip = s.clips[0];
  const W = clip.width, H = clip.height;
  let blob = clip.file ? await getBlob(clip.file) : null;
  wrap.innerHTML = `<div class="panel tight stack">
    <div class="row between"><span class="small faint">Space plays and pauses; arrow keys step a frame</span><div class="chips"><button class="chip on" data-t="skeleton">Skeleton</button><button class="chip on" data-t="angles">Angles</button></div></div>
    <div class="player" style="aspect-ratio:${W}/${H}"><video playsinline muted preload="auto" hidden></video><canvas class="overlay"></canvas><span class="badge"></span></div>
    <div class="controls">
      <input type="range" class="scrub" min="0" max="${(clip.durationS || 1).toFixed(3)}" step="0.001" value="0" aria-label="Position">
      <div class="row wrap between">
        <div class="row"><button class="icon-btn" id="pl-play" title="Play or pause (space)">${icon('play')}</button><button class="icon-btn" id="pl-back" title="Previous frame (←)">${icon('stepB')}</button><button class="icon-btn" id="pl-fwd" title="Next frame (→)">${icon('stepF')}</button><span class="small faint" id="pl-time">0.00 s</span></div>
        <div class="seg sm" id="pl-speed"><button data-s="0.25">¼×</button><button data-s="0.5">½×</button><button data-s="1" class="on">1×</button></div>
      </div>
      <div class="row wrap"><span class="small faint">Jump to</span><button class="btn sm" data-j="bdc">Bottom of stroke</button><button class="btn sm" data-j="tdc">Top of stroke</button><button class="btn sm" data-j="forward">Crank forward</button><button class="btn sm" id="pl-snap">${icon('image')}Snapshot</button></div>
      <div class="readouts" id="pl-read"></div>
      <div class="snaps" id="pl-snaps"></div>
    </div></div>`;
  const video = $('video', wrap), canvas = $('canvas', wrap), ctx = canvas.getContext('2d'), scrub = $('.scrub', wrap), badge = $('.badge', wrap);
  const st = { t: 0, playing: false, speed: 1, skeleton: true, angles: true, keypoint: true, raf: 0, lastTs: 0 };
  const frames = clip.frames, dur = clip.durationS || (frames.length ? frames[frames.length - 1].t : 1);
  let url = null;
  if (blob) {
    const playable = !clip.mime || video.canPlayType(clip.mime.split(';')[0]) !== '';
    if (playable) {
      url = URL.createObjectURL(blob); video.src = url;
      const ok = await new Promise((res) => { video.onloadeddata = () => res(true); video.onerror = () => res(false); setTimeout(() => res(video.readyState >= 2), 5000); });
      if (ok) { st.keypoint = false; video.hidden = false; }
    }
  }
  badge.innerHTML = st.keypoint ? `<span class="tag teal">${blob ? 'Video format not supported here: ' : clip.sample ? 'Simulated rider: ' : clip.file ? 'Video not in this file: ' : ''}skeleton playback</span>` : '';
  const sizeCanvas = () => { const b = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; canvas.width = Math.round(b.width * dpr); canvas.height = Math.round(b.height * dpr); };
  const paint = () => {
    if (!canvas.width) sizeCanvas();
    const k = canvas.width / W;
    if (st.keypoint) { ctx.fillStyle = '#0A1220'; ctx.fillRect(0, 0, canvas.width, canvas.height); } else ctx.clearRect(0, 0, canvas.width, canvas.height);
    const i = TF.nearestFrameIndex(frames, st.t);
    drawOverlay(ctx, a, clip, i, { scale: k, skeleton: st.skeleton, angles: st.angles, keypoint: st.keypoint });
    scrub.value = st.t; $('#pl-time', wrap).textContent = `${st.t.toFixed(2)} s`;
    const an = a.frameAngles[i] || {}, u = Settings.v.units;
    const ph = a.phase && a.phase[i] && TF.finite(a.phase[i].a) ? ((Math.round(-a.phase[i].a + 90) % 360) + 360) % 360 : null;
    $('#pl-read', wrap).innerHTML = [['Knee', an.knee], ['Hip', an.hip], ['Ankle', an.ankle], ['Back', an.back], ['Shoulder', an.shoulder], ['Elbow', an.elbow]]
      .map(([l, v]) => `<div><div class="l">${l}</div><div class="v">${TF.finite(v) ? Math.round(v) + '°' : '—'}</div></div>`).join('')
      + (ph != null ? `<div><div class="l">Crank (from top)</div><div class="v">${ph}°</div></div>` : '');
    void u;
  };
  const seek = async (t) => {
    st.t = Math.max(0, Math.min(dur, t));
    if (!st.keypoint) { await new Promise((res) => { video.onseeked = res; video.currentTime = st.t; setTimeout(res, 800); }); }
    paint();
  };
  const loop = (ts) => {
    st.raf = requestAnimationFrame(loop);
    if (!st.playing) return;
    if (st.keypoint) { const dt = st.lastTs ? (ts - st.lastTs) / 1000 : 0; st.t += dt * st.speed; if (st.t >= dur) st.t = 0; }
    else st.t = video.currentTime;
    st.lastTs = ts; paint();
  };
  const setPlaying = (p) => {
    st.playing = p; st.lastTs = 0;
    $('#pl-play', wrap).innerHTML = icon(p ? 'pause' : 'play');
    if (!st.keypoint) { video.playbackRate = st.speed; video.loop = true; if (p) video.play().catch(() => {}); else video.pause(); }
  };
  $('#pl-play', wrap).onclick = () => setPlaying(!st.playing);
  const dtf = 1 / (clip.analysedFps || 30);
  $('#pl-back', wrap).onclick = () => { setPlaying(false); seek(st.t - dtf); };
  $('#pl-fwd', wrap).onclick = () => { setPlaying(false); seek(st.t + dtf); };
  scrub.oninput = () => { setPlaying(false); seek(Number(scrub.value)); };
  $$('#pl-speed button', wrap).forEach((b) => (b.onclick = () => { st.speed = Number(b.dataset.s); $$('#pl-speed button', wrap).forEach((x) => x.classList.toggle('on', x === b)); if (!st.keypoint) video.playbackRate = st.speed; }));
  $$('[data-t]', wrap).forEach((c) => (c.onclick = () => { st[c.dataset.t] = !st[c.dataset.t]; c.classList.toggle('on', st[c.dataset.t]); paint(); }));
  $$('[data-j]', wrap).forEach((b) => (b.onclick = () => {
    const list = (a.strokeFrames[b.dataset.j] || []).filter((x) => x >= 0).map((x) => a.smoothed[x].t);
    if (!list.length) { toast('Not available for this recording.'); return; }
    const next = list.find((t) => t > st.t + 0.02) ?? list[0];
    setPlaying(false); seek(next);
  }));
  const onKey = (e) => {
    if (/input|select|textarea/i.test(document.activeElement && document.activeElement.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!st.playing); } else if (e.key === 'ArrowLeft') { setPlaying(false); seek(st.t - dtf); } else if (e.key === 'ArrowRight') { setPlaying(false); seek(st.t + dtf); }
  };
  document.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(() => { sizeCanvas(); paint(); }); ro.observe(canvas);
  setCleanup(() => { cancelAnimationFrame(st.raf); document.removeEventListener('keydown', onKey); ro.disconnect(); if (url) URL.revokeObjectURL(url); });

  // Snapshots
  const paintSnaps = async () => {
    const box = $('#pl-snaps', wrap);
    if (!s.snapshots.length) { box.innerHTML = ''; return; }
    const items = [];
    for (const sn of s.snapshots) { const b = await getBlob(sn.file); items.push(`<figure><img src="${b ? URL.createObjectURL(b) : ''}" alt="Snapshot at ${sn.t.toFixed(2)} s"><figcaption><span>${esc(sn.label || `${sn.t.toFixed(2)} s`)}</span><button class="btn sm quiet" data-del="${sn.id}" title="Delete snapshot">${icon('trash')}</button></figcaption></figure>`); }
    box.innerHTML = items.join('');
    $$('[data-del]', box).forEach((b) => (b.onclick = async () => {
      if (!(await confirmDanger('Delete this snapshot?', 'The snapshot is removed from this session.', 'Delete'))) return;
      const sn = s.snapshots.find((x) => x.id === b.dataset.del);
      await DB.del('blobs', sn.file); s.snapshots = s.snapshots.filter((x) => x !== sn); s.modified = new Date().toISOString(); await saveFile(); paintSnaps();
    }));
  };
  $('#pl-snap', wrap).onclick = async () => {
    setPlaying(false);
    const c = await renderFrameCanvas(a, clip, TF.nearestFrameIndex(frames, st.t), st.keypoint ? null : video, { skeleton: st.skeleton, angles: st.angles });
    const png = await new Promise((res) => c.toBlob(res, 'image/png'));
    const id = TF.uid('p');
    const near = (list) => list.some((x) => x >= 0 && Math.abs(a.smoothed[x].t - st.t) < 0.02);
    const label = near(a.strokeFrames.bdc) ? 'Bottom of stroke' : near(a.strokeFrames.tdc) ? 'Top of stroke' : near(a.strokeFrames.forward) ? 'Crank forward' : `${st.t.toFixed(2)} s`;
    const file = TF.PATHS.snapshot(r.id, s.id, id);
    await putBlob(file, png);
    s.snapshots.push({ id, file, t: st.t, label }); s.modified = new Date().toISOString();
    await saveFile(); paintSnaps(); toast('Snapshot saved to this session.');
  };
  requestAnimationFrame(() => { sizeCanvas(); const bdc = (a.strokeFrames.bdc || []).find((x) => x >= 0); seek(bdc >= 0 ? a.smoothed[bdc].t : 0); });
  st.raf = requestAnimationFrame(loop);
  paintSnaps();
}

/** A full-resolution frame with the overlay, for snapshots and the report. */
async function renderFrameCanvas(a, clip, i, video, opts) {
  const c = document.createElement('canvas'); c.width = clip.width; c.height = clip.height;
  const ctx = c.getContext('2d');
  if (video) ctx.drawImage(video, 0, 0, clip.width, clip.height);
  else { ctx.fillStyle = '#0A1220'; ctx.fillRect(0, 0, c.width, c.height); }
  drawOverlay(ctx, a, clip, i, Object.assign({ scale: 1, keypoint: !video }, opts || {}));
  return c;
}

/* ---------- report (brief section 11) ---------- */
async function svgToPng(svg, w, h) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/png');
}

async function makeReport(r, s) {
  toast('Preparing the report…', 2000);
  try {
    const jsPDF = await getJsPDF();
    const a = sessionAnalysis(s), clip = s.clips[0], cal0 = clip.calibration;
    const prof = s.profile || r.profile;
    // The same history and bike numbers as the screen, so the report never says something different.
    const opts = { history: historyFor(r, s), bikeMeasures: s.bikeMeasures };
    const resM = TF.buildResults(a, prof, clip.hand, s.discomfort, 'metric', opts);
    const resI = TF.buildResults(a, prof, clip.hand, s.discomfort, 'imperial', opts);
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const PW = 612, M = 48, ink = [11, 26, 51], ink2 = [68, 84, 108], ink3 = [107, 120, 139], orange = [196, 73, 15];
    const status = { good: [26, 138, 82], warn: [143, 106, 14], bad: [196, 49, 79], none: [138, 150, 168] };
    let y = M;
    const txt = (t, x, yy, o) => { const op = Object.assign({ size: 10, color: ink, bold: false, width: PW - 2 * M }, o || {}); doc.setFont('helvetica', op.bold ? 'bold' : 'normal'); doc.setFontSize(op.size); doc.setTextColor(...op.color); const lines = doc.splitTextToSize(String(t).replace(/\u2212/g, '-').replace(/\u2009/g, ' ').replace(/\s*\u2192\s*/g, ' to '), op.width); doc.text(lines, x, yy); return lines.length * op.size * 1.25; };
    const need = (h) => { if (y + h > 792 - M) { doc.addPage(); y = M; } };
    // Header
    const logo = await svgToPng(logoFullSVG(240, { ink: '#0B1A33', bike: '#B4BFD0', bg: '#FFFFFF' }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), 240, 240);
    doc.addImage(logo, 'PNG', M, y - 6, 46, 46);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...ink); doc.text('Tango', M + 54, y + 22);
    const tw = doc.getTextWidth('Tango'); doc.setTextColor(255, 106, 26); doc.text('Fitter', M + 54 + tw + 1, y + 22);
    txt('Bike fit report', PW - M - 140, y + 8, { size: 13, bold: true, width: 140 });
    txt(fmtDateTime(s.created), PW - M - 140, y + 24, { size: 9, color: ink3, width: 140 });
    y += 54;
    doc.setDrawColor(223, 229, 238); doc.line(M, y, PW - M, y); y += 18;
    // Rider and bike
    y += txt(`${r.name}`, M, y, { size: 14, bold: true });
    y += txt(`${TF.BIKE_TYPES[prof.bikeType]?.label || ''} · ${TF.GOALS[prof.goal] || ''} · ${TF.HAND_POSITIONS[clip.hand] || ''} · cranks ${s.bike.crankLength} mm · ${s.bike.wheel === 'custom' ? `${Math.round(s.bike.wheelDiameterMm)} mm wheel` : (TF.WHEELS[s.bike.wheel] || {}).label || ''} · ${Math.round(a.cadence)} rpm over ${a.strokes.length} strokes${s.sample ? ' · sample from a simulated rider' : ''}`, M, y, { size: 9.5, color: ink2 }) + 10;
    if (resM.gate.gated) {
      const h = 46; need(h);
      doc.setFillColor(249, 238, 218); doc.roundedRect(M, y - 12, PW - 2 * M, h, 6, 6, 'F');
      txt(`Please see a professional before changing the bike. Reported: ${resM.gate.reasons.join(', ')}. Treat the suggestion below as something to discuss with a clinician or professional fitter.`, M + 10, y + 2, { size: 9.5, width: PW - 2 * M - 20 });
      y += h + 6;
    }
    // Recommendation
    need(80);
    y += txt('Next change', M, y, { size: 9, bold: true, color: ink3 });
    const rc = resM.recommendation.current, rcI = resI.recommendation.current;
    if (rc) {
      y += txt(rc.text, M, y + 6, { size: 15, bold: true, color: orange }) + 4;
      if (rcI && rcI.text !== rc.text) y += txt(`Imperial: ${rcI.text}`, M, y + 2, { size: 9.5, color: ink2 });
      y += txt(rc.why, M, y + 6, { size: 10, color: ink2 }) + 4;
      if (rc.note) y += txt(rc.note, M, y + 4, { size: 9.5, color: ink2 }) + 2;
      // What to do next (brief C3).
      if (rc.kind !== 'stop') {
        const steps = [rc.howTo, `Make the change${rc.amount ? ` (${TF.fmtRange(rc.amount.lo, rc.amount.hi, 'metric')}, ${TF.fmtRange(rc.amount.lo, rc.amount.hi, 'imperial')})` : ''}.`, 'Ride for a few minutes to settle in, then start a retest with the camera in the same place.', rc.expect].filter(Boolean);
        const boxW = PW - 2 * M - 20;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        const h = 26 + steps.reduce((t, x) => t + doc.splitTextToSize(`• ${x}`, boxW).length * 9.5 * 1.25 + 3, 0);
        need(h + 14); y += 8;
        doc.setFillColor(255, 240, 230); doc.roundedRect(M, y - 4, PW - 2 * M, h, 6, 6, 'F');
        txt('What to do next', M + 10, y + 12, { size: 9.5, bold: true, color: orange, width: boxW });
        let yy = y + 28;
        for (const x of steps) yy += txt(`• ${x}`, M + 10, yy, { size: 9.5, color: ink2, width: boxW }) + 3;
        y += h + 4;
      }
      const nexts = [...resM.recommendation.queued.map((q) => q.text.replace(/\.$/, '')), ...resM.recommendation.later.map((l) => `${l.text} (next version)`)];
      if (nexts.length) y += txt(`After that: ${nexts.join('; ')}.`, M, y + 6, { size: 9.5, color: ink3 }) + 4;
    } else {
      y += txt('Saddle height and fore/aft are in range.', M, y + 6, { size: 15, bold: true, color: status.good }) + 6;
      if (resM.recommendation.later.length) y += txt(`Next version: ${resM.recommendation.later.map((l) => `${l.text}: ${l.why}`).join(' ')}`, M, y + 4, { size: 9.5, color: ink2 });
    }
    y += 12;
    // Retest strip.
    const prevF = s.retestOf ? findSession(s.retestOf) : null;
    if (prevF) {
      const pr = TF.buildResults(sessionAnalysis(prevF.session), prevF.session.profile || r.profile, (prevF.session.clips[0] || {}).hand, prevF.session.discomfort, 'metric');
      const pm = pr.recommendation && pr.recommendation.current ? pr.recommendation.current.metric : 'kneeExtension';
      const bv = (pr.gauges.find((g) => g.metric === pm) || {}).value, av = (resM.gauges.find((g) => g.metric === pm) || {}).value;
      const pc = prevF.session.clips[0] || {};
      const sum = TF.retestSummary({ cal: pc.calibration && Object.assign({}, pc.calibration, { bikeMeasures: prevF.session.bikeMeasures }) }, { cal: cal0 && Object.assign({}, cal0, { bikeMeasures: s.bikeMeasures }) }, pm, bv, av, 'metric');
      need(40);
      y += txt(`Retest of ${fmtDate(prevF.session.created)}`, M, y, { size: 9, bold: true, color: ink3 }) + 2;
      y += txt([sum.bike, sum.metric].filter(Boolean).join(' · ') + (sum.cameraMoved ? ' (the camera had moved; small bike differences may be the camera)' : ''), M, y + 4, { size: 10, color: ink2 }) + 12;
    }
    // Discomfort
    if (resM.discomfortNotes.length) {
      need(40);
      y += txt('Discomfort reported', M, y, { size: 9, bold: true, color: ink3 }) + 2;
      for (const n of resM.discomfortNotes) { need(40); y += txt(`${n.label} (${LEVEL_LABELS[n.level].toLowerCase()}${n.pattern ? ', ' + PATTERN_LABELS[n.pattern].toLowerCase() : ''}): ${n.text}`, M, y + 4, { size: 9.5, color: ink2 }) + 4; }
      y += 8;
    }
    // Snapshot
    const bdc = (a.strokeFrames.bdc || []).find((x) => x >= 0);
    let vid = null, vurl = null;
    if (clip.file) {
      const b = await getBlob(clip.file);
      if (b) {
        vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vurl = URL.createObjectURL(b); vid.src = vurl;
        const ok = await new Promise((res) => { vid.onloadeddata = () => res(true); vid.onerror = () => res(false); setTimeout(() => res(false), 5000); });
        if (ok) await new Promise((res) => { vid.onseeked = res; vid.currentTime = a.smoothed[bdc].t; setTimeout(res, 2000); }); else vid = null;
      }
    }
    const fc = await renderFrameCanvas(a, clip, bdc, vid, {});
    if (vurl) URL.revokeObjectURL(vurl);
    const imgW = PW - 2 * M, imgH = imgW * clip.height / clip.width;
    need(imgH + 30);
    y += txt('Bottom of the stroke', M, y, { size: 9, bold: true, color: ink3 }) + 2;
    doc.addImage(fc.toDataURL('image/jpeg', 0.85), 'JPEG', M, y, imgW, imgH); y += imgH + 18;
    // Measurements table
    need(40);
    y += txt('Measurements', M, y, { size: 9, bold: true, color: ink3 }) + 6;
    const cols = [M, M + 150, M + 225, M + 330, M + 430];
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ink3);
    ['Measurement', 'Value', 'Target', 'Status', 'Confidence'].forEach((h, i) => doc.text(h, cols[i], y)); y += 6;
    doc.setDrawColor(223, 229, 238); doc.line(M, y, PW - M, y); y += 14;
    for (const g of resM.gauges) {
      need(22);
      const gi = resI.gauges.find((x) => x.metric === g.metric);
      const m = TF.METRICS[g.metric];
      const val = TF.finite(g.value) ? TF.fmtMetric(g.metric, g.value, 'metric') + (m.unit === 'mm' ? ` (${TF.fmtMetric(g.metric, gi.value, 'imperial')})` : '') : '—';
      txt(m.label, cols[0], y, { size: 9.5, bold: true, width: 145 });
      txt(val, cols[1], y, { size: 9.5, width: 75 });
      txt(TF.fmtBand(g.metric, g.band, 'metric') + (m.unit === 'mm' ? ` (${TF.fmtBand(g.metric, g.band, 'imperial')})` : ''), cols[2], y, { size: 9, color: ink2, width: 100 });
      const sc = status[statusClass(g)];
      doc.setFillColor(...sc); doc.circle(cols[3] + 3, y - 3, 3, 'F');
      txt(statusWord(g), cols[3] + 10, y, { size: 9, color: ink2, width: 90 });
      txt(confLabel[g.confidence].replace(' confidence', ''), cols[4], y, { size: 9, color: ink2, width: 80 });
      y += 18;
    }
    y += 8;
    // The bike's numbers, metric and imperial.
    if (s.bikeMeasures) {
      need(100);
      y += txt('Your bike (from the marks)', M, y, { size: 9, bold: true, color: ink3 }) + 6;
      for (const k of ['saddleHeight', 'saddleSetback', 'drop', 'reach', 'effectiveSeatAngle']) {
        const v = s.bikeMeasures[k]; if (!TF.finite(v)) continue;
        need(18);
        const val = k === 'effectiveSeatAngle' ? `${v.toFixed(1)}°` : `${Math.round(v)} mm (${TF.fmtLength(v, 'imperial', 'length')})`;
        txt(TF.BIKE_MEASURES[k].label, cols[0], y, { size: 9.5, bold: true, width: 145 });
        txt(val, cols[1], y, { size: 9.5, width: 150 });
        txt(TF.BIKE_MEASURES[k].note, cols[3], y, { size: 9, color: ink2, width: 170 });
        y += 16;
      }
      y += 8;
    }
    // Second hand position.
    const a2 = secondAnalysis(s);
    if (a2 && a2.ok) {
      const r2 = TF.buildResults(a2, prof, s.secondClip.hand, s.discomfort, 'metric');
      need(60);
      y += txt(`${TF.HAND_POSITIONS[s.secondClip.hand]} (second position)`, M, y, { size: 9, bold: true, color: ink3 }) + 6;
      for (const g of r2.gauges.filter((x) => ['hipClosed', 'backAngle', 'shoulder', 'elbow', 'wrist'].includes(x.metric))) {
        need(18);
        txt(TF.METRICS[g.metric].label, cols[0], y, { size: 9.5, bold: true, width: 145 });
        txt(TF.finite(g.value) ? TF.fmtMetric(g.metric, g.value, 'metric') : '—', cols[1], y, { size: 9.5, width: 75 });
        txt(TF.fmtBand(g.metric, g.band, 'metric'), cols[2], y, { size: 9, color: ink2, width: 100 });
        doc.setFillColor(...status[statusClass(g)]); doc.circle(cols[3] + 3, y - 3, 3, 'F');
        txt(statusWord(g), cols[3] + 10, y, { size: 9, color: ink2, width: 90 });
        y += 16;
      }
      y += 8;
    }
    // Set-up quality
    const cal = clip.calibration;
    need(60);
    y += txt('Set-up quality', M, y, { size: 9, bold: true, color: ink3 }) + 2;
    y += txt(cal ? `Scale ${cal.pxPerMm.toFixed(3)} px/mm, crank and wheel agree within ${(cal.agreement * 100).toFixed(1)}%. Rear wheel ${Math.round(cal.squareRatio * 100)}% as wide as tall (camera square). Bike level within ${Math.abs(cal.tiltDeg).toFixed(1)}°. ${cal.warnings.map((w) => w.text).join(' ')}`
      : 'Calibration taps skipped: angles only, no millimetre measurements.', M, y + 4, { size: 9.5, color: ink2 }) + 4;
    y += txt(`Recording ${clip.width}×${clip.height} at ${Math.round(clip.fps || 30)} fps, ${(clip.durationS || 0).toFixed(1)} s, analysed at ${clip.analysedFps} fps.`, M, y + 4, { size: 9.5, color: ink2 }) + 12;
    // Limitations
    need(70);
    y += txt('Limitations', M, y, { size: 9, bold: true, color: ink3 }) + 2;
    y += txt('Tango Fitter is a self-fit guide, not medical advice. Measurements come from a single camera and depend on its placement, the lighting and clothing; angles are typically accurate to a few degrees, and hands and feet less so. Target ranges are general starting points for the bike type and riding goal, not a diagnosis. Make one change at a time and confirm it with a retest. Stop and consult a professional fitter or clinician for pain, numbness, injury or a large difference between the left and right sides.', M, y + 4, { size: 9, color: ink2 });
    // Footer
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) { doc.setPage(p); txt(`${C.app.name} ${C.app.version} · ${r.name} · ${fmtDate(s.created)} · page ${p} of ${pages}`, M, 792 - 26, { size: 8, color: ink3 }); }
    const blob = doc.output('blob');
    const id = TF.uid('rep');
    const file = TF.PATHS.report(r.id, s.id, id);
    await putBlob(file, blob);
    s.reports.push({ id, file, created: new Date().toISOString() }); s.modified = new Date().toISOString();
    await saveFile();
    await deliverFile(blob, `tango-fit-${slug(r.name)}-${s.created.slice(0, 10)}.pdf`, 'application/pdf');
  } catch (e) { console.error(e); toast(`The report could not be made: ${esc(e.message)}`, 6000); }
}
