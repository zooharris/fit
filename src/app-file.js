/* ==========================================================================
   Fit file: .tango export / open / merge, new file, sample fit (brief section 10)
   ========================================================================== */

/** Every blob path a session refers to. */
function sessionBlobPaths(s) {
  return [...s.clips.map((c) => c.file), ...s.snapshots.map((x) => x.file), ...s.reports.map((x) => x.file)].filter(Boolean);
}

async function estimateSizes() {
  let json = 0, video = 0, other = 0;
  for (const r of S.file.riders) {
    json += JSON.stringify(r).length;
    for (const s of r.sessions) {
      for (const c of s.clips) if (c.file) { const b = await getBlob(c.file); if (b) video += b.size; }
      for (const x of [...s.snapshots, ...s.reports]) if (x.file) { const b = await getBlob(x.file); if (b) other += b.size; }
    }
  }
  return { full: json + video + other, lite: json + other, video };
}
const mb = (bytes) => (bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`);

async function buildZip(mode) {
  const JSZip = await getJSZip();
  const zip = new JSZip();
  const f = S.file, now = new Date().toISOString();
  const manifest = Object.assign({}, f, { riders: f.riders.map((r) => ({ id: r.id, name: r.name })), exported: now, exportMode: mode, appVersion: C.app.version });
  zip.file(TF.PATHS.manifest, JSON.stringify(manifest, null, 1));
  for (const r of f.riders) {
    zip.file(TF.PATHS.rider(r.id), JSON.stringify(Object.assign({}, r, { sessions: r.sessions.map((s) => s.id) }), null, 1));
    for (const s of r.sessions) {
      const sOut = JSON.parse(JSON.stringify(s));
      if (mode === 'lite') for (const c of sOut.clips) { if (c.file) { c.videoOmitted = true; } }
      zip.file(TF.PATHS.session(r.id, s.id), JSON.stringify(sOut));
      const paths = mode === 'full' ? sessionBlobPaths(s) : sessionBlobPaths(s).filter((p) => !/\/clips\//.test(p));
      for (const p of paths) { const b = await getBlob(p); if (b) zip.file(p, b, { compression: 'STORE' }); }
    }
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/octet-stream' });
}

/** Hand a file to the user: the share sheet where it can take files (iOS → Files/iCloud), otherwise a download. */
async function deliverFile(blob, name, type) {
  const file = new File([blob], name, { type: type || blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

async function exportFlow(forceMode) {
  if (!S.file) return;
  const sizes = await estimateSizes();
  let mode = forceMode || C.export.defaultMode;
  if (!forceMode && sizes.full > C.export.suggestLiteAboveMB * 1e6) {
    const v = await sheet({
      title: 'Export the fit file',
      body: `<p class="muted">This file is large because it carries the videos. <b>Full</b> keeps everything. <b>Lite</b> leaves the videos out; measurements, history, snapshots, reports and the skeleton playback all stay.</p>
        <dl class="kv" style="margin-top:12px"><dt>Full</dt><dd>${mb(sizes.full)}</dd><dt>Lite</dt><dd>${mb(sizes.lite)}</dd></dl>`,
      actions: [{ label: 'Cancel', value: null, kind: 'quiet' }, { label: `Lite (${mb(sizes.lite)})`, value: 'lite' }, { label: `Full (${mb(sizes.full)})`, value: 'full', kind: 'primary' }],
    });
    if (!v) return; mode = v;
  }
  toast(`Preparing the ${mode === 'lite' ? 'Lite' : 'Full'} file…`, 2000);
  try {
    const blob = await buildZip(mode);
    const name = `${slug(S.file.name)}-${new Date().toISOString().slice(0, 10)}${C.app.fileExtension}`;
    const ok = await deliverFile(blob, name, 'application/octet-stream');
    if (ok) { S.meta.lastExportedAt = new Date().toISOString(); await saveMeta(); toast(`Exported ${esc(name)} (${mb(blob.size)}).`); render(); }
  } catch (e) { console.error(e); toast(`Export failed: ${esc(e.message)}`, 6000); }
}

/** Read a .tango file into { file, blobs: Map(path → Blob) }. */
async function readTango(blobIn) {
  const JSZip = await getJSZip();
  let zip;
  try { zip = await JSZip.loadAsync(blobIn); } catch { throw new Error('This is not a Tango Fitter file (it is not a .tango archive).'); }
  const mf = zip.file(TF.PATHS.manifest);
  if (!mf) throw new Error('This is not a Tango Fitter file (no manifest inside).');
  const manifest = JSON.parse(await mf.async('string'));
  const riders = [];
  for (const ref of manifest.riders || []) {
    const rf = zip.file(TF.PATHS.rider(ref.id));
    if (!rf) continue;
    const r = JSON.parse(await rf.async('string'));
    const sessions = [];
    for (const sid of r.sessions || []) {
      const sf = zip.file(TF.PATHS.session(r.id, sid));
      if (sf) sessions.push(JSON.parse(await sf.async('string')));
    }
    r.sessions = sessions;
    riders.push(r);
  }
  const fileObj = Object.assign({}, manifest, { riders });
  delete fileObj.exported; delete fileObj.exportMode;
  TF.migrateFile(fileObj);
  const blobs = new Map();
  for (const r of riders) for (const s of r.sessions) for (const p of sessionBlobPaths(s)) {
    const z = zip.file(p);
    if (z) { const type = /\.png$/.test(p) ? 'image/png' : /\.pdf$/.test(p) ? 'application/pdf' : (s.clips.find((c) => c.file === p) || {}).mime || 'video/mp4'; blobs.set(p, new Blob([await z.async('arraybuffer')], { type })); }
  }
  return { file: fileObj, blobs };
}

function pickFile() {
  return new Promise((resolve) => {
    // No accept filter: iOS greys out files whose type it does not know, and .tango is ours.
    const input = el('<input type="file" style="display:none">');
    input.onchange = () => { resolve(input.files[0] || null); input.remove(); };
    document.body.appendChild(input); input.click();
  });
}

async function openFileFlow(preFile) {
  const f = preFile || await pickFile();
  if (!f) return;
  let data;
  try { toast('Opening…', 1500); data = await readTango(f); } catch (e) { await sheet({ title: 'Could not open the file', body: `<p class="muted">${esc(e.message)}</p>`, actions: [{ label: 'OK', value: true, kind: 'primary' }] }); return; }
  const inc = data.file;
  const nS = inc.riders.reduce((n, r) => n + r.sessions.length, 0);
  let mode = 'replace';
  if (S.file) {
    mode = await sheet({
      title: `Open “${esc(inc.name)}”`,
      body: `<p class="muted">It holds ${plural(inc.riders.length, 'rider')} and ${plural(nS, 'session')}.</p>
        <p class="muted" style="margin-top:8px"><b>Replace</b> closes “${esc(S.file.name)}” and opens this one${unexported() ? ' — the current file has changes that have not been exported, which would be lost' : ''}. <b>Merge</b> adds this file's riders and sessions to the current file (the newer copy of any session wins).</p>`,
      actions: [{ label: 'Cancel', value: null, kind: 'quiet' }, { label: 'Merge', value: 'merge' }, { label: 'Replace', value: 'replace', kind: unexported() ? 'danger' : 'primary' }],
    });
    if (!mode) return;
  }
  if (mode === 'replace') {
    await DB.clear('blobs');
    for (const [p, b] of data.blobs) await putBlob(p, b);
    S.file = inc; S.riderId = inc.riders[0] ? inc.riders[0].id : null; S.cache.clear();
    S.meta.lastExportedAt = inc.modified; // what is open now is exactly what is in the file
    await saveFile(false);
    toast(`Opened “${esc(inc.name)}”: ${plural(inc.riders.length, 'rider')}, ${plural(nS, 'session')}.`);
  } else {
    const m = TF.mergeFiles(S.file, inc);
    // Copy the blobs of every session that came from the incoming file.
    for (const r of m.file.riders) for (const s of r.sessions) {
      const src = inc.riders.flatMap((x) => x.sessions).find((x) => x.id === s.id && x.modified === s.modified);
      if (src) for (const p of sessionBlobPaths(src)) if (data.blobs.has(p)) await putBlob(p, data.blobs.get(p));
    }
    S.file = m.file; S.cache.clear();
    await saveFile(true);
    toast(`Merged: ${plural(m.ridersAdded, 'rider')} and ${plural(m.sessionsAdded, 'session')} added, ${plural(m.sessionsUpdated, 'session')} updated.`, 5000);
  }
  go('#/');
}

async function newFileFlow() {
  if (S.file && unexported()) {
    const v = await sheet({ title: 'Start a new fit file?', body: '<p class="muted">The open file has changes that have not been exported. Starting a new file closes it, and those changes would be lost.</p>',
      actions: [{ label: 'Cancel', value: null, kind: 'quiet' }, { label: 'Export first', value: 'export' }, { label: 'Discard and start new', value: 'new', kind: 'danger' }] });
    if (!v) return;
    if (v === 'export') { await exportFlow(); return; }
  }
  const name = await promptText('New fit file', 'File name', S.file ? 'My fits' : 'My fits', 'A fit file can hold several riders, for example a household.');
  if (!name) return;
  await DB.clear('blobs');
  S.file = TF.newFitFile(name); S.riderId = null; S.cache.clear(); S.meta.lastExportedAt = null;
  await saveFile();
  go('#/rider/new');
}

/** A sample fit built from the synthetic rider, so the app can be explored without a camera. */
async function createSampleFile() {
  S.file = TF.newFitFile('Sample fit'); S.cache.clear();
  const r = TF.newRider('Sample rider');
  r.profile = Object.assign(r.profile, { bikeType: 'road', goal: 'endurance', hands: ['hoods', 'drops'], flexibility: 'nearly' });
  r.bike = Object.assign(r.bike, { name: 'Sample road bike', crankLength: 172.5, wheel: '700x28' });
  S.file.riders.push(r); S.riderId = r.id;
  const s = TF.newSession(r);
  s.sample = true;
  s.created = s.modified = new Date(Date.now() - 3600e3).toISOString();
  s.discomfort = { regions: { kneeFront: { level: 'mild', pattern: 'builds' } }, numbness: false, recentInjury: false };
  // A realistic road position (hoods about 60 mm below the saddle nose), marked on the empty bike.
  const sim = TF.simulateRider({ saddleOffsetMm: -13, seconds: 14, seed: 11, torso: 480, backDeg: 40, handAngleDeg: -48, upperArm: 340, forearm: 300 });
  const cal = TF.computeCalibration(sim.marks, r.bike, sim.height, sim.width); cal.markedWithRider = false;
  const clip = { id: TF.uid('c'), view: 'side', hand: 'hoods', mime: null, file: null, width: sim.width, height: sim.height, fps: 30, analysedFps: 30, durationS: sim.frames[sim.frames.length - 1].t, calibration: cal, frames: sim.frames, live: { strokes: 19, cadence: 85 }, captureSettings: {}, sample: true };
  s.clips.push(clip);
  s.marks = JSON.parse(JSON.stringify(sim.marks)); s.bikeMeasures = cal.bikeMeasures; s.markedWithRider = false;
  const a = TF.analyseClip(clip);
  clip.calibration = a.calibration || cal;
  s.results = TF.buildResults(a, s.profile, clip.hand, s.discomfort, Settings.v.units);
  s.results.cadence = a.cadence; s.results.strokes = a.strokes.length;
  r.sessions.push(s);
  S.meta.lastExportedAt = null;
  await DB.clear('blobs');
  await saveFile();
  return s;
}
