/* ==========================================================================
   Tango Fitter — app core: settings, storage, routing, UI helpers, audio, pose
   ========================================================================== */
const TF = window.TF;
const C = TF.CONFIG;

/* ---------- icons (24×24 stroke icons) ---------- */
const ICONS = {
  fit: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  settings: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  stepB: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
  stepF: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  report: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  flip: '<path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3"/><path d="m6 2 3 3-3 3"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  target: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
};
const icon = (name, cls) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICONS[name] || ''}</svg>`;

/* ---------- DOM helpers ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtDate = (iso) => { const d = new Date(iso); return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
const fmtDateTime = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`; };
const initials = (name) => (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const slug = (s) => (s || 'fit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fit';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ---------- settings (per device, localStorage) ---------- */
const DEFAULT_SETTINGS = {
  units: C.units.default, theme: 'system', audioMode: C.audio.mode,
  startMode: C.triggers.startMode, startSeconds: C.triggers.startSeconds, startBeeps: C.triggers.startBeeps, startStrokes: C.triggers.startStrokes,
  stopMode: C.triggers.stopMode, stopSeconds: C.triggers.stopSeconds, stopStrokes: C.triggers.stopStrokes,
  exportPrompt: C.export.promptAfterSession, cameraFacing: 'environment', cameraId: '',
};
const Settings = {
  v: Object.assign({}, DEFAULT_SETTINGS),
  load() { try { Object.assign(this.v, JSON.parse(localStorage.getItem('tango.settings') || '{}')); } catch { /* private mode */ } },
  set(k, val) { this.v[k] = val; try { localStorage.setItem('tango.settings', JSON.stringify(this.v)); } catch { /* private mode */ } },
};
Settings.load();

function applyTheme() {
  const t = Settings.v.theme;
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  const light = t === 'light' || (t === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', light ? '#F4F6FA' : '#0A1220');
}
applyTheme();
window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);

/* ---------- IndexedDB: the working copy of the open fit file ---------- */
const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('tango-fitter', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('meta'); d.createObjectStore('blobs'); };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode); const s = t.objectStore(store);
      let out; Promise.resolve(fn(s)).then((v) => { out = v; });
      t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  get(store, key) { return this.tx(store, 'readonly', (s) => s.get(key)); },
  put(store, key, val) { return this.tx(store, 'readwrite', (s) => { s.put(val, key); }); },
  del(store, key) { return this.tx(store, 'readwrite', (s) => { s.delete(key); }); },
  keys(store) { return this.tx(store, 'readonly', (s) => s.getAllKeys()); },
  clear(store) { return this.tx(store, 'readwrite', (s) => { s.clear(); }); },
};

/* ---------- app state ---------- */
const S = {
  file: null,          // the open fit file (JSON, without blobs)
  riderId: null,
  meta: { lastExportedAt: null, lastExportPromptFor: null },
  session: null,       // in-progress capture session (not yet saved)
  cache: new Map(),    // session id → recomputed analysis
};
const rider = () => (S.file ? S.file.riders.find((r) => r.id === S.riderId) || S.file.riders[0] || null : null);
const findSession = (id) => { for (const r of (S.file ? S.file.riders : [])) { const s = r.sessions.find((x) => x.id === id); if (s) return { rider: r, session: s }; } return null; };
const allSessions = () => (S.file ? S.file.riders.flatMap((r) => r.sessions.map((s) => ({ rider: r, session: s }))) : []);

async function loadState() {
  try {
    const f = await DB.get('meta', 'file');
    if (f) S.file = TF.migrateFile(f);
    const m = await DB.get('meta', 'state');
    if (m) S.meta = Object.assign(S.meta, m);
    S.riderId = (m && m.riderId) || (S.file && S.file.riders[0] && S.file.riders[0].id) || null;
  } catch (e) { console.warn('Could not read saved data', e); }
}
async function saveFile(touch = true) {
  if (!S.file) return;
  if (touch) S.file.modified = new Date().toISOString();
  await DB.put('meta', 'file', S.file);
  await saveMeta();
}
async function saveMeta() { await DB.put('meta', 'state', Object.assign({}, S.meta, { riderId: S.riderId })); }
const unexported = () => S.file && S.file.riders.some((r) => r.sessions.length) && (!S.meta.lastExportedAt || S.meta.lastExportedAt < S.file.modified);

async function putBlob(path, blob) { await DB.put('blobs', path, blob); }
async function getBlob(path) { return DB.get('blobs', path); }
async function deleteBlobs(prefix) { for (const k of await DB.keys('blobs')) if (String(k).startsWith(prefix)) await DB.del('blobs', k); }

/* ---------- lazy libraries ---------- */
const scriptPromises = {};
function loadScript(url) {
  if (scriptPromises[url]) return scriptPromises[url];
  scriptPromises[url] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = url; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = () => { delete scriptPromises[url]; rej(new Error(`Could not load ${url.split('/').slice(-1)[0]}. Check the internet connection.`)); };
    document.head.appendChild(s);
  });
  return scriptPromises[url];
}
async function getJSZip() { if (!window.JSZip) await loadScript(C.libraries.jszip); return window.JSZip; }
async function getJsPDF() { if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript(C.libraries.jspdf); return window.jspdf.jsPDF; }

/* ---------- pose detection ----------
   loadPose('lite' | 'heavy', onProgress) → { detect(source, tsMs) → compact landmarks | null, close() }
   The model is downloaded once with progress and kept in Cache Storage, so later runs work offline.
   A test hook (window.__TF_FAKE_POSE) replaces the detector for automated browser tests. */
let visionPromise = null;
async function vision() {
  if (!visionPromise) {
    visionPromise = (async () => {
      const mod = await import(C.libraries.visionBundle);
      const fileset = await mod.FilesetResolver.forVisionTasks(C.libraries.visionWasm);
      return { mod, fileset };
    })().catch((e) => { visionPromise = null; throw e; });
  }
  return visionPromise;
}
async function fetchModel(url, onProgress) {
  let cache = null;
  try { cache = await caches.open('tango-models-v1'); const hit = await cache.match(url); if (hit) { onProgress && onProgress(1, true); return new Uint8Array(await hit.arrayBuffer()); } } catch { /* no Cache Storage */ }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model download failed (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; if (onProgress && total) onProgress(got / total, false); }
  const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  try { if (cache) await cache.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })); } catch { /* quota */ }
  onProgress && onProgress(1, false);
  return buf;
}
async function loadPose(kind, onProgress) {
  if (window.__TF_FAKE_POSE) {
    onProgress && onProgress(1, true);
    return { kind, fake: true, detect: (src, ts) => window.__TF_FAKE_POSE(kind, src, ts), close() {} };
  }
  const { mod, fileset } = await vision();
  const buf = await fetchModel(kind === 'heavy' ? C.libraries.poseHeavy : C.libraries.poseLite, onProgress);
  const make = (delegate) => mod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: buf, delegate }, runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: C.pose.minDetectionConfidence, minPosePresenceConfidence: C.pose.minPresenceConfidence, minTrackingConfidence: C.pose.minTrackingConfidence,
  });
  let lm;
  try { lm = await make(C.pose.delegate); } catch (e) { console.warn('GPU delegate failed, using CPU', e); lm = await make('CPU'); }
  let lastTs = -1;
  return {
    kind,
    detect(source, tsMs) {
      const ts = Math.max(lastTs + 1, Math.round(tsMs)); lastTs = ts;
      const r = lm.detectForVideo(source, ts);
      const p = r && r.landmarks && r.landmarks[0];
      return p ? TF.compactLandmarks(p) : null;
    },
    close() { try { lm.close(); } catch { /* already closed */ } },
  };
}

/* ---------- audio guidance: voice and beeps ---------- */
const Sound = {
  ctx: null, voice: null, unlocked: false,
  unlock() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // A silent blip inside the tap so iOS allows sound later.
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); g.gain.value = 0.0001; o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + 0.02);
    } catch { /* no Web Audio */ }
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u);
        const pick = () => { const vs = speechSynthesis.getVoices(); this.voice = vs.find((v) => /en[-_](US|GB)/i.test(v.lang) && /Samantha|Daniel|Google|Natural|Enhanced|Premium/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || null; };
        pick(); speechSynthesis.onvoiceschanged = pick;
      }
    } catch { /* no speech */ }
    this.unlocked = true;
  },
  wantsVoice() { return Settings.v.audioMode !== 'beeps'; },
  wantsBeeps() { return Settings.v.audioMode !== 'voice'; },
  say(text, opts) {
    const o = opts || {};
    Sound.lastSaid = text;
    if (!this.wantsVoice() || !('speechSynthesis' in window)) return Promise.resolve();
    if (o.interrupt !== false) speechSynthesis.cancel();
    return new Promise((res) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = C.audio.rate; u.volume = C.audio.volume; if (this.voice) u.voice = this.voice;
      let done = false; const fin = () => { if (!done) { done = true; res(); } };
      u.onend = fin; u.onerror = fin; setTimeout(fin, 900 + text.length * 85);
      speechSynthesis.speak(u);
    });
  },
  tone(freq, ms, vol) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || 0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
    } catch { /* ignore */ }
  },
  // Beep meanings (shown in the on-screen legend): short = countdown, long high = recording started,
  // two high = recording finished, low double = problem.
  beep(kind) {
    if (!this.wantsBeeps()) return;
    const A = C.audio;
    if (kind === 'count') this.tone(A.beepHz, A.beepMs);
    else if (kind === 'start') this.tone(A.beepHighHz, 420, 0.3);
    else if (kind === 'stop') { this.tone(A.beepHighHz, 160); setTimeout(() => this.tone(A.beepHighHz, 160), 220); }
    else if (kind === 'problem') { this.tone(330, 180); setTimeout(() => this.tone(330, 180), 240); }
    else if (kind === 'tick') this.tone(A.tickHz, A.tickMs, 0.12);
  },
  stop() { try { speechSynthesis.cancel(); } catch { /* ignore */ } },
};
const BEEP_LEGEND = [
  ['Short beeps', 'counting down to the recording'],
  ['One long high beep', 'recording has started'],
  ['Soft ticks', 'pedal strokes being counted'],
  ['Two high beeps', 'recording finished'],
  ['Two low beeps', 'a problem: listen or look at the screen'],
];

/* ---------- toasts and sheets ---------- */
function toast(msg, ms) {
  let wrap = $('.toasts'); if (!wrap) { wrap = el('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(wrap); }
  const t = el(`<div class="toast">${msg}</div>`); wrap.appendChild(t);
  setTimeout(() => t.remove(), ms || 3600);
}
/** sheet({ title, body (html), actions: [{ label, value, kind }] , onOpen }) → Promise<value | null> */
function sheet(opts) {
  return new Promise((resolve) => {
    const scrim = el(`<div class="scrim" role="dialog" aria-modal="true"><div class="sheet"><h2>${esc(opts.title || '')}</h2><div class="sheet-body"></div><div class="sheet-actions"></div></div></div>`);
    const body = $('.sheet-body', scrim);
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    const close = (v) => { scrim.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    for (const a of opts.actions || [{ label: 'OK', value: true, kind: 'primary' }]) {
      const b = el(`<button class="btn ${a.kind || ''}">${esc(a.label)}</button>`);
      b.onclick = () => { if (a.validate && !a.validate(scrim)) return; close(typeof a.value === 'function' ? a.value(scrim) : a.value); };
      $('.sheet-actions', scrim).appendChild(b);
    }
    scrim.addEventListener('click', (e) => { if (e.target === scrim && !opts.modal) close(null); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(scrim);
    opts.onOpen && opts.onOpen(scrim, close);
    const f = $('input, select, textarea', scrim) || $('.btn.primary', scrim); if (f) setTimeout(() => f.focus(), 30);
  });
}
/** Every delete asks first (VeloIQ standing requirement). */
function confirmDanger(title, text, label) {
  return sheet({ title, body: `<p class="muted">${text}</p>`, actions: [{ label: 'Cancel', value: false, kind: 'quiet' }, { label: label || 'Delete', value: true, kind: 'danger' }] });
}
function promptText(title, label, value, hint) {
  return sheet({
    title, body: `<div class="field"><label for="pt">${esc(label)}</label><input id="pt" value="${esc(value || '')}" autocomplete="off">${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`,
    actions: [{ label: 'Cancel', value: null, kind: 'quiet' }, { label: 'Save', kind: 'primary', value: (s) => $('#pt', s).value.trim() || value }],
    onOpen: (s, close) => { $('#pt', s).addEventListener('keydown', (e) => { if (e.key === 'Enter') close($('#pt', s).value.trim() || value); }); },
  });
}

/* ---------- units in inputs ---------- */
const U = {
  isImp: () => Settings.v.units === 'imperial',
  lenLabel: () => (Settings.v.units === 'imperial' ? 'in' : 'mm'),
  heightLabel: () => (Settings.v.units === 'imperial' ? 'in' : 'cm'),
  // Rider height/inseam are stored in mm.
  heightToInput: (mm) => (mm == null || mm === '' ? '' : U.isImp() ? (mm / 25.4).toFixed(1) : (mm / 10).toFixed(1).replace(/\.0$/, '')),
  heightFromInput: (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : U.isImp() ? Number(v) * 25.4 : Number(v) * 10),
  len: (mm, kind) => TF.fmtLength(mm, Settings.v.units, kind),
};

/* ---------- compatibility (brief 2.1) ---------- */
function compatibility() {
  const caps = {
    secure: window.isSecureContext,
    camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    recorder: typeof window.MediaRecorder === 'function',
    storage: 'indexedDB' in window,
    wasm: typeof WebAssembly === 'object',
    speech: 'speechSynthesis' in window,
    share: typeof navigator.share === 'function',
  };
  const ua = navigator.userAgent;
  const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const iosV = (ua.match(/OS (\d+)_/) || [])[1];
  const chromeV = (ua.match(/(?:Chrome|CriOS)\/(\d+)/) || [])[1];
  const safariV = (ua.match(/Version\/(\d+)/) || [])[1];
  const old = (ios && iosV && Number(iosV) < C.compatibility.minIOS) || (!ios && chromeV && Number(chromeV) < C.compatibility.minChrome) || (!chromeV && safariV && Number(safariV) < C.compatibility.minSafari);
  caps.canRecord = caps.secure && caps.camera && caps.recorder && caps.wasm;
  caps.canRun = caps.storage && !old;
  caps.ios = ios; caps.old = !!old;
  caps.standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return caps;
}

/* ---------- routing ---------- */
const routes = [];
function route(pattern, render, opts) { routes.push({ re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), render, opts: opts || {} }); }
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
let cleanup = null;
function setCleanup(fn) { cleanup = fn; }
async function render() {
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const full = (location.hash || '#/').slice(1) || '/';
  const [path, qs] = full.split('?');
  const query = new URLSearchParams(qs || '');
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      if (r.opts.needsFile && !S.file) { go('#/'); return; }
      if (r.opts.full) { document.body.classList.add('full'); } else document.body.classList.remove('full');
      renderShell(r.opts.nav || '');
      const main = $('#main');
      main.innerHTML = '';
      window.scrollTo(0, 0);
      try { await r.render(main, Object.assign({}, m.groups || {}, { query })); } catch (e) { console.error(e); main.innerHTML = `<div class="banner bad">${icon('alert')}<div class="grow"><b>Something went wrong.</b><br>${esc(e.message || e)}</div></div>`; }
      return;
    }
  }
  go('#/');
}

function renderShell(active) {
  let shell = $('#shell');
  if (!shell) {
    shell = el(`<div class="shell" id="shell">
      <nav class="nav" aria-label="Main">
        <div class="brand">${logoLockupHTML(26)}</div>
        <a href="#/" data-nav="fit">${icon('fit')}<span>Fit</span></a>
        <a href="#/history" data-nav="history" class="needs-file">${icon('history')}<span>History</span></a>
        <a href="#/settings" data-nav="settings">${icon('settings')}<span>Settings</span></a>
        <a href="#/help" data-nav="help">${icon('help')}<span>Help</span></a>
        <div class="nav-sep"></div>
        <div class="nav-foot">${esc(C.app.name)} ${esc(C.app.version)}<br>Your data stays on this device.</div>
      </nav>
      <div class="topbar-wrap">
        <header class="topbar"><a href="#/" class="lockup-link" aria-label="Home">${logoLockupHTML(24)}</a><div class="spacer"></div><div id="topbar-right" class="row"></div></header>
        <main class="main" id="main"></main>
      </div></div>`);
    document.body.prepend(shell);
  }
  shell.classList.toggle('has-file', !!S.file);
  $$('.nav a', shell).forEach((a) => a.classList.toggle('active', a.dataset.nav === active));
  const right = $('#topbar-right');
  right.innerHTML = '';
  if (S.file) {
    const r = rider();
    const chip = el(`<button class="filechip" title="File and rider"><span class="f">${icon('file').replace('<svg', '<svg width="11" height="11" style="vertical-align:-1px"')} ${esc(S.file.name)}${unexported() ? ' · not exported' : ''}</span><span class="r">${esc(r ? r.name : 'No rider')}</span></button>`);
    chip.onclick = fileMenu;
    right.appendChild(chip);
  }
  const ut = el(`<div class="seg sm units-toggle" role="group" aria-label="Units"><button data-u="metric">mm</button><button data-u="imperial">in</button></div>`);
  $$('button', ut).forEach((b) => { b.classList.toggle('on', Settings.v.units === b.dataset.u); b.onclick = () => { Settings.set('units', b.dataset.u); render(); }; });
  right.appendChild(ut);
}

/** The header's file chip: switch rider, export, open, new. */
async function fileMenu() {
  const riders = S.file.riders;
  const body = el(`<div class="stack">
    <div class="caption">Riders in “${esc(S.file.name)}”</div>
    <div class="list">${riders.map((r) => `<button class="list-item" data-r="${r.id}"><span class="avatar">${esc(initials(r.name))}</span><span class="grow"><span class="title">${esc(r.name)}</span><br><span class="sub">${plural(r.sessions.length, 'session')} · ${esc(TF.BIKE_TYPES[r.profile.bikeType]?.label || '')}</span></span>${r.id === S.riderId ? `<span class="tag accent">Current</span>` : icon('chevR', 'chev')}</button>`).join('')}
      <button class="list-item" data-r="new"><span class="avatar">${icon('plus').replace('<svg', '<svg width="18" height="18"')}</span><span class="grow"><span class="title">Add a rider</span></span></button></div>
    <div class="caption" style="margin-top:8px">Fit file</div>
    <div class="btn-row"><button class="btn" data-a="export">${icon('download')}Export file</button><button class="btn" data-a="open">${icon('upload')}Open a file</button><button class="btn quiet" data-a="new">${icon('plus')}New file</button></div>
    <p class="tiny faint">${unexported() ? 'Changes since the last export are only on this device. Export to keep a permanent copy.' : S.meta.lastExportedAt ? `Last exported ${esc(fmtDateTime(S.meta.lastExportedAt))}.` : ''}</p>
  </div>`);
  const v = await sheet({ title: 'File and riders', body, actions: [{ label: 'Close', value: null, kind: 'quiet' }], onOpen: (s, close) => {
    $$('[data-r]', s).forEach((b) => (b.onclick = () => close('r:' + b.dataset.r)));
    $$('[data-a]', s).forEach((b) => (b.onclick = () => close('a:' + b.dataset.a)));
  } });
  if (!v) return;
  if (v === 'r:new') { go('#/rider/new'); return; }
  if (v.startsWith('r:')) { S.riderId = v.slice(2); await saveMeta(); toast(`Switched to ${esc(rider().name)}.`); render(); return; }
  if (v === 'a:export') exportFlow();
  if (v === 'a:open') openFileFlow();
  if (v === 'a:new') newFileFlow();
}
