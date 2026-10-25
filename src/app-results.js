/* ==========================================================================
   Results: recommendation, discomfort notes, gauges, playback, report
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
  return `<button class="gauge ${flagged ? 'flagged' : ''}" data-metric="${g.metric}" aria-expanded="false">
    <div class="top"><span class="name">${esc(m.label)}</span><span class="tiny status-${sc}" style="font-weight:600">${esc(statusWord(g))}</span></div>
    <div class="top"><span class="val ${TF.finite(g.value) ? '' : 'none'}">${TF.finite(g.value) ? esc(TF.fmtMetric(g.metric, g.value, u)) : '—'}</span><span class="tiny faint">${esc(m.where)}</span></div>
    ${bar}
    <div class="meta"><span>Target ${esc(TF.fmtBand(g.metric, band, u))}</span><span class="conf ${g.confidence}" title="${esc(confLabel[g.confidence])}"><i></i><i></i><i></i></span></div>
    <div class="about" hidden>${esc(m.about)}${g.reason ? `<br><span class="faint">${esc(confLabel[g.confidence])}: ${esc(g.reason)}</span>` : `<br><span class="faint">${esc(confLabel[g.confidence])}.</span>`}${TF.finite(g.spread) && g.spread > 0 ? `<br><span class="faint">Stroke-to-stroke spread ±${esc(m.unit === 'mm' ? TF.fmtLength(g.spread / 2, u, 'adjust') : `${Math.round(g.spread / 2)}°`)}.</span>` : ''}</div>
  </button>`;
}

function recommendationHTML(s, res) {
  const rec = res.recommendation, gate = res.gate, cal = s.clips[0] && s.clips[0].calibration;
  const prof = gate.gated ? `<span class="tag warn">For discussion with a professional</span>` : '';
  const later = rec.later.length ? `<div class="hr"></div><div class="caption">Coming in the next version</div><div class="next-list">${rec.later.map((l, i) => `<div class="it"><span class="n">${i + 1}</span><div><b>${esc(l.text)}</b><div class="small muted">${esc(l.why)}</div></div></div>`).join('')}</div>` : '';
  if (rec.current) {
    const c = rec.current;
    return `<div class="panel accent reco">
      <div class="eyebrow"><span class="caption">Your next change</span><span class="tag ${c.strength === 'recommended' ? 'accent' : ''}">${c.strength === 'recommended' ? 'Recommended' : 'Fine-tune'}</span>${prof}</div>
      <div class="action">${esc(c.text)}</div>
      <p class="why">${esc(c.why)}</p>
      ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
      <p class="small faint" style="margin-top:10px">${esc(c.howTo)}</p>
      <div class="btn-row">${s.sample ? '' : `<a class="btn primary" href="#/session/new?retest=${s.id}">${icon('refresh')}I've made this change — retest</a>`}<button class="btn quiet" data-goto="gauges">See the measurements</button></div>
      ${rec.queued.length ? `<div class="hr"></div><div class="caption">After that</div><div class="next-list">${rec.queued.map((q, i) => `<div class="it"><span class="n">${i + 2}</span><div>${esc(q.text)}<div class="small muted">${esc(q.why)}</div></div></div>`).join('')}</div>` : ''}
      ${later}
      ${!cal ? `<div class="banner warn" style="margin-top:12px">${icon('alert')}<div class="grow">This session was analysed without the calibration taps, so there is no knee-over-pedal measurement and no amounts in millimetres.</div></div>` : ''}
    </div>`;
  }
  return `<div class="panel reco ok">
    <div class="eyebrow"><span class="caption">Saddle position</span>${prof}</div>
    <div class="action">Saddle height and fore/aft are in range</div>
    <p class="why">Nothing to change on the saddle. ${rec.later.length ? 'The measurements below include reach and drop, which the next version will advise on.' : 'Your measurements are within the target ranges for your bike and riding style.'}</p>
    ${later}</div>`;
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
  const prev = s.retestOf ? findSession(s.retestOf) : null;
  let retestHTML = '';
  if (prev) {
    const pr = sessionResults(prev.rider, prev.session);
    const pm = pr && pr.recommendation && pr.recommendation.current ? pr.recommendation.current.metric : 'kneeExtension';
    const before = pr && pr.gauges.find((g) => g.metric === pm), after = res.gauges.find((g) => g.metric === pm);
    if (before && after) {
      retestHTML = `<div class="panel tight"><div class="caption">Retest of ${esc(fmtDateTime(prev.session.created))}</div>
        <p class="delta" style="margin-top:6px">${esc(TF.METRICS[pm].label)}: <b>${esc(TF.fmtMetric(pm, before.value, Settings.v.units))}</b> → <b>${esc(TF.fmtMetric(pm, after.value, Settings.v.units))}</b>
        <span class="tag ${statusClass(after)}" style="margin-left:6px">${esc(statusWord(after))}</span></p>
        ${s.change ? `<p class="small muted" style="margin-top:4px">${s.change.made === 'yes' ? `Change made: ${esc(s.change.action)}` : s.change.made === 'different' ? `Different change: ${esc(s.change.note || 'not described')}` : 'No change made since last time.'}</p>` : ''}
        <a class="btn sm quiet" href="#/session/${prev.session.id}" style="margin-top:6px">Open the earlier session</a></div>`;
    }
  }
  const cal = clip.calibration;
  const u = Settings.v.units;
  main.innerHTML = `
    <div class="page-head"><div><h1>Fit results</h1><div class="sub">${esc(fmtDateTime(s.created))} · ${esc(r.name)} · ${esc(TF.HAND_POSITIONS[clip.hand] || '')} · ${Math.round(res.cadence)} rpm · ${plural(res.strokes, 'stroke')}</div></div>
      <div class="row">${s.sample ? '<span class="tag teal">Sample from a simulated rider</span>' : ''}${s.retestOf ? '<span class="tag">Retest</span>' : ''}</div></div>
    ${res.gate.gated ? `<div class="banner warn" style="margin-bottom:14px">${icon('alert')}<div class="grow"><b>Please see a professional before changing your bike.</b> You mentioned ${esc(res.gate.reasons.join(', '))}. A clinician or professional fitter should look at that first. The measurements are below; treat any suggestion as something to discuss with them.</div></div>` : ''}
    <div class="two">
      <div class="stack">
        ${recommendationHTML(s, res)}
        ${retestHTML}
        ${res.discomfortNotes.length ? `<div class="panel stack"><h2>What you told us</h2>${res.discomfortNotes.map((n) => `<div><b>${esc(n.label)}</b> <span class="tag ${n.level === 'severe' ? 'bad' : n.level === 'moderate' ? 'warn' : ''}">${esc(LEVEL_LABELS[n.level])}</span>${n.pattern ? ` <span class="tiny faint">${esc(PATTERN_LABELS[n.pattern])}</span>` : ''}<p class="small muted" style="margin-top:4px">${esc(n.text)}</p></div>`).join('')}</div>` : ''}
      </div>
      <div class="stack">
        <div id="player-wrap"></div>
      </div>
    </div>
    <div class="section" id="gauges"><div class="section-head"><h2>Measurements</h2><span class="small faint">Tap a measurement for details</span></div>
      <div class="gauges">${res.gauges.map((g) => gaugeHTML(g, flagged.has(g.metric))).join('')}</div></div>
    <div class="section"><h2>Set-up quality</h2><div class="panel">
      <dl class="kv">
        ${cal ? `<dt>Scale</dt><dd>${(cal.pxPerMm).toFixed(3)} px/mm; crank and wheel agree within ${(cal.agreement * 100).toFixed(1)}%</dd><dt>Camera square</dt><dd>Rear wheel ${Math.round(cal.squareRatio * 100)}% as wide as tall</dd><dt>Bike level</dt><dd>${Math.abs(cal.tiltDeg).toFixed(1)}°${Math.abs(cal.tiltDeg) > 0.05 ? (cal.tiltDeg > 0 ? ' front high (corrected)' : ' front low (corrected)') : ''}</dd>`
    : '<dt>Calibration</dt><dd class="status-warn">Skipped: no millimetre measurements</dd>'}
        <dt>Recording</dt><dd>${clip.width}×${clip.height}, ${Math.round(clip.fps || 30)} fps, ${(clip.durationS || 0).toFixed(1)} s, analysed at ${clip.analysedFps} fps${clip.analysisSeconds ? ` in ${clip.analysisSeconds} s` : ''}</dd>
        <dt>Tracking</dt><dd>${esc(a.side === 'left' ? 'Left' : 'Right')} side towards the camera; pedal stroke from ${a.phaseSource === 'crank' ? 'the crank (calibrated)' : 'the foot path'}</dd>
        <dt>Bike</dt><dd>${esc(U.len(s.bike.crankLength, 'length'))} cranks, ${esc(s.bike.wheel === 'custom' ? U.len(s.bike.wheelDiameterMm, 'length') + ' wheel' : (TF.WHEELS[s.bike.wheel] || {}).label || '')}</dd>
        ${clip.level ? `<dt>Phone level</dt><dd>${Math.abs(clip.level.pitch).toFixed(1)}° ${clip.level.pitch >= 0 ? 'up' : 'down'}, rotated ${Math.abs(clip.level.roll).toFixed(1)}°</dd>` : ''}
      </dl></div></div>
    <div class="section btn-row">
      <button class="btn" id="rs-report">${icon('report')}Report (PDF)</button>
      <button class="btn" id="rs-export">${icon('download')}Export fit file</button>
      <span style="flex:1"></span>
      <button class="btn danger" id="rs-del">${icon('trash')}Delete session</button>
    </div>
    <p class="small faint section">Tango Fitter is a self-fit guide, not medical advice. Measurements depend on camera placement and lighting; suggestions are starting points to confirm with a retest. Stop and see a professional for pain, numbness, injury or a large left–right difference.</p>`;
  $$('.gauge', main).forEach((g) => (g.onclick = () => { const ab = $('.about', g); ab.hidden = !ab.hidden; g.setAttribute('aria-expanded', String(!ab.hidden)); }));
  $$('[data-goto]', main).forEach((b) => (b.onclick = () => $('#' + b.dataset.goto, main).scrollIntoView({ behavior: 'smooth' })));
  $('#rs-report', main).onclick = () => makeReport(r, s);
  $('#rs-export', main).onclick = () => exportFlow();
  $('#rs-del', main).onclick = () => deleteSession(r, s);
  await mountPlayer($('#player-wrap', main), r, s, a);
}, { needsFile: true, nav: 'fit' });

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
    <div class="row between"><h2>Playback</h2><div class="chips"><button class="chip on" data-t="skeleton">Skeleton</button><button class="chip on" data-t="angles">Angles</button></div></div>
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
    const a = sessionAnalysis(s), clip = s.clips[0];
    const prof = s.profile || r.profile;
    const resM = TF.buildResults(a, prof, clip.hand, s.discomfort, 'metric');
    const resI = TF.buildResults(a, prof, clip.hand, s.discomfort, 'imperial');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const PW = 612, M = 48, ink = [11, 26, 51], ink2 = [68, 84, 108], ink3 = [107, 120, 139], orange = [196, 73, 15];
    const status = { good: [26, 138, 82], warn: [143, 106, 14], bad: [196, 49, 79], none: [138, 150, 168] };
    let y = M;
    const txt = (t, x, yy, o) => { const op = Object.assign({ size: 10, color: ink, bold: false, width: PW - 2 * M }, o || {}); doc.setFont('helvetica', op.bold ? 'bold' : 'normal'); doc.setFontSize(op.size); doc.setTextColor(...op.color); const lines = doc.splitTextToSize(String(t).replace(/\u2212/g, '-').replace(/\u2009/g, ' '), op.width); doc.text(lines, x, yy); return lines.length * op.size * 1.25; };
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
      const nexts = [...resM.recommendation.queued.map((q) => q.text), ...resM.recommendation.later.map((l) => `${l.text} (next version)`)];
      if (nexts.length) y += txt(`After that: ${nexts.join('; ')}.`, M, y + 6, { size: 9.5, color: ink3 }) + 4;
    } else {
      y += txt('Saddle height and fore/aft are in range.', M, y + 6, { size: 15, bold: true, color: status.good }) + 6;
      if (resM.recommendation.later.length) y += txt(`Next version: ${resM.recommendation.later.map((l) => `${l.text}: ${l.why}`).join(' ')}`, M, y + 4, { size: 9.5, color: ink2 });
    }
    y += 12;
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
      txt(TF.fmtBand(g.metric, g.band, 'metric'), cols[2], y, { size: 9, color: ink2, width: 100 });
      const sc = status[statusClass(g)];
      doc.setFillColor(...sc); doc.circle(cols[3] + 3, y - 3, 3, 'F');
      txt(statusWord(g), cols[3] + 10, y, { size: 9, color: ink2, width: 90 });
      txt(confLabel[g.confidence].replace(' confidence', ''), cols[4], y, { size: 9, color: ink2, width: 80 });
      y += 18;
    }
    y += 8;
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
