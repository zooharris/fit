/* ==========================================================================
   Tango Fitter — measurement engine
   Pure functions only: no DOM, no camera, no storage. Everything here runs
   the same in the browser and in Node (test/engine.test.mjs), and every value
   that can be tuned lives in TF_CONFIG below.

   Coordinates: pose landmarks arrive normalised to the video frame (x, y in
   0..1, y down). The engine converts them to pixels with the clip's width and
   height before taking any angle, so the frame's aspect ratio never skews a
   measurement. "Forward" is the direction the rider faces; "up" is up.
   Internally lengths are millimetres and angles are degrees.
   ========================================================================== */
(function (root) {
'use strict';

/* --------------------------------------------------------------------------
   TF_CONFIG — every tunable value in one place (brief: "named constants in
   one configuration block"). Values marked "default" in the brief are here.
   -------------------------------------------------------------------------- */
const TF_CONFIG = {
  app: {
    name: 'Tango Fitter',
    shortName: 'Tango',
    version: '0.1.0-beta.1',
    fileExtension: '.tango',
    fileFormat: 'tango-fit',
    schemaVersion: 1,
  },

  // Minimum browser feature set; below this a compatibility screen explains why.
  compatibility: { minIOS: 16, minSafari: 16, minChrome: 110 },

  libraries: {
    visionBundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs',
    visionWasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm',
    poseLite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    poseHeavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
    jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
  },

  pose: {
    delegate: 'GPU',              // falls back to CPU automatically if GPU fails
    minDetectionConfidence: 0.5,
    minPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },

  capture: {
    idealFps: 60,                 // brief 2.2: request 60, accept 30
    minFps: 24,
    idealWidth: 1280,
    idealHeight: 720,
    // First supported wins. MP4 first: it plays on every supported browser.
    mimeTypes: ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
    videoBitsPerSecond: 6000000,
    liveDetectFps: 30,            // lite model during capture (framing, strokes)
    maxClipSeconds: 45,           // hard stop whatever the stop trigger says
    autoRetries: 2,               // bad captures retried hands-free before asking for a tap
    retryCountdownSeconds: 10,
  },

  framing: {
    visibilityThreshold: 0.5,     // a landmark counts as "seen" above this
    edgeMargin: 0.02,             // landmarks this close to the frame edge count as cut off
    stableMs: 1500,               // framing must hold this long before the app is satisfied
    lowLightVisibility: 0.6,      // mean visibility below this for lowLightMs → "more light"
    lowLightMs: 2000,
    goodCaptureFraction: 0.8,     // share of recorded frames with every needed joint seen
  },

  triggers: {
    startMode: 'strokes',         // 'seconds' | 'beeps' | 'strokes'
    startSeconds: 15,
    startBeeps: 5,
    beepIntervalMs: 1000,
    startStrokes: 10,             // brief 4.4 default
    stableStrokes: 5,             // cadence is "stable" when the last 5 periods…
    stableVariation: 0.10,        // …vary by less than 10%
    stopMode: 'seconds',          // 'seconds' | 'strokes'
    stopSeconds: 20,              // brief 4.4 default
    stopStrokes: 15,              // brief 4.4 default
    minStrokes: 6,                // fewer than this in a clip → retake
    minPeriodS: 0.42,             // 143 rpm: anything faster is noise
    minFootTravel: 0.03,          // the foot must rise and fall by 3% of the frame height to count
    maxPeriodS: 2.0,              // 30 rpm: anything slower is not pedalling
    cadenceLow: 70,               // spoken guidance band
    cadenceHigh: 100,
  },

  calibration: {
    scaleAgreementMax: 0.04,      // crank- and wheel-based scales must agree within 4%
    squareRatioMin: 0.97,         // wheel width/height below this → camera not square (0.97 ≈ a 14° turn; the brief's
                                  // 0.95 would miss the 15° acceptance test)
    // With the phone level and the lens about level with the top of the wheels, the whole rider fits and the
    // bottom bracket sits roughly 70–80% of the way down the frame. (The brief's "camera at BB height" would put
    // the BB mid-frame and cut off the rider's head; what keeps angles true is a level, square camera.)
    bbBandTop: 0.55,
    bbBandBottom: 0.9,
    reuseMaxHours: 6,             // offer the last calibration for a retest within this window
    defaultWheel: '700x28',
  },

  analysis: {
    fps: 30,                      // frames analysed per second of video
    medianWindow: 3,              // landmark smoothing (frames); 5 clips the knee's peak by ~2° at 30 fps
    seekTimeoutMs: 4000,
    segmentPercentile: 0.9,       // segment lengths: 90th percentile (foreshortening only shortens)
  },

  confidence: {
    visibilityHigh: 0.80, visibilityMedium: 0.60,
    presentHigh: 0.90, presentMedium: 0.70,
    spreadHighDeg: 3, spreadMediumDeg: 6,     // stroke-to-stroke interquartile spread
    spreadHighMm: 8, spreadMediumMm: 16,
    lowConfidenceMetrics: ['wrist'],          // brief: wrist is always flagged lower confidence
  },

  // Target bands. green = target, yellow = green widened by yellowMargin; outside yellow is red.
  // Brief 8.1: initial defaults, to be confirmed against published fitting references before release.
  targets: {
    yellowMargin: { kneeExtension: 4, kneeFlexion: 5, hipClosed: 5, backAngle: 5, shoulder: 5, elbow: 5, wrist: 10, ankleBDC: 5, ankleROM: 5, kops: 15 },
    flexibilityShiftDeg: 5,       // hip and back targets: "no" → more open, "easily" → more closed
    kneeExtension: { road: [140, 150], gravel: [140, 150], tt: [145, 155], triathlon: [145, 155], mtb: [138, 148], hybrid: [135, 145], cruiser: [135, 145], casualOrUpright: [135, 145] },
    kneeFlexion: [65, 75],
    hipClosed: { race: [55, 65], performance: [60, 72], endurance: [60, 72], casual: [70, 85], upright: [85, 100], aero: [40, 52] },
    backAngle: {
      race: { hoods: [35, 45], drops: [30, 40], tops: [40, 50], flats: [38, 48] },
      performance: { hoods: [38, 48], drops: [32, 42], tops: [43, 53], flats: [40, 50] },
      endurance: { hoods: [40, 50], drops: [35, 45], tops: [45, 55], flats: [42, 52] },
      casual: { hoods: [50, 60], drops: [45, 55], tops: [55, 65], flats: [50, 60] },
      upright: { hoods: [60, 80], drops: [55, 70], tops: [60, 80], flats: [60, 80] },
      aero: { aero: [10, 20], base: [20, 30] },
      gravelOffset: 3,            // gravel sits a little more upright than road at the same goal
      mtb: [40, 55],
    },
    shoulder: { default: [80, 100], aero: [80, 90], casual: [70, 95], upright: [55, 85] },
    elbow: { hoods: [150, 165], drops: [145, 160], tops: [150, 170], flats: [150, 170], aero: [90, 110], base: [145, 165] },
    wrist: [160, 180],
    ankleBDC: [95, 115],
    ankleROM: [15, 25],
    // KOPS is the traditional front-of-knee plumb line. The pose model's knee point is the joint centre,
    // so kopsKneeFrontOffsetMm moves it forward to the front of the knee. Default to validate.
    kopsKneeFrontOffsetMm: 30,
    kops: { road: [-10, 20], gravel: [-10, 20], mtb: [-15, 15], tt: [20, 80], triathlon: [20, 80], casualOrUpright: [-20, 10] },
  },

  recommend: {
    aimIntoBand: 0.25,            // aim this far into the green band from the nearer edge…
    // …and at its centre; the two give the low and high ends of the suggested range.
    saddleStepMm: 5,              // brief 8.3: saddle changes round to 5 mm
    stemStepMm: 10,
    maxSaddleChangeMm: 20,        // larger corrections are made in steps, retesting between
    searchRangeMm: 80,
  },

  units: { default: 'metric', inchDecimals: 1, adjustmentFraction: 16 },

  export: { defaultMode: 'full', suggestLiteAboveMB: 150, promptAfterSession: true },

  audio: {
    mode: 'both',                 // 'voice' | 'beeps' | 'both'
    beepHz: 880, beepHighHz: 1320, beepMs: 140, tickHz: 660, tickMs: 50,
    rate: 1.0, volume: 1.0,
  },

  // Brief section 7. A gate sends the rider to a professional before making changes.
  discomfort: {
    regions: ['kneeFront', 'kneeBack', 'kneeSides', 'hands', 'neckShoulders', 'lowerBack', 'saddle', 'feet'],
    levels: ['none', 'mild', 'moderate', 'severe'],
    patterns: ['new', 'builds', 'persists'],
    gateOnLevel: 'severe',
    gateOnPattern: 'persists',
  },
};

/* --------------------------------------------------------------------------
   Pose landmark indices (MediaPipe Pose, 33 points)
   -------------------------------------------------------------------------- */
const LM = {
  nose: 0,
  left: { shoulder: 11, elbow: 13, wrist: 15, index: 19, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 },
  right: { shoulder: 12, elbow: 14, wrist: 16, index: 20, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 },
};
const JOINTS = ['shoulder', 'elbow', 'wrist', 'index', 'hip', 'knee', 'ankle', 'heel', 'toe'];
// The joints that must be visible for a usable side-view capture.
const REQUIRED_JOINTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'toe'];
// The joints each measurement depends on (drives confidence).
const METRIC_JOINTS = {
  kneeExtension: ['hip', 'knee', 'ankle'],
  kneeFlexion: ['hip', 'knee', 'ankle'],
  hipClosed: ['shoulder', 'hip', 'knee'],
  backAngle: ['shoulder', 'hip'],
  shoulder: ['hip', 'shoulder', 'elbow'],
  elbow: ['shoulder', 'elbow', 'wrist'],
  wrist: ['elbow', 'wrist', 'index'],
  ankleBDC: ['knee', 'ankle', 'toe'],
  ankleROM: ['knee', 'ankle', 'toe'],
  kops: ['knee', 'heel', 'toe'],
};

/* Metric catalogue: labels and plain-English descriptions for every number (VeloIQ standing requirement). */
const METRICS = {
  kneeExtension: { label: 'Knee extension', short: 'Knee ext.', unit: 'deg', where: 'bottom of the stroke', about: 'How straight your leg gets at the bottom of the pedal stroke. Mostly set by saddle height.' },
  kneeFlexion: { label: 'Knee flexion', short: 'Knee flex.', unit: 'deg', where: 'top of the stroke', about: 'How closed your knee is at the top of the stroke. Very small values put load on the front of the knee.' },
  hipClosed: { label: 'Closed hip angle', short: 'Hip', unit: 'deg', where: 'top of the stroke', about: 'Angle between torso and thigh at the top of the stroke. Set by saddle position and how low and far the bars are.' },
  backAngle: { label: 'Back angle', short: 'Back', unit: 'deg', where: 'average', about: 'Torso angle above horizontal. Lower is more aerodynamic and harder to hold.' },
  shoulder: { label: 'Shoulder angle', short: 'Shoulder', unit: 'deg', where: 'average', about: 'Angle between torso and upper arm. Mostly set by reach to the bars.' },
  elbow: { label: 'Elbow angle', short: 'Elbow', unit: 'deg', where: 'average', about: 'How bent your arms are. Locked-straight arms pass road shock to the shoulders.' },
  wrist: { label: 'Wrist angle', short: 'Wrist', unit: 'deg', where: 'average', about: 'How straight the wrist is (180° is straight). Hands are small in the frame, so this reading is less precise.' },
  ankleBDC: { label: 'Ankle angle', short: 'Ankle', unit: 'deg', where: 'bottom of the stroke', about: 'Angle between shin and foot at the bottom of the stroke. Higher means toes pointing down.' },
  ankleROM: { label: 'Ankle movement', short: 'Ankle range', unit: 'deg', where: 'whole stroke', about: 'How much the ankle angle changes through each stroke.' },
  kops: { label: 'Knee over pedal spindle', short: 'KOPS', unit: 'mm', where: 'crank forward', about: 'How far the front of the knee is ahead of (+) or behind (−) the pedal spindle with the crank level and forward. Mostly set by saddle fore/aft.' },
};
const METRIC_ORDER = ['kneeExtension', 'kneeFlexion', 'hipClosed', 'backAngle', 'shoulder', 'elbow', 'wrist', 'ankleBDC', 'ankleROM', 'kops'];

/* Discomfort regions and the measurements commonly associated with them (brief section 7). */
const REGIONS = {
  kneeFront: { label: 'Front of the knee', phrase: 'discomfort at the front of the knee', assoc: [
    { metric: 'kneeExtension', when: 'low', cause: 'a low saddle' },
    { metric: 'kops', when: 'high', cause: 'a saddle set too far forward' },
    { metric: 'kneeFlexion', when: 'low', cause: 'a tightly closed knee at the top of the stroke' },
  ] },
  kneeBack: { label: 'Back of the knee', phrase: 'discomfort at the back of the knee', assoc: [
    { metric: 'kneeExtension', when: 'high', cause: 'a high saddle' },
  ] },
  kneeSides: { label: 'Sides of the knee', phrase: 'discomfort at the sides of the knee', assoc: [], notMeasurable: 'Discomfort at the sides of the knee is often associated with cleat rotation or stance width, which a front view checks. The front view arrives in a later version; a professional fitter can check cleats now.' },
  hands: { label: 'Hands or wrists', phrase: 'hand or wrist discomfort', assoc: [
    { metric: 'elbow', when: 'high', cause: 'straight, locked arms' },
    { metric: 'shoulder', when: 'high', cause: 'a long reach to the bars' },
    { metric: 'backAngle', when: 'low', cause: 'a low front end that puts weight on the hands' },
    { metric: 'wrist', when: 'low', cause: 'a bent wrist on the bars' },
  ] },
  neckShoulders: { label: 'Neck or shoulders', phrase: 'neck or shoulder discomfort', assoc: [
    { metric: 'backAngle', when: 'low', cause: 'a low front end' },
    { metric: 'shoulder', when: 'high', cause: 'a long reach to the bars' },
  ] },
  lowerBack: { label: 'Lower back', phrase: 'lower-back discomfort', assoc: [
    { metric: 'hipClosed', when: 'low', cause: 'a closed hip angle' },
    { metric: 'backAngle', when: 'low', cause: 'a low front end' },
    { metric: 'kneeExtension', when: 'high', cause: 'a high saddle that makes the hips rock' },
  ] },
  saddle: { label: 'Saddle area', phrase: 'saddle-area discomfort', assoc: [
    { metric: 'kneeExtension', when: 'high', cause: 'a high saddle that makes the hips rock' },
  ], partial: 'Saddle tilt and saddle shape also matter here and are not measured from video.' },
  feet: { label: 'Feet', phrase: 'foot discomfort', assoc: [
    { metric: 'ankleBDC', when: 'high', cause: 'reaching for the pedal with pointed toes' },
    { metric: 'ankleROM', when: 'high', cause: 'a lot of ankle movement through the stroke' },
  ], partial: 'Shoes, insoles and cleat position matter most for feet and are not measured from video.' },
};
const OTHER_CAUSES = 'Other common causes include training load, cleat wear, shoes, or an underlying issue a clinician should assess.';

/* Bikes, goals and hand positions offered in the profile. */
const BIKE_TYPES = {
  road: { label: 'Road', hands: ['hoods', 'drops', 'tops'], goals: ['race', 'performance', 'endurance', 'casual'] },
  gravel: { label: 'Gravel', hands: ['hoods', 'drops', 'tops'], goals: ['race', 'performance', 'endurance', 'casual'] },
  mtb: { label: 'Mountain', hands: ['flats'], goals: ['race', 'performance', 'endurance', 'casual'] },
  tt: { label: 'Time trial', hands: ['aero', 'base'], goals: ['race', 'performance'] },
  triathlon: { label: 'Triathlon', hands: ['aero', 'base'], goals: ['race', 'performance', 'endurance'] },
  hybrid: { label: 'Hybrid / commuter', hands: ['flats'], goals: ['endurance', 'casual', 'upright'] },
  cruiser: { label: 'Upright / cruiser', hands: ['flats'], goals: ['casual', 'upright'] },
};
const GOALS = { race: 'Race', performance: 'Performance', endurance: 'Endurance', casual: 'Casual', upright: 'Upright' };
const HAND_POSITIONS = { hoods: 'Hoods', drops: 'Drops', tops: 'Tops', flats: 'Flat bar / grips', aero: 'Aero extensions', base: 'Base bar' };

/* Wheels: ISO bead seat diameter (mm) and common tyre widths. Outer diameter = BSD + 2 × width. */
const WHEELS = {
  '700x25': { label: '700 × 25c', bsd: 622, tyre: 25 },
  '700x28': { label: '700 × 28c', bsd: 622, tyre: 28 },
  '700x30': { label: '700 × 30c', bsd: 622, tyre: 30 },
  '700x32': { label: '700 × 32c', bsd: 622, tyre: 32 },
  '700x35': { label: '700 × 35c', bsd: 622, tyre: 35 },
  '700x40': { label: '700 × 40c', bsd: 622, tyre: 40 },
  '700x45': { label: '700 × 45c', bsd: 622, tyre: 45 },
  '650bx47': { label: '650b × 47', bsd: 584, tyre: 47 },
  '27.5x2.3': { label: '27.5 × 2.3 in', bsd: 584, tyre: 58 },
  '29x2.2': { label: '29 × 2.2 in', bsd: 622, tyre: 56 },
  '29x2.4': { label: '29 × 2.4 in', bsd: 622, tyre: 61 },
  '26x2.1': { label: '26 × 2.1 in', bsd: 559, tyre: 53 },
  '650cx23': { label: '650c × 23', bsd: 571, tyre: 23 },
  custom: { label: 'Other (enter outer diameter)', bsd: 0, tyre: 0 },
};
const CRANK_LENGTHS = [150, 155, 160, 162.5, 165, 167.5, 170, 172.5, 175, 177.5, 180];

/* ==========================================================================
   Small maths helpers
   ========================================================================== */
const DEG = 180 / Math.PI;
const sq = (v) => v * v;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const norm = (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Interior angle at b of the path a–b–c, degrees. */
function angleAt(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y);
  if (!lu || !lv) return NaN;
  return Math.acos(clamp(dot(u, v) / (lu * lv), -1, 1)) * DEG;
}

function quantile(values, q) {
  const v = values.filter(finite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const pos = (v.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}
const median = (values) => quantile(values, 0.5);
const mean = (values) => { const v = values.filter(finite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
const iqr = (values) => quantile(values, 0.75) - quantile(values, 0.25);

/** Intersection of two circles; returns both points or null. */
function circleIntersect(c0, r0, c1, r1) {
  const d = dist(c0, c1);
  if (d > r0 + r1 || d < Math.abs(r0 - r1) || d === 0) return null;
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const m = add(c0, scale(sub(c1, c0), a / d));
  const off = { x: -(c1.y - c0.y) * h / d, y: (c1.x - c0.x) * h / d };
  return [add(m, off), sub(m, off)];
}

/** Knee position from hip, ankle and segment lengths, on the forward side (world coords: +x forward, +y up). */
function solveKnee(hip, ankle, thigh, shin) {
  let pts = circleIntersect(hip, thigh, ankle, shin);
  if (!pts) {
    // Leg would have to stretch: place the knee on the straight line (fully extended).
    const d = dist(hip, ankle), k = thigh / (thigh + shin);
    if (d === 0) return null;
    return add(hip, scale(sub(ankle, hip), k));
  }
  return pts[0].x >= pts[1].x ? pts[0] : pts[1];
}

function uid(prefix) {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${r}`;
}

/* ==========================================================================
   Units (stored in mm and degrees; converted only for display)
   ========================================================================== */
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function inchFraction(mm, denom) {
  const neg = mm < 0; const total = Math.round(Math.abs(mm) / 25.4 * denom);
  const whole = Math.floor(total / denom), num = total % denom;
  let s;
  if (!num) s = `${whole}`;
  else { const g = gcd(num, denom); s = whole ? `${whole} ${num / g}/${denom / g}` : `${num / g}/${denom / g}`; }
  return (neg && total ? '−' : '') + s;
}
/** A length for display. kind: 'length' (bike dimensions) or 'adjust' (small changes, fractions in imperial). */
function fmtLength(mm, units, kind) {
  if (!finite(mm)) return '—';
  if (units === 'imperial') {
    if (kind === 'adjust') return `${inchFraction(mm, TF_CONFIG.units.adjustmentFraction)} in`;
    return `${(mm / 25.4).toFixed(TF_CONFIG.units.inchDecimals)} in`;
  }
  return `${Math.round(mm * 10) / 10 % 1 ? (Math.round(mm * 10) / 10).toFixed(1) : Math.round(mm)} mm`;
}
function fmtSignedMm(mm, units) {
  if (!finite(mm)) return '—';
  const r = units === 'imperial' ? mm : Math.round(mm);
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return sign + fmtLength(Math.abs(r), units, units === 'imperial' ? 'adjust' : 'length');
}
function fmtRange(lo, hi, units) {
  if (units === 'imperial') return `${inchFraction(lo, 16)}–${inchFraction(hi, 16)} in`;
  return `${Math.round(lo)}–${Math.round(hi)} mm`;
}
const fmtAngle = (deg) => (finite(deg) ? `${Math.round(deg)}°` : '—');
function fmtMetric(metric, value, units) {
  if (METRICS[metric].unit === 'mm') return fmtSignedMm(value, units);
  return fmtAngle(value);
}
function fmtBand(metric, band, units) {
  if (band && band.green) band = band.green;
  if (!band) return '—';
  if (METRICS[metric].unit === 'mm') return `${fmtSignedMm(band[0], units)} to ${fmtSignedMm(band[1], units)}`;
  return `${band[0]}–${band[1]}°`;
}

/* ==========================================================================
   Targets (brief 8.1)
   ========================================================================== */
function isAeroHand(hand) { return hand === 'aero' || hand === 'base'; }

/** Target bands for a rider profile and hand position. Returns { metric: { green:[lo,hi], yellow:[lo,hi] } }. */
function targetsFor(profile, hand) {
  const T = TF_CONFIG.targets;
  const bike = profile.bikeType || 'road';
  const goal = profile.goal || 'endurance';
  hand = hand || (BIKE_TYPES[bike] ? BIKE_TYPES[bike].hands[0] : 'hoods');
  const aero = isAeroHand(hand) || bike === 'tt' || bike === 'triathlon';
  const relaxed = goal === 'casual' || goal === 'upright';
  const out = {};

  out.kneeExtension = relaxed && (bike === 'road' || bike === 'gravel' || bike === 'mtb') ? T.kneeExtension.casualOrUpright : (T.kneeExtension[bike] || T.kneeExtension.road);
  out.kneeFlexion = T.kneeFlexion;

  let hip = aero && isAeroHand(hand) ? T.hipClosed.aero : (T.hipClosed[goal] || T.hipClosed.endurance);
  let back;
  if (isAeroHand(hand)) back = T.backAngle.aero[hand];
  else if (bike === 'mtb') back = T.backAngle.mtb;
  else {
    const byGoal = T.backAngle[goal] || T.backAngle.endurance;
    back = byGoal[hand] || byGoal.hoods;
    if (bike === 'gravel') back = [back[0] + T.backAngle.gravelOffset, back[1] + T.backAngle.gravelOffset];
  }
  // Flexibility screen shifts hip and back: "no" → more open (higher), "easily" → more closed (lower).
  const flex = profile.flexibility;
  const shift = flex === 'no' ? T.flexibilityShiftDeg : flex === 'easily' ? -T.flexibilityShiftDeg : 0;
  if (shift) { hip = [hip[0] + shift, hip[1] + shift]; back = [back[0] + shift, back[1] + shift]; }
  out.hipClosed = hip;
  out.backAngle = back;

  out.shoulder = isAeroHand(hand) && hand === 'aero' ? T.shoulder.aero : goal === 'upright' ? T.shoulder.upright : goal === 'casual' ? T.shoulder.casual : T.shoulder.default;
  out.elbow = T.elbow[hand] || T.elbow.hoods;
  out.wrist = T.wrist;
  out.ankleBDC = T.ankleBDC;
  out.ankleROM = T.ankleROM;
  out.kops = relaxed && bike !== 'tt' && bike !== 'triathlon' ? T.kops.casualOrUpright : (T.kops[bike] || (bike === 'hybrid' || bike === 'cruiser' ? T.kops.casualOrUpright : T.kops.road));

  const bands = {};
  for (const m of METRIC_ORDER) {
    const g = out[m];
    const y = T.yellowMargin[m];
    bands[m] = { green: [g[0], g[1]], yellow: [g[0] - y, g[1] + y] };
  }
  return bands;
}

/** 'green' | 'yellow' | 'red' and which side: 'low' | 'high' | 'in'. */
function classify(value, band) {
  if (!finite(value) || !band) return { status: 'none', side: 'in' };
  const [glo, ghi] = band.green, [ylo, yhi] = band.yellow;
  if (value >= glo && value <= ghi) return { status: 'green', side: 'in' };
  const side = value < glo ? 'low' : 'high';
  if (value >= ylo && value <= yhi) return { status: 'yellow', side };
  return { status: 'red', side };
}

/* ==========================================================================
   Frames: from detector output to per-frame joint positions in pixels
   A frame is { t: seconds, lm: [[x,y,v] × 33] } with x,y normalised.
   ========================================================================== */
function compactLandmarks(landmarks) {
  // landmarks: array of {x,y,z,visibility}; stored as [x,y,v] rounded to keep files small.
  return landmarks.map((p) => [Math.round(p.x * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4, Math.round((p.visibility ?? p.presence ?? 0) * 100) / 100]);
}

/** Which side of the body faces the camera, by mean visibility of each side's leg and arm joints. */
function nearSide(frames) {
  let l = 0, r = 0, n = 0;
  for (const f of frames) {
    if (!f.lm) continue;
    for (const j of JOINTS) { l += f.lm[LM.left[j]][2]; r += f.lm[LM.right[j]][2]; }
    n++;
  }
  if (!n) return 'left';
  return l >= r ? 'left' : 'right';
}

/** +1 when the rider faces image +x (right), −1 when facing left. */
function facingDirection(frames, side, W, H) {
  const idx = LM[side];
  const votes = [];
  for (const f of frames) {
    if (!f.lm) continue;
    const toe = f.lm[idx.toe], heel = f.lm[idx.heel], sh = f.lm[idx.shoulder], hip = f.lm[idx.hip], wr = f.lm[idx.wrist];
    // Hands are ahead of the hips, and toes ahead of heels: both point forward.
    if (wr[2] > 0.3 && hip[2] > 0.3) votes.push(Math.sign((wr[0] - hip[0]) * W));
    if (toe[2] > 0.3 && heel[2] > 0.3) votes.push(Math.sign((toe[0] - heel[0]) * W));
    if (sh[2] > 0.3 && hip[2] > 0.3) votes.push(Math.sign((sh[0] - hip[0]) * W));
  }
  const s = votes.reduce((a, b) => a + b, 0);
  return s >= 0 ? 1 : -1;
}

/** Median-filter each coordinate of the chosen side's joints across time. Returns per-frame joints in pixels. */
function smoothSide(frames, side, W, H, window) {
  const idx = LM[side];
  const half = Math.floor((window || TF_CONFIG.analysis.medianWindow) / 2);
  const vt = TF_CONFIG.framing.visibilityThreshold;
  const out = frames.map((f) => ({ t: f.t, j: {}, v: {} }));
  for (const name of JOINTS) {
    const xs = frames.map((f) => (f.lm ? f.lm[idx[name]][0] * W : NaN));
    const ys = frames.map((f) => (f.lm ? f.lm[idx[name]][1] * H : NaN));
    const vs = frames.map((f) => (f.lm ? f.lm[idx[name]][2] : 0));
    for (let i = 0; i < frames.length; i++) {
      const wx = [], wy = [];
      for (let k = Math.max(0, i - half); k <= Math.min(frames.length - 1, i + half); k++) {
        if (vs[k] >= vt * 0.6 && finite(xs[k])) { wx.push(xs[k]); wy.push(ys[k]); }
      }
      out[i].j[name] = wx.length ? { x: median(wx), y: median(wy) } : null;
      out[i].v[name] = vs[i];
    }
  }
  return out;
}

/* Image (pixels, y down) ↔ world (mm or px, +x forward, +y up) relative to an origin. */
function toWorld(p, origin, facing, pxPerMm) {
  if (!p) return null;
  const k = pxPerMm || 1;
  return { x: (p.x - origin.x) * facing / k, y: -(p.y - origin.y) / k };
}
function toImage(w, origin, facing, pxPerMm) {
  const k = pxPerMm || 1;
  return { x: origin.x + w.x * k * facing, y: origin.y - w.y * k };
}

/* ==========================================================================
   Calibration (brief section 5)
   Taps, in image pixels: rearAxle, frontAxle, tyreTop (top of rear tyre),
   tyreBack (back edge of rear tyre), bb, spindle (with the crank level).
   ========================================================================== */
function wheelOuterDiameter(bike) {
  if (bike.wheel === 'custom') return Number(bike.wheelDiameterMm) || NaN;
  const w = WHEELS[bike.wheel] || WHEELS[TF_CONFIG.calibration.defaultWheel];
  return w.bsd + 2 * w.tyre;
}

function computeCalibration(taps, bike, frameH) {
  const C = TF_CONFIG.calibration;
  const crank = Number(bike.crankLength);
  const wheelD = wheelOuterDiameter(bike);
  const res = { taps, ok: true, warnings: [] };

  // Scale 1: vertical wheel radius (unaffected by the camera turning left/right).
  const rv = Math.abs(taps.rearAxle.y - taps.tyreTop.y);
  const rh = Math.abs(taps.rearAxle.x - taps.tyreBack.x);
  res.scaleWheel = rv * 2 / wheelD;
  // Scale 2: crank length, measured with the crank level.
  res.scaleCrank = dist(taps.bb, taps.spindle) / crank;
  res.agreement = Math.abs(res.scaleWheel - res.scaleCrank) / ((res.scaleWheel + res.scaleCrank) / 2);
  res.pxPerMm = (res.scaleWheel + res.scaleCrank) / 2;
  // Squareness: a wheel seen square-on is a circle; turned, it narrows horizontally.
  res.squareRatio = rv ? rh / rv : NaN;
  // Bike tilt: the line through both axles should be level. Positive = front higher.
  const facing = Math.sign(taps.frontAxle.x - taps.rearAxle.x) || 1;
  res.facing = facing;
  res.tiltDeg = Math.atan2(-(taps.frontAxle.y - taps.rearAxle.y), (taps.frontAxle.x - taps.rearAxle.x) * facing) * DEG;
  res.bbHeightFrac = frameH ? taps.bb.y / frameH : NaN;

  if (!(res.agreement <= C.scaleAgreementMax)) {
    res.warnings.push({ code: 'scale', text: `The crank and wheel sizes disagree by ${Math.round(res.agreement * 100)}%, so the camera is probably not square to the bike or not level. Measurements in millimetres are less reliable.` });
  }
  if (finite(res.squareRatio) && res.squareRatio < C.squareRatioMin) {
    const dir = (taps.tyreBack.x < taps.rearAxle.x) === (facing > 0) ? 'left' : 'right';
    res.warnings.push({ code: 'square', text: `The rear wheel looks oval (${Math.round(res.squareRatio * 100)}% as wide as it is tall). Turn the camera a little so it points straight at the side of the bike.`, dir });
  }
  if (finite(res.bbHeightFrac) && (res.bbHeightFrac < C.bbBandTop || res.bbHeightFrac > C.bbBandBottom)) {
    res.warnings.push({ code: 'height', text: res.bbHeightFrac < C.bbBandTop ? 'The bottom bracket is high in the frame, so the camera is probably low or tilted up. Put the lens about level with the top of the wheels and keep the phone level.' : 'The bottom bracket is very low in the frame, so the camera is probably high or tilted down. Put the lens about level with the top of the wheels and keep the phone level.' });
  }
  if (Math.abs(res.tiltDeg) > 2) {
    res.warnings.push({ code: 'tilt', text: `The bike is tilted ${Math.abs(res.tiltDeg).toFixed(1)}° (${res.tiltDeg > 0 ? 'front high' : 'front low'}). The back angle is corrected for it, but levelling the bike is better.` });
  }
  res.ok = res.warnings.every((w) => w.code === 'tilt');
  return res;
}

/* Foot-to-spindle relationship: the spindle's position in the foot's own frame, in foot lengths.
   Lets the app follow the spindle through the stroke from the tracked heel and toe. */
function footFrame(heel, toe) {
  const ex = norm(sub(toe, heel));
  return { o: heel, ex, ey: { x: -ex.y, y: ex.x }, len: dist(heel, toe) };
}
function spindleInFoot(heel, toe, spindle) {
  const f = footFrame(heel, toe);
  const d = sub(spindle, f.o);
  return { a: dot(d, f.ex) / f.len, b: dot(d, f.ey) / f.len };
}
function spindleFromFoot(heel, toe, rel) {
  const f = footFrame(heel, toe);
  return add(f.o, add(scale(f.ex, rel.a * f.len), scale(f.ey, rel.b * f.len)));
}

/* ==========================================================================
   Stroke counting (live, lite model): a tiny peak detector on the foot's height
   ========================================================================== */
class StrokeCounter {
  constructor(opts) {
    const T = TF_CONFIG.triggers;
    this.minPeriod = (opts && opts.minPeriodS) || T.minPeriodS;
    this.maxPeriod = (opts && opts.maxPeriodS) || T.maxPeriodS;
    this.stableN = (opts && opts.stableStrokes) || T.stableStrokes;
    this.stableVar = (opts && opts.stableVariation) || T.stableVariation;
    this.minAmp = (opts && opts.minFootTravel) || T.minFootTravel;
    this.reset();
  }
  reset() {
    this.hist = []; this.ema = null; this.prev = null; this.rising = false;
    this.lastPeak = null; this.periods = []; this.count = 0;
  }
  /** y: foot height in image units (larger = lower). Returns { stroke, cadence, stable } when a bottom is passed. */
  push(t, y) {
    if (!finite(y)) return null;
    this.ema = this.ema == null ? y : this.ema * 0.5 + y * 0.5;
    this.hist.push({ t, y: this.ema });
    while (this.hist.length && t - this.hist[0].t > 2.5) this.hist.shift();
    const ys = this.hist.map((h) => h.y);
    const lo = Math.min(...ys), hi = Math.max(...ys), amp = hi - lo;
    let ev = null;
    if (this.prev != null) {
      const goingDown = this.ema > this.prev;           // image y grows as the foot goes down
      if (this.rising && !goingDown && amp > this.minAmp) {
        // The foot just passed its lowest point.
        const peakY = this.prev;
        if (peakY > lo + amp * 0.65) {
          const since = this.lastPeak == null ? Infinity : t - this.lastPeak;
          if (since >= this.minPeriod) {
            if (this.lastPeak != null && since <= this.maxPeriod) this.periods.push(since);
            if (this.lastPeak != null && since > this.maxPeriod) this.periods = [];
            this.lastPeak = t; this.count++;
            ev = { stroke: true, count: this.count, cadence: this.cadence(), stable: this.stable() };
          }
        }
      }
      this.rising = goingDown;
    }
    this.prev = this.ema;
    if (this.lastPeak != null && t - this.lastPeak > this.maxPeriod * 1.5) { this.periods = []; }
    return ev;
  }
  cadence() {
    const p = this.periods.slice(-this.stableN);
    return p.length ? 60 / median(p) : NaN;
  }
  stable() {
    const p = this.periods.slice(-this.stableN);
    if (p.length < this.stableN) return false;
    const m = mean(p);
    return p.every((x) => Math.abs(x - m) / m < this.stableVar);
  }
}

/* ==========================================================================
   Live framing check (brief 4.2)
   ========================================================================== */
function framingCheck(lmFrame, side) {
  const vt = TF_CONFIG.framing.visibilityThreshold, edge = TF_CONFIG.framing.edgeMargin;
  if (!lmFrame) return { ok: false, missing: REQUIRED_JOINTS.slice(), meanVis: 0, reason: 'nobody' };
  side = side || (sumVis(lmFrame, 'left') >= sumVis(lmFrame, 'right') ? 'left' : 'right');
  const idx = LM[side];
  const missing = [];
  let vsum = 0;
  for (const j of REQUIRED_JOINTS) {
    const p = lmFrame[idx[j]];
    vsum += p[2];
    const inFrame = p[0] > edge && p[0] < 1 - edge && p[1] > edge && p[1] < 1 - edge;
    if (p[2] < vt || !inFrame) missing.push(j);
  }
  const meanVis = vsum / REQUIRED_JOINTS.length;
  return { ok: missing.length === 0, missing, meanVis, side };
}
function sumVis(lm, side) { return JOINTS.reduce((s, j) => s + lm[LM[side][j]][2], 0); }

const JOINT_WORDS = { shoulder: 'shoulder', elbow: 'elbow', wrist: 'hand', index: 'hand', hip: 'hip', knee: 'knee', ankle: 'ankle', heel: 'heel', toe: 'foot' };
function describeMissing(missing) {
  const words = [...new Set(missing.map((j) => JOINT_WORDS[j]))];
  if (!words.length) return '';
  if (words.length === 1) return `your ${words[0]}`;
  return `your ${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** After a capture: was it usable? frames are the live (lite) frames recorded during the clip. */
function captureQuality(liveFrames, strokes) {
  const F = TF_CONFIG.framing, T = TF_CONFIG.triggers;
  const usable = liveFrames.filter((f) => f.lm);
  if (!usable.length) return { ok: false, reason: 'nobody', speech: 'I could not see you. Check the camera is pointing at the bike.' };
  const side = nearSide(usable);
  const counts = {};
  let good = 0;
  for (const f of liveFrames) {
    const c = framingCheck(f.lm, side);
    if (c.ok) good++;
    for (const m of c.missing) counts[m] = (counts[m] || 0) + 1;
  }
  const fraction = good / liveFrames.length;
  if (fraction < F.goodCaptureFraction) {
    const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const pct = Math.round((worst ? worst[1] : liveFrames.length - good) / liveFrames.length * 100);
    const what = worst ? describeMissing([worst[0]]) : 'you';
    return { ok: false, reason: 'framing', fraction, missingJoint: worst && worst[0], speech: `I lost sight of ${what} on ${pct} percent of the frames.`, text: `Lost sight of ${what} on ${pct}% of frames.` };
  }
  if (strokes < T.minStrokes) {
    return { ok: false, reason: 'strokes', fraction, speech: `I only counted ${strokes} pedal strokes. I need at least ${T.minStrokes}.`, text: `Only ${strokes} pedal strokes recorded; at least ${T.minStrokes} are needed.` };
  }
  return { ok: true, fraction, side, speech: 'Good capture.' };
}

/** The live frame with the crank roughly level and forward, for the calibration taps. */
function pickCalibrationTime(liveFrames, W, H) {
  const usable = liveFrames.filter((f) => f.lm);
  if (!usable.length) return liveFrames.length ? liveFrames[Math.floor(liveFrames.length / 2)].t : 0;
  const side = nearSide(usable);
  const facing = facingDirection(usable, side, W, H);
  const idx = LM[side];
  // Search the middle 60% of the clip (the rider is settled there).
  const t0 = usable[0].t, t1 = usable[usable.length - 1].t, span = t1 - t0;
  let best = null, bestVal = -Infinity;
  for (const f of usable) {
    if (f.t < t0 + span * 0.2 || f.t > t1 - span * 0.2) continue;
    const toe = f.lm[idx.toe], hip = f.lm[idx.hip];
    if (toe[2] < 0.5 || hip[2] < 0.5) continue;
    const v = (toe[0] - hip[0]) * W * facing;
    if (v > bestVal) { bestVal = v; best = f; }
  }
  return (best || usable[Math.floor(usable.length / 2)]).t;
}

/* ==========================================================================
   Analysis (brief section 6)
   ========================================================================== */

/**
 * analyseClip — from heavy-model frames to measurements.
 * clip: { width, height, frames:[{t,lm}], calibration?: {taps, pxPerMm, tiltDeg, footSpindle?, calT?} }
 * returns { side, facing, strokes:[…], perStroke:{metric:[…]}, metrics:{metric:{value, spread, confidence, reason, n}}, segments, phase, geometry }
 */
function analyseClip(clip, opts) {
  const W = clip.width, H = clip.height;
  const frames = clip.frames || [];
  const usable = frames.filter((f) => f.lm);
  const result = { ok: false, side: null, facing: 1, strokes: [], perStroke: {}, metrics: {}, segments: {}, notes: [] };
  if (usable.length < 10) { result.error = 'Not enough frames with a rider in them.'; return result; }

  const side = clip.side || nearSide(usable);
  const cal = clip.calibration && clip.calibration.pxPerMm ? clip.calibration : null;
  const facing = cal ? cal.facing || facingDirection(usable, side, W, H) : facingDirection(usable, side, W, H);
  const sm = smoothSide(frames, side, W, H);
  result.side = side; result.facing = facing; result.calibration = cal;

  // Spindle tracking: the foot-to-spindle relationship from the calibration frame.
  let footRel = cal && cal.footSpindle ? cal.footSpindle : null;
  if (cal && !footRel && cal.taps && cal.taps.spindle && finite(cal.calT)) {
    const fi = nearestFrameIndex(sm, cal.calT);
    const f = sm[fi];
    if (f && f.j.heel && f.j.toe) footRel = spindleInFoot(f.j.heel, f.j.toe, cal.taps.spindle);
  }
  if (cal) cal.footSpindle = footRel;
  const bb = cal ? cal.taps.bb : null;
  const crankPx = cal ? dist(cal.taps.bb, cal.taps.spindle) : null;

  // Per-frame crank angle (unwrapped, degrees; 0 = forward, −90 = bottom, decreasing as it turns).
  const phase = sm.map((f) => {
    if (bb && footRel && f.j.heel && f.j.toe) {
      const s = spindleFromFoot(f.j.heel, f.j.toe, footRel);
      const w = toWorld(s, bb, facing, 1);
      const a = Math.atan2(w.y, w.x) * DEG;
      const onCircle = add(bb, scale(norm(sub(s, bb)), crankPx));
      return { a, spindle: onCircle };
    }
    return { a: NaN, spindle: null };
  });
  let unwrapped = null;
  if (phase.filter((p) => finite(p.a)).length > usable.length * 0.6) {
    unwrapped = [];
    let prev = null, offset = 0;
    for (const p of phase) {
      if (!finite(p.a)) { unwrapped.push(NaN); continue; }
      if (prev != null) {
        let d = p.a - prev;
        if (d > 180) offset -= 360; else if (d < -180) offset += 360;
      }
      prev = p.a;
      unwrapped.push(p.a + offset);
    }
    // Pedals turn clockwise in our world frame, so the unwrapped angle falls; if not, flip.
    const vals = unwrapped.filter(finite);
    if (vals.length > 2 && vals[vals.length - 1] > vals[0]) {
      result.notes.push('Crank appeared to turn backwards; using the foot path instead.');
      unwrapped = null;
    }
  }
  result.phaseSource = unwrapped ? 'crank' : 'foot';

  // Stroke boundaries: bottom dead centre (BDC) events.
  const bdcIdx = [];
  if (unwrapped) {
    // BDC when the unwrapped angle passes −90 − 360k going down.
    for (let i = 1; i < unwrapped.length; i++) {
      const a0 = unwrapped[i - 1], a1 = unwrapped[i];
      if (!finite(a0) || !finite(a1)) continue;
      const k0 = Math.floor((a0 + 90) / 360), k1 = Math.floor((a1 + 90) / 360);
      if (k1 < k0) {
        // Pick whichever of the two frames is closer to the exact bottom.
        const target = k0 * 360 - 90; // the −90 − 360k crossing between a0 and a1
        bdcIdx.push(Math.abs(a1 - target) < Math.abs(a0 - target) ? i : i - 1);
      }
    }
  } else {
    // Without calibration: the foot's lowest points (largest image y).
    const ys = sm.map((f) => (f.j.toe && f.j.heel ? (f.j.toe.y + f.j.heel.y) / 2 : NaN));
    const minGap = Math.max(3, Math.round(TF_CONFIG.triggers.minPeriodS / frameDt(sm)));
    const lo = quantile(ys, 0.1), hi = quantile(ys, 0.9);
    for (let i = 1; i < ys.length - 1; i++) {
      if (!finite(ys[i])) continue;
      let isMax = true;
      for (let k = Math.max(0, i - Math.floor(minGap / 2)); k <= Math.min(ys.length - 1, i + Math.floor(minGap / 2)); k++) {
        if (finite(ys[k]) && ys[k] > ys[i]) { isMax = false; break; }
      }
      if (isMax && ys[i] > lo + (hi - lo) * 0.6 && (!bdcIdx.length || i - bdcIdx[bdcIdx.length - 1] >= minGap)) bdcIdx.push(i);
    }
  }
  const strokes = [];
  for (let s = 0; s + 1 < bdcIdx.length; s++) strokes.push({ start: bdcIdx[s], end: bdcIdx[s + 1] });
  result.strokes = strokes.map((s) => ({ start: s.start, end: s.end, t0: sm[s.start].t, t1: sm[s.end].t }));
  if (strokes.length < 2) { result.error = 'Could not find complete pedal strokes in the recording.'; return result; }
  const periods = strokes.map((s) => sm[s.end].t - sm[s.start].t);
  result.cadence = 60 / median(periods);

  // Per-frame angles.
  const ang = sm.map((f) => {
    const j = f.j;
    const ok = (...n) => n.every((k) => j[k]);
    let back = NaN;
    if (ok('shoulder', 'hip')) {
      const w = toWorld(j.shoulder, j.hip, facing, 1);
      back = Math.atan2(w.y, w.x) * DEG - (cal ? cal.tiltDeg || 0 : 0);
    }
    return {
      knee: ok('hip', 'knee', 'ankle') ? angleAt(j.hip, j.knee, j.ankle) : NaN,
      hip: ok('shoulder', 'hip', 'knee') ? angleAt(j.shoulder, j.hip, j.knee) : NaN,
      ankle: ok('knee', 'ankle', 'toe') ? angleAt(j.knee, j.ankle, j.toe) : NaN,
      shoulder: ok('hip', 'shoulder', 'elbow') ? angleAt(j.hip, j.shoulder, j.elbow) : NaN,
      elbow: ok('shoulder', 'elbow', 'wrist') ? angleAt(j.shoulder, j.elbow, j.wrist) : NaN,
      wrist: ok('elbow', 'wrist', 'index') ? angleAt(j.elbow, j.wrist, j.index) : NaN,
      back,
    };
  });
  result.frameAngles = ang;
  result.phase = unwrapped ? unwrapped.map((a, i) => ({ a, spindle: phase[i].spindle })) : sm.map(() => ({ a: NaN, spindle: null }));

  // Per-stroke values.
  const per = { kneeExtension: [], kneeFlexion: [], hipClosed: [], ankleBDC: [], ankleROM: [], kops: [] };
  const strokeFrames = { bdc: [], tdc: [], forward: [] };
  for (const s of strokes) {
    let kMax = -Infinity, kMaxI = -1, kMin = Infinity, kMinI = -1, hMin = Infinity, aMin = Infinity, aMax = -Infinity;
    for (let i = s.start; i < s.end; i++) {
      const a = ang[i];
      if (finite(a.knee) && a.knee > kMax) { kMax = a.knee; kMaxI = i; }
      if (finite(a.knee) && a.knee < kMin) { kMin = a.knee; kMinI = i; }
      if (finite(a.hip) && a.hip < hMin) hMin = a.hip;
      if (finite(a.ankle)) { aMin = Math.min(aMin, a.ankle); aMax = Math.max(aMax, a.ankle); }
    }
    const kneeSeries = ang.map((x) => x.knee), hipSeries = ang.map((x) => x.hip);
    per.kneeExtension.push(kMaxI >= 0 ? refinePeak(kneeSeries, kMaxI) : NaN);
    per.kneeFlexion.push(kMinI >= 0 ? refinePeak(kneeSeries, kMinI) : NaN);
    let hMinI = -1; for (let i = s.start; i < s.end; i++) if (finite(ang[i].hip) && ang[i].hip === hMin) { hMinI = i; break; }
    per.hipClosed.push(hMinI >= 0 ? refinePeak(hipSeries, hMinI) : NaN);
    per.ankleBDC.push(kMaxI >= 0 ? ang[kMaxI].ankle : NaN);
    per.ankleROM.push(finite(aMax) && finite(aMin) ? aMax - aMin : NaN);
    strokeFrames.bdc.push(kMaxI);
    strokeFrames.tdc.push(kMinI);
    // KOPS: the frame nearest crank angle 0 (level, forward) within this stroke.
    let fwdI = -1;
    if (unwrapped) {
      let bestD = Infinity;
      for (let i = s.start; i < s.end; i++) {
        if (!finite(unwrapped[i])) continue;
        const d = Math.abs(((unwrapped[i] % 360) + 540) % 360 - 180);
        if (d < bestD) { bestD = d; fwdI = i; }
      }
      if (bestD > 20) fwdI = -1;
    } else {
      // No crank: the foot's most-forward point stands in.
      let best = -Infinity;
      for (let i = s.start; i < s.end; i++) {
        const j = sm[i].j;
        if (j.toe && j.hip) { const v = (j.toe.x - j.hip.x) * facing; if (v > best) { best = v; fwdI = i; } }
      }
    }
    strokeFrames.forward.push(fwdI);
    // KOPS at the exact moment the crank passes level-forward: interpolate between the frames either side.
    const kopsAt = (i) => (i >= 0 && cal && phase[i] && phase[i].spindle && sm[i].j.knee ? (sm[i].j.knee.x - phase[i].spindle.x) * facing / cal.pxPerMm + TF_CONFIG.targets.kopsKneeFrontOffsetMm : NaN);
    let kv = NaN;
    if (unwrapped && fwdI >= 0) {
      for (let i = Math.max(s.start + 1, fwdI - 1); i <= Math.min(s.end, fwdI + 1); i++) {
        const a0 = unwrapped[i - 1], a1 = unwrapped[i];
        if (!finite(a0) || !finite(a1)) continue;
        const target = Math.ceil(a1 / 360) * 360; // the crossing of 0 (mod 360) between a0 (above) and a1 (below)
        if (a0 >= target && a1 <= target && a0 !== a1) {
          const f = (a0 - target) / (a0 - a1), v0 = kopsAt(i - 1), v1 = kopsAt(i);
          if (finite(v0) && finite(v1)) kv = v0 + (v1 - v0) * f;
          break;
        }
      }
    }
    per.kops.push(finite(kv) ? kv : kopsAt(fwdI));
  }
  result.strokeFrames = strokeFrames;
  result.perStroke = per;

  // Whole-clip values (median across frames).
  const across = { backAngle: ang.map((a) => a.back), shoulder: ang.map((a) => a.shoulder), elbow: ang.map((a) => a.elbow), wrist: ang.map((a) => a.wrist) };

  // Segment lengths (90th percentile, px → mm when calibrated).
  const segP = TF_CONFIG.analysis.segmentPercentile;
  const seg = (a, b) => quantile(sm.map((f) => (f.j[a] && f.j[b] ? dist(f.j[a], f.j[b]) : NaN)), segP);
  const k = cal ? cal.pxPerMm : null;
  const toMm = (v) => (k ? v / k : NaN);
  result.segmentsPx = { thigh: seg('hip', 'knee'), shin: seg('knee', 'ankle'), foot: seg('heel', 'toe'), torso: seg('hip', 'shoulder'), upperArm: seg('shoulder', 'elbow'), forearm: seg('elbow', 'wrist') };
  result.segments = Object.fromEntries(Object.entries(result.segmentsPx).map(([n, v]) => [n, toMm(v)]));

  // Confidence and summary per metric.
  for (const m of METRIC_ORDER) {
    const isStroke = per[m] !== undefined;
    const values = isStroke ? per[m] : across[m];
    const value = median(values);
    const spread = isStroke ? iqr(values) : iqr(values);
    const conf = metricConfidence(m, sm, values, spread, isStroke);
    if (m === 'kops' && !cal) {
      result.metrics[m] = { value: NaN, spread: NaN, confidence: 'none', reason: 'Needs the calibration taps to measure in millimetres.', n: 0 };
      continue;
    }
    result.metrics[m] = { value, spread, confidence: conf.level, reason: conf.reason, n: values.filter(finite).length, visibility: conf.vis, present: conf.present };
  }

  // Geometry kept for recommendations: medians of joints at BDC and at crank-forward, in px.
  const medPoint = (idxs, name) => {
    const pts = idxs.filter((i) => i >= 0 && sm[i].j[name]).map((i) => sm[i].j[name]);
    return pts.length ? { x: median(pts.map((p) => p.x)), y: median(pts.map((p) => p.y)) } : null;
  };
  result.geometry = {
    bdc: { hip: medPoint(strokeFrames.bdc, 'hip'), knee: medPoint(strokeFrames.bdc, 'knee'), ankle: medPoint(strokeFrames.bdc, 'ankle') },
    forward: { hip: medPoint(strokeFrames.forward, 'hip'), knee: medPoint(strokeFrames.forward, 'knee'), ankle: medPoint(strokeFrames.forward, 'ankle'),
      spindle: cal ? (() => { const pts = strokeFrames.forward.filter((i) => i >= 0 && phase[i].spindle).map((i) => phase[i].spindle); return pts.length ? { x: median(pts.map((p) => p.x)), y: median(pts.map((p) => p.y)) } : null; })() : null },
  };
  result.smoothed = sm;
  result.ok = true;
  return result;
}

/** Refine a sampled extreme with a parabola through it and its neighbours (sub-frame accuracy). */
function refinePeak(values, i) {
  const y0 = values[i], ym = values[i - 1], yp = values[i + 1];
  if (!finite(y0) || !finite(ym) || !finite(yp)) return y0;
  const den = ym - 2 * y0 + yp;
  if (!den) return y0;
  const p = clamp(0.5 * (ym - yp) / den, -0.5, 0.5);
  return y0 - 0.25 * (ym - yp) * p;
}

function frameDt(sm) {
  if (sm.length < 2) return 1 / 30;
  return Math.max(1e-3, (sm[sm.length - 1].t - sm[0].t) / (sm.length - 1));
}
function nearestFrameIndex(frames, t) {
  let lo = 0, hi = frames.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (frames[mid].t < t) lo = mid; else hi = mid; }
  return Math.abs(frames[lo].t - t) <= Math.abs(frames[hi].t - t) ? lo : hi;
}

function metricConfidence(metric, sm, values, spread, isStroke) {
  const C = TF_CONFIG.confidence;
  const joints = METRIC_JOINTS[metric];
  const vis = mean(sm.map((f) => Math.min(...joints.map((j) => f.v[j] ?? 0))));
  const present = sm.filter((f) => joints.every((j) => (f.v[j] ?? 0) >= C.visibilityMedium * 0.85 && f.j[j])).length / (sm.length || 1);
  const isMm = METRICS[metric].unit === 'mm';
  const sHigh = isMm ? C.spreadHighMm : C.spreadHighDeg, sMed = isMm ? C.spreadMediumMm : C.spreadMediumDeg;
  const n = values.filter(finite).length;
  let level = 'high';
  const reasons = [];
  const lower = (to, why) => { if (rank(to) < rank(level)) level = to; if (why) reasons.push(why); };
  if (!n) return { level: 'none', reason: 'Not measured.', vis, present };
  if (vis < C.visibilityMedium) lower('low', `the ${jointList(joints)} ${joints.length > 1 ? 'were' : 'was'} hard to see`);
  else if (vis < C.visibilityHigh) lower('medium', `the ${jointList(joints)} ${joints.length > 1 ? 'were' : 'was'} partly hidden at times`);
  if (present < C.presentMedium) lower('low', `${jointList(joints)} hidden on ${Math.round((1 - present) * 100)}% of frames`);
  else if (present < C.presentHigh) lower('medium', `${jointList(joints)} hidden on ${Math.round((1 - present) * 100)}% of frames`);
  if (finite(spread)) {
    if (spread > sMed) lower('low', `varied a lot from stroke to stroke (±${Math.round(spread / 2)}${isMm ? ' mm' : '°'})`);
    else if (spread > sHigh) lower('medium', `varied from stroke to stroke (±${Math.round(spread / 2)}${isMm ? ' mm' : '°'})`);
  }
  if (isStroke && n < TF_CONFIG.triggers.minStrokes) lower('medium', `only ${n} strokes`);
  if (C.lowConfidenceMetrics.includes(metric)) lower('medium', 'hands are small in the frame');
  return { level, reason: reasons.length ? capitalise(reasons.join('; ')) + '.' : '', vis, present };
}
function rank(level) { return { none: 0, low: 1, medium: 2, high: 3 }[level] ?? 0; }
function capitalise(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function jointList(joints) {
  const w = [...new Set(joints.map((j) => JOINT_WORDS[j]))];
  return w.length === 1 ? w[0] : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
}

/* ==========================================================================
   Recommendations (brief 8.2, 8.3). Beta 1: saddle height and fore/aft.
   ========================================================================== */
function bandAims(band, side) {
  const [lo, hi] = band.green, w = hi - lo, k = TF_CONFIG.recommend.aimIntoBand;
  const near = side === 'low' ? lo + w * k : hi - w * k;
  return { near, centre: (lo + hi) / 2 };
}
function roundRange(a, b, step, max) {
  let lo = Math.min(Math.abs(a), Math.abs(b)), hi = Math.max(Math.abs(a), Math.abs(b));
  lo = Math.max(step, Math.floor(lo / step) * step);
  hi = Math.max(lo + step, Math.ceil(hi / step) * step);
  let capped = false;
  if (hi > max) { hi = max; lo = Math.min(lo, max - step); capped = true; }
  return { lo, hi, capped };
}

/** Bisection on a monotone function f over [a, b] for f(x) = target. */
function solveMonotone(f, target, a, b) {
  let fa = f(a) - target, fb = f(b) - target;
  if (!finite(fa) || !finite(fb) || fa * fb > 0) return NaN;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2, fm = f(m) - target;
    if (!finite(fm)) return NaN;
    if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}

/** Saddle height change (mm, + = raise) that brings knee extension to the target angle. */
function saddleHeightChange(analysis, targetDeg) {
  const g = analysis.geometry && analysis.geometry.bdc;
  const seg = analysis.segments;
  const cal = analysis.calibration;
  if (!g || !g.hip || !g.ankle || !cal || !finite(seg.thigh) || !finite(seg.shin)) return NaN;
  const bb = cal.taps.bb, facing = analysis.facing, k = cal.pxPerMm;
  const hip = toWorld(g.hip, bb, facing, k), ankle = toWorld(g.ankle, bb, facing, k);
  // The saddle moves along the line from the bottom bracket through the hip (effective seat tube).
  const u = norm(hip);
  const T = seg.thigh, S = seg.shin;
  const kneeAngle = (delta) => { const h = add(hip, scale(u, delta)); const kn = solveKnee(h, ankle, T, S); return kn ? angleAt(h, kn, ankle) : NaN; };
  // Correct for any gap between the model and the measured angle at the current position.
  const offset = analysis.metrics.kneeExtension.value - kneeAngle(0);
  const R = TF_CONFIG.recommend.searchRangeMm;
  return solveMonotone((d) => kneeAngle(d) + offset, targetDeg, -R, R);
}

/** Saddle fore/aft change (mm, + = move back) that brings KOPS to the target. */
function saddleSetbackChange(analysis, targetMm) {
  const g = analysis.geometry && analysis.geometry.forward;
  const seg = analysis.segments, cal = analysis.calibration;
  if (!g || !g.hip || !g.ankle || !g.spindle || !cal || !finite(seg.thigh) || !finite(seg.shin)) return NaN;
  const bb = cal.taps.bb, facing = analysis.facing, k = cal.pxPerMm;
  const hip = toWorld(g.hip, bb, facing, k), ankle = toWorld(g.ankle, bb, facing, k), spindle = toWorld(g.spindle, bb, facing, k);
  const T = seg.thigh, S = seg.shin;
  const kops = (back) => { const h = { x: hip.x - back, y: hip.y }; const kn = solveKnee(h, ankle, T, S); return kn ? kn.x - spindle.x : NaN; };
  const offset = analysis.metrics.kops.value - kops(0);
  const R = TF_CONFIG.recommend.searchRangeMm;
  // KOPS falls as the saddle goes back; solveMonotone handles either direction.
  return solveMonotone((b) => kops(b) + offset, targetMm, -R, R);
}

/**
 * recommend — the single next change, in the brief's order, plus what would come after.
 * Beta 1 recommends saddle height and fore/aft; later steps are listed as "coming next" only.
 */
function recommend(analysis, targets, opts) {
  const units = (opts && opts.units) || 'metric';
  const R = TF_CONFIG.recommend;
  const m = analysis.metrics;
  const usable = (name) => m[name] && finite(m[name].value) && (m[name].confidence === 'high' || m[name].confidence === 'medium');
  const steps = [];

  // 1. Cleats: only flagged (parts/shop change), Beta 1 does not measure cleat position directly.
  const ankle = classify(m.ankleBDC && m.ankleBDC.value, targets.ankleBDC);

  // 2. Saddle height from knee extension, cross-checked with the ankle.
  const ke = classify(m.kneeExtension && m.kneeExtension.value, targets.kneeExtension);
  if (usable('kneeExtension') && ke.status !== 'green') {
    const raise = ke.side === 'low';
    const aims = bandAims(targets.kneeExtension, ke.side);
    const d1 = saddleHeightChange(analysis, aims.near), d2 = saddleHeightChange(analysis, aims.centre);
    let amount = null;
    if (finite(d1) && finite(d2)) amount = roundRange(d1, d2, R.saddleStepMm, R.maxSaddleChangeMm);
    let crossCheck = '';
    if (raise && ankle.status !== 'green' && ankle.side === 'high') crossCheck = 'Your toes point down a lot at the bottom of the stroke, which can hide a low saddle or come from reaching for the pedal. Ride with a relaxed ankle when you retest.';
    if (!raise && ankle.status !== 'green' && ankle.side === 'high') crossCheck = 'Your toes also point down at the bottom of the stroke, which fits a saddle that is a little high.';
    steps.push({
      id: 'saddleHeight', order: 2, metric: 'kneeExtension', kind: 'adjust',
      strength: ke.status === 'red' ? 'recommended' : 'fine-tune',
      action: raise ? 'Raise the saddle' : 'Lower the saddle',
      amount, direction: raise ? 1 : -1,
      text: amount
        ? `${raise ? 'Raise' : 'Lower'} the saddle ${fmtRange(amount.lo, amount.hi, units)}, then retest.`
        : `${raise ? 'Raise' : 'Lower'} the saddle a little (about 5 mm), then retest. Add the calibration taps for a measured amount.`,
      why: `Your knee extension is ${fmtAngle(m.kneeExtension.value)}, ${raise ? 'below' : 'above'} the target range of ${fmtBand('kneeExtension', targets.kneeExtension, units)}. ${raise ? 'A low saddle leaves the knee bent at the bottom of the stroke.' : 'A high saddle over-straightens the knee and can make the hips rock.'}`,
      note: [amount && amount.capped ? `The full correction may be more than this. Change it no more than ${fmtLength(R.maxSaddleChangeMm, units, 'adjust')} at a time and retest between steps.` : '', crossCheck].filter(Boolean).join(' '),
      howTo: 'Mark the seatpost with tape at the frame before loosening it, so you can measure the change and go back if you need to.',
    });
  }

  // 3. Saddle fore/aft from KOPS, with the closed hip angle as context.
  const kp = classify(m.kops && m.kops.value, targets.kops);
  if (usable('kops') && kp.status !== 'green') {
    const back = kp.side === 'high';
    const aims = bandAims(targets.kops, kp.side);
    const d1 = saddleSetbackChange(analysis, aims.near), d2 = saddleSetbackChange(analysis, aims.centre);
    let amount = null;
    if (finite(d1) && finite(d2)) amount = roundRange(d1, d2, R.saddleStepMm, R.maxSaddleChangeMm);
    steps.push({
      id: 'saddleSetback', order: 3, metric: 'kops', kind: 'adjust',
      strength: kp.status === 'red' ? 'recommended' : 'fine-tune',
      action: back ? 'Move the saddle back' : 'Move the saddle forward',
      amount, direction: back ? 1 : -1,
      text: amount ? `${back ? 'Move the saddle back' : 'Move the saddle forward'} ${fmtRange(amount.lo, amount.hi, units)} on its rails, then retest.` : `${back ? 'Move the saddle back' : 'Move the saddle forward'} a little on its rails, then retest.`,
      why: `With the crank level, your knee is ${fmtSignedMm(m.kops.value, units)} from the pedal spindle; the target is ${fmtBand('kops', targets.kops, units)}.`,
      note: `Moving the saddle ${back ? 'back' : 'forward'} also ${back ? 'raises' : 'lowers'} it slightly in effect, so the next retest re-checks saddle height.`,
      howTo: 'The rails have a scale on most saddles; note where the clamp sits before you move it.',
    });
  }

  // Later steps (Beta 2): listed so the rider can see what comes after, never as instructions now.
  const later = [];
  const hip = classify(m.hipClosed && m.hipClosed.value, targets.hipClosed);
  const backA = classify(m.backAngle && m.backAngle.value, targets.backAngle);
  const sh = classify(m.shoulder && m.shoulder.value, targets.shoulder);
  const el = classify(m.elbow && m.elbow.value, targets.elbow);
  const wr = classify(m.wrist && m.wrist.value, targets.wrist);
  if ([hip, backA, sh, el].some((c) => c.status === 'red' || c.status === 'yellow')) {
    later.push({ id: 'reachDrop', order: 5, text: 'Reach and drop (stem length, spacers, bar height)', why: describeOut([['hipClosed', hip], ['backAngle', backA], ['shoulder', sh], ['elbow', el]], m, targets, units) });
  }
  if (wr.status === 'red') later.push({ id: 'hands', order: 6, text: 'Bar width and hood position', why: describeOut([['wrist', wr]], m, targets, units) });
  if (ankle.status === 'red') later.push({ id: 'cleats', order: 1, text: 'Cleat position (a shop or parts change)', why: describeOut([['ankleBDC', ankle]], m, targets, units) });
  const kf = classify(m.kneeFlexion && m.kneeFlexion.value, targets.kneeFlexion);
  if (kf.status === 'red' && kf.side === 'low' && ke.status === 'green') later.push({ id: 'crank', order: 7, text: 'Crank length (a parts change)', why: describeOut([['kneeFlexion', kf]], m, targets, units) });

  steps.sort((a, b) => a.order - b.order);
  later.sort((a, b) => a.order - b.order);
  const current = steps[0] || null;
  return { current, queued: steps.slice(1), later, allSaddleGreen: !steps.length };
}
function describeOut(pairs, m, targets, units) {
  return pairs.filter(([, c]) => c.status === 'red' || c.status === 'yellow')
    .map(([k, c]) => `${METRICS[k].label} ${fmtMetric(k, m[k].value, units)} is ${c.side === 'low' ? 'below' : 'above'} ${fmtBand(k, targets[k], units)}`).join('; ') + '.';
}

/* ==========================================================================
   Discomfort: focus and gate, never diagnosis (brief section 7)
   ========================================================================== */
function discomfortGate(answers) {
  const D = TF_CONFIG.discomfort;
  if (!answers) return { gated: false, reasons: [] };
  const reasons = [];
  for (const r of D.regions) {
    const a = answers.regions && answers.regions[r];
    if (!a) continue;
    if (a.level === D.gateOnLevel) reasons.push(`severe discomfort (${REGIONS[r].label.toLowerCase()})`);
    else if (a.level !== 'none' && a.pattern === D.gateOnPattern) reasons.push(`discomfort that lasts after rides (${REGIONS[r].label.toLowerCase()})`);
  }
  if (answers.numbness) reasons.push('numbness');
  if (answers.recentInjury) reasons.push('a recent injury or medical treatment');
  return { gated: reasons.length > 0, reasons };
}

/**
 * discomfortNotes — for each region with discomfort, what the measurements say, in careful language.
 * Never states a cause; never invents a fit problem; says plainly when the related measurements are in range.
 */
function discomfortNotes(answers, analysis, targets, units) {
  const notes = [];
  if (!answers || !answers.regions) return notes;
  const order = { severe: 0, moderate: 1, mild: 2 };
  const regions = Object.entries(answers.regions)
    .filter(([, a]) => a && a.level && a.level !== 'none')
    .sort((a, b) => order[a[1].level] - order[b[1].level]);
  for (const [key, a] of regions) {
    const reg = REGIONS[key];
    if (!reg) continue;
    const note = { region: key, label: reg.label, level: a.level, pattern: a.pattern, highlight: [], text: '' };
    if (!reg.assoc.length) { note.text = reg.notMeasurable; notes.push(note); continue; }
    const out = [], measured = [], otherWay = [];
    for (const as of reg.assoc) {
      const mm = analysis.metrics[as.metric];
      if (!mm || !finite(mm.value) || mm.confidence === 'low' || mm.confidence === 'none') continue;
      const c = classify(mm.value, targets[as.metric]);
      measured.push({ metric: as.metric, c, value: mm.value });
      if (c.status !== 'green' && c.side === as.when) out.push({ as, c, value: mm.value });
    }
    note.highlight = [...new Set(out.map((o) => o.as.metric))];
    const aspect = { kneeFront: 'saddle position', kneeBack: 'saddle height', hands: 'reach and bar position', neckShoulders: 'reach and bar height', lowerBack: 'saddle and bar position', saddle: 'saddle height', feet: 'saddle height' }[key] || 'bike fit';
    const seen = new Set();
    const uniq = measured.filter((x) => (seen.has(x.metric) ? false : seen.add(x.metric)));
    const label = (k) => METRICS[k].label.toLowerCase();
    const list = (arr) => (arr.length === 1 ? arr[0] : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);
    if (out.length) {
      const o = out[0];
      note.text = `${capitalise(reg.phrase)} is often associated with ${o.as.cause}. Your ${label(o.as.metric)} is ${fmtMetric(o.as.metric, o.value, units)}, ${o.c.side === 'low' ? 'below' : 'above'} the target range of ${fmtBand(o.as.metric, targets[o.as.metric], units)}, so this is worth checking first.`;
      const rest = [...new Set(out.slice(1).map((x) => x.as.metric))].filter((k) => k !== o.as.metric);
      if (rest.length) note.text += ` Also outside its range: ${rest.map((k) => `${label(k)} (${fmtMetric(k, analysis.metrics[k].value, units)})`).join(', ')}.`;
      note.text += ' A fit change may or may not help; if the discomfort continues, see a professional.';
    } else if (uniq.length) {
      const green = uniq.filter((x) => x.c.status === 'green').map((x) => label(x.metric));
      const other = uniq.filter((x) => x.c.status !== 'green');
      const parts = [];
      if (green.length) parts.push(`Your ${list(green)} ${green.length > 1 ? 'are' : 'is'} within range`);
      if (other.length) parts.push(`${green.length ? 'your' : 'Your'} ${list(other.map((x) => `${label(x.metric)} is ${x.c.side === 'low' ? 'below' : 'above'} range`))}, which is not the direction usually associated with ${reg.phrase}`);
      if (other.length) {
        note.text = `${parts.join(', and ')}. Any change suggested for those measurements is about the measurements themselves, not this discomfort. ${OTHER_CAUSES}`;
      } else {
        note.text = `${parts.join(', and ')}, so ${aspect} is unlikely to be the main factor. ${OTHER_CAUSES}`;
      }
      note.inRange = true;
    } else {
      note.text = 'The measurements related to this were not clear enough in this recording to say anything about it. Try a retest with better light, or see a professional.';
    }
    if (reg.partial) note.text += ` ${reg.partial}`;
    notes.push(note);
  }
  return notes;
}

/* ==========================================================================
   Session results: everything the dashboard and report show
   ========================================================================== */
function buildResults(analysis, profile, hand, discomfort, units) {
  const targets = targetsFor(profile, hand);
  const rec = analysis.ok ? recommend(analysis, targets, { units }) : null;
  const gate = discomfortGate(discomfort);
  const notes = analysis.ok ? discomfortNotes(discomfort, analysis, targets, units) : [];
  const gauges = METRIC_ORDER.map((k) => {
    const mm = analysis.metrics && analysis.metrics[k];
    const c = classify(mm && mm.value, targets[k]);
    return { metric: k, value: mm ? mm.value : NaN, spread: mm ? mm.spread : NaN, confidence: mm ? mm.confidence : 'none', reason: mm ? mm.reason : '', band: targets[k], status: mm && (mm.confidence === 'low' || mm.confidence === 'none') ? 'none' : c.status, side: c.side };
  });
  // Regions the rider flagged come first: their highlighted metrics lead the gauge list.
  const highlighted = new Set(notes.flatMap((n) => n.highlight));
  gauges.sort((a, b) => (highlighted.has(b.metric) ? 1 : 0) - (highlighted.has(a.metric) ? 1 : 0));
  return { targets, recommendation: rec, gate, discomfortNotes: notes, gauges, highlighted: [...highlighted] };
}

/* ==========================================================================
   Fit file model (brief section 10). Pure data operations; zipping lives in the app.
   ========================================================================== */
function newFitFile(name) {
  const now = new Date().toISOString();
  return { format: TF_CONFIG.app.fileFormat, schema: TF_CONFIG.app.schemaVersion, app: TF_CONFIG.app.name, appVersion: TF_CONFIG.app.version, name: name || 'My fits', created: now, modified: now, riders: [], extra: {} };
}
function newRider(name) {
  const now = new Date().toISOString();
  return {
    id: uid('r'), name: name || 'Rider', created: now, modified: now,
    profile: { bikeType: 'road', goal: 'endurance', hands: ['hoods'], height: null, inseam: null, age: null, sex: '', flexibility: '' },
    bike: { name: '', crankLength: 172.5, wheel: TF_CONFIG.calibration.defaultWheel, wheelDiameterMm: null },
    sessions: [],
  };
}
function newSession(rider) {
  const now = new Date().toISOString();
  return {
    id: uid('s'), riderId: rider.id, created: now, modified: now,
    profile: JSON.parse(JSON.stringify(rider.profile)), bike: JSON.parse(JSON.stringify(rider.bike)),
    discomfort: null, clips: [], snapshots: [], reports: [], results: null, retestOf: null, note: '',
  };
}

/** Move an older file forward. Unknown fields are always preserved. */
function migrateFile(obj) {
  if (!obj || obj.format !== TF_CONFIG.app.fileFormat) throw new Error('This is not a Tango Fitter file.');
  const schema = Number(obj.schema) || 0;
  if (schema > TF_CONFIG.app.schemaVersion) {
    // A newer app wrote this. Keep everything; the app may not understand all of it.
    obj._newerSchema = schema;
  }
  if (!Array.isArray(obj.riders)) obj.riders = [];
  for (const r of obj.riders) {
    if (!Array.isArray(r.sessions)) r.sessions = [];
    r.profile = Object.assign(newRider().profile, r.profile || {});
    r.bike = Object.assign(newRider().bike, r.bike || {});
    for (const s of r.sessions) {
      s.clips = s.clips || []; s.snapshots = s.snapshots || []; s.reports = s.reports || [];
    }
  }
  return obj;
}

/** Merge incoming into current: riders matched by id; sessions matched by id, newest wins; unmatched added. */
function mergeFiles(current, incoming) {
  const out = JSON.parse(JSON.stringify(current));
  let ridersAdded = 0, sessionsAdded = 0, sessionsUpdated = 0;
  for (const ri of incoming.riders) {
    const rc = out.riders.find((r) => r.id === ri.id);
    if (!rc) { out.riders.push(JSON.parse(JSON.stringify(ri))); ridersAdded++; sessionsAdded += ri.sessions.length; continue; }
    if ((ri.modified || '') > (rc.modified || '')) { rc.name = ri.name; rc.profile = ri.profile; rc.bike = ri.bike; rc.modified = ri.modified; }
    for (const si of ri.sessions) {
      const k = rc.sessions.findIndex((s) => s.id === si.id);
      if (k < 0) { rc.sessions.push(JSON.parse(JSON.stringify(si))); sessionsAdded++; }
      else if ((si.modified || '') > (rc.sessions[k].modified || '')) { rc.sessions[k] = JSON.parse(JSON.stringify(si)); sessionsUpdated++; }
    }
    rc.sessions.sort((a, b) => (a.created < b.created ? -1 : 1));
  }
  // Unknown top-level fields from the incoming file are kept if the current file lacks them.
  for (const [k, v] of Object.entries(incoming)) if (!(k in out)) out[k] = v;
  out.modified = new Date().toISOString();
  return { file: out, ridersAdded, sessionsAdded, sessionsUpdated };
}

/** Paths inside the .tango zip. */
const PATHS = {
  manifest: 'manifest.json',
  rider: (r) => `riders/${r}/rider.json`,
  session: (r, s) => `riders/${r}/sessions/${s}/session.json`,
  clip: (r, s, c, ext) => `riders/${r}/sessions/${s}/clips/${c}.${ext}`,
  snapshot: (r, s, n) => `riders/${r}/sessions/${s}/snapshots/${n}.png`,
  report: (r, s, n) => `riders/${r}/sessions/${s}/reports/${n}.pdf`,
};

/* ==========================================================================
   Synthetic rider — a forward-kinematic model used for the sample fit and for tests.
   Builds pose frames exactly as the detector would report them.
   ========================================================================== */
function simulateRider(p) {
  p = Object.assign({
    W: 1280, H: 720, fps: 30, seconds: 12, cadence: 85, facing: 1, side: 'left',
    pxPerMm: 0.36, bbPx: { x: 560, y: 540 },
    crank: 172.5, thigh: 470, shin: 450,
    seatAngleDeg: 73.5, saddleToHip: 0,   // hip lies on the effective seat tube line
    hipFromBB: null,                      // mm along the seat tube; computed if null
    targetKneeExt: 145, saddleOffsetMm: 0, setbackOffsetMm: 0,
    backDeg: 47, torso: 560, upperArm: 300, forearm: 270, handReach: null,
    ankleBase: 102, ankleSwing: 9,         // knee–ankle–toe angle (deg) and its swing through the stroke
    noisePx: 1.2, wheel: '700x28', seed: 7,
  }, p || {});
  let s = p.seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const R = Math.PI / 180;
  const seatU = { x: -Math.cos(p.seatAngleDeg * R), y: Math.sin(p.seatAngleDeg * R) };
  // Foot geometry relative to the spindle in the foot's frame (mm): x along the foot, y up.
  const footPts = { ankle: { x: -125, y: 85 }, heel: { x: -175, y: 35 }, toe: { x: 70, y: 10 } };
  const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const footWithPitch = (phi, pitch) => {
    const spindle = { x: p.crank * Math.cos(phi), y: p.crank * Math.sin(phi) };
    const o = {};
    for (const [k, v] of Object.entries(footPts)) o[k] = add(spindle, rot(v, pitch));
    o.spindle = spindle;
    return o;
  };
  // Real riders hold the ankle (shin-to-foot) angle within a narrow band, so the foot's pitch
  // follows the shin. Solve for the pitch that gives the wanted ankle angle at this crank angle.
  let hipForFoot = null;
  const footAt = (phi) => {
    const want = p.ankleBase - p.ankleSwing * Math.sin(phi); // knee–ankle–toe angle, deg: toes down at the bottom
    let pitch = -20 * R;
    if (!hipForFoot) return footWithPitch(phi, pitch);
    for (let it = 0; it < 6; it++) {
      const f = footWithPitch(phi, pitch);
      const kn = solveKnee(hipForFoot, f.ankle, p.thigh, p.shin);
      if (!kn) break;
      const err = angleAt(kn, f.ankle, f.toe) - want;
      pitch += err * R * 0.9; // turning the toe up closes the ankle angle
    }
    return footWithPitch(phi, pitch);
  };
  // Place the hip so knee extension at the bottom equals targetKneeExt (before offsets).
  let hipDist = p.hipFromBB;
  if (hipDist == null) {
    const kneeAt = (dd) => {
      let best = -Infinity;
      const h = scale(seatU, dd);
      hipForFoot = h;
      for (let a = -150; a <= -30; a += 2) {
        const f = footAt(a * R);
        const kn = solveKnee(h, f.ankle, p.thigh, p.shin); if (!kn) return 180;
        best = Math.max(best, angleAt(h, kn, f.ankle));
      }
      return best;
    };
    hipDist = solveMonotone(kneeAt, p.targetKneeExt, 600, 950);
  }
  const hip = add(scale(seatU, hipDist + p.saddleOffsetMm), { x: -p.setbackOffsetMm, y: 0 });
  hipForFoot = hip;
  const shoulder = add(hip, { x: p.torso * Math.cos(p.backDeg * R), y: p.torso * Math.sin(p.backDeg * R) });
  // Hands: placed so the elbow sits at a comfortable bend.
  const reach = p.handReach || (p.upperArm + p.forearm) * 0.975;
  const handDir = norm({ x: 0.92, y: -0.55 });
  const wrist = add(shoulder, scale(handDir, reach));
  const elbowSol = circleIntersect(shoulder, p.upperArm, wrist, p.forearm);
  const elbow = elbowSol ? (elbowSol[0].y < elbowSol[1].y ? elbowSol[0] : elbowSol[1]) : add(shoulder, scale(handDir, p.upperArm));
  const index = add(wrist, scale(norm({ x: 1, y: -0.2 }), 85));
  const nose = add(shoulder, { x: 120, y: 190 });

  const wheelD = WHEELS[p.wheel].bsd + 2 * WHEELS[p.wheel].tyre;
  const rearAxle = { x: -410, y: 70 }, frontAxle = { x: 590, y: 70 };
  const bike = { rearAxle, frontAxle, tyreTop: add(rearAxle, { x: 0, y: wheelD / 2 }), tyreBack: add(rearAxle, { x: -wheelD / 2, y: 0 }), bb: { x: 0, y: 0 } };
  const img = (w) => toImage(w, p.bbPx, p.facing, p.pxPerMm);

  const frames = [];
  const n = Math.round(p.seconds * p.fps);
  const omega = -2 * Math.PI * p.cadence / 60; // clockwise
  const truth = [];
  for (let i = 0; i < n; i++) {
    const t = i / p.fps;
    const phi = Math.PI / 3 + omega * t;
    const near = footAt(phi), far = footAt(phi + Math.PI);
    const kN = solveKnee(hip, near.ankle, p.thigh, p.shin), kF = solveKnee(hip, far.ankle, p.thigh, p.shin);
    const lm = new Array(33).fill(null).map(() => [0.5, 0.5, 0.05]);
    const put = (index, w, vis) => { const q = img(w); lm[index] = [(q.x + gauss() * p.noisePx) / p.W, (q.y + gauss() * p.noisePx) / p.H, vis]; };
    const nearIdx = LM[p.side], farIdx = LM[p.side === 'left' ? 'right' : 'left'];
    put(LM.nose, nose, 0.95);
    put(nearIdx.shoulder, shoulder, 0.97); put(farIdx.shoulder, add(shoulder, { x: 8, y: 4 }), 0.55);
    put(nearIdx.elbow, elbow, 0.93); put(farIdx.elbow, add(elbow, { x: 6, y: 3 }), 0.45);
    put(nearIdx.wrist, wrist, 0.9); put(farIdx.wrist, add(wrist, { x: 5, y: 2 }), 0.4);
    put(nearIdx.index, index, 0.85); put(farIdx.index, add(index, { x: 5, y: 2 }), 0.35);
    put(nearIdx.hip, hip, 0.96); put(farIdx.hip, add(hip, { x: 6, y: 2 }), 0.6);
    put(nearIdx.knee, kN, 0.95); put(farIdx.knee, kF, 0.5);
    put(nearIdx.ankle, near.ankle, 0.93); put(farIdx.ankle, far.ankle, 0.45);
    put(nearIdx.heel, near.heel, 0.9); put(farIdx.heel, far.heel, 0.4);
    put(nearIdx.toe, near.toe, 0.9); put(farIdx.toe, far.toe, 0.4);
    frames.push({ t, lm });
    truth.push({ phi, knee: angleAt(hip, kN, near.ankle), hip: angleAt(shoulder, hip, kN), ankle: angleAt(kN, near.ankle, near.toe), kops: kN.x - near.spindle.x });
  }
  const taps = {};
  for (const k of ['rearAxle', 'frontAxle', 'tyreTop', 'tyreBack', 'bb']) taps[k] = img(bike[k]);
  // The calibration frame: crank closest to level-forward in the middle of the clip.
  let calI = 0, best = Infinity;
  for (let i = Math.floor(n * 0.3); i < Math.floor(n * 0.7); i++) {
    const d = Math.abs((((truth[i].phi * 180 / Math.PI) % 360) + 540) % 360 - 180);
    if (d < best) { best = d; calI = i; }
  }
  taps.spindle = img(footAt(truth[calI].phi).spindle);
  return {
    width: p.W, height: p.H, fps: p.fps, frames, taps, calT: frames[calI].t, truth,
    params: p, hipDist,
    truthSummary: {
      kneeExtension: Math.max(...truth.map((x) => x.knee)),
      kneeFlexion: Math.min(...truth.map((x) => x.knee)),
      hipClosed: Math.min(...truth.map((x) => x.hip)),
      backAngle: p.backDeg,
      elbow: angleAt(shoulder, elbow, wrist),
      shoulder: angleAt(hip, shoulder, elbow),
      wrist: angleAt(elbow, wrist, index),
    },
  };
}

/* ==========================================================================
   Export
   ========================================================================== */
const TF = {
  CONFIG: TF_CONFIG, LM, JOINTS, REQUIRED_JOINTS, METRICS, METRIC_ORDER, REGIONS, BIKE_TYPES, GOALS, HAND_POSITIONS, WHEELS, CRANK_LENGTHS, PATHS,
  angleAt, median, quantile, mean, iqr, clamp, dist, finite, uid, solveKnee, circleIntersect,
  fmtLength, fmtSignedMm, fmtRange, fmtAngle, fmtMetric, fmtBand, inchFraction,
  targetsFor, classify, compactLandmarks, nearSide, facingDirection, smoothSide, toWorld, toImage,
  wheelOuterDiameter, computeCalibration, spindleInFoot, spindleFromFoot,
  StrokeCounter, framingCheck, describeMissing, captureQuality, pickCalibrationTime,
  analyseClip, nearestFrameIndex, recommend, saddleHeightChange, saddleSetbackChange,
  discomfortGate, discomfortNotes, buildResults,
  newFitFile, newRider, newSession, migrateFile, mergeFiles, simulateRider,
};
root.TF = TF;
if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
