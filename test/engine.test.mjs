// Engine tests: run with `node --test test/`.
// The engine is loaded straight from src/engine.js, the same code that goes into index.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const TF = require('../src/engine.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a.toFixed ? a.toFixed(2) : a}, expected ${b.toFixed ? b.toFixed(2) : b} ±${tol}`);
const BIKE = { crankLength: 172.5, wheel: '700x28' };
const PROFILE = { bikeType: 'road', goal: 'endurance', hands: ['hoods'], flexibility: '' };

function analyseSim(simParams, { calibrate = true } = {}) {
  const sim = TF.simulateRider(simParams);
  const clip = { width: sim.width, height: sim.height, frames: sim.frames };
  if (calibrate) {
    const cal = TF.computeCalibration(sim.taps, BIKE, sim.height);
    cal.calT = sim.calT;
    clip.calibration = cal;
  }
  return { sim, clip, a: TF.analyseClip(clip) };
}

test('calibration: scale, squareness and level from the taps', () => {
  const sim = TF.simulateRider({});
  const cal = TF.computeCalibration(sim.taps, BIKE, sim.height);
  near(cal.pxPerMm, 0.36, 0.005, 'px per mm');
  assert.ok(cal.agreement < 0.01, 'crank and wheel scales agree');
  near(cal.squareRatio, 1, 0.01, 'square ratio');
  near(cal.tiltDeg, 0, 0.1, 'tilt');
  assert.equal(cal.ok, true);
});

test('calibration: a camera turned 15° is flagged (section 15)', () => {
  const sim = TF.simulateRider({});
  // Turning the camera about the vertical axis compresses horizontal distances by cos(15°).
  const k = Math.cos(15 * Math.PI / 180);
  const cx = sim.taps.bb.x;
  const turned = Object.fromEntries(Object.entries(sim.taps).map(([n, p]) => [n, { x: cx + (p.x - cx) * k, y: p.y }]));
  const cal = TF.computeCalibration(turned, BIKE, sim.height);
  assert.ok(cal.squareRatio < 0.97, `ratio ${cal.squareRatio}`);
  assert.ok(cal.warnings.some((w) => w.code === 'square'), 'square warning');
  assert.equal(cal.ok, false);
});

test('analysis: angles match the simulated rider', () => {
  const { sim, a } = analyseSim({});
  assert.equal(a.ok, true, a.error);
  assert.equal(a.phaseSource, 'crank');
  assert.ok(a.strokes.length >= 14, `strokes ${a.strokes.length}`);
  near(a.cadence, 85, 2, 'cadence');
  const t = sim.truthSummary, m = a.metrics;
  near(m.kneeExtension.value, t.kneeExtension, 2, 'knee extension');
  near(m.kneeFlexion.value, t.kneeFlexion, 2, 'knee flexion');
  near(m.hipClosed.value, t.hipClosed, 3, 'closed hip');
  near(m.backAngle.value, t.backAngle, 2, 'back angle');
  near(m.elbow.value, t.elbow, 3, 'elbow');
  near(m.shoulder.value, t.shoulder, 3, 'shoulder');
  assert.equal(m.kneeExtension.confidence, 'high');
  assert.equal(m.wrist.confidence === 'high', false, 'wrist is always flagged lower confidence');
  // KOPS against the true value at crank-forward frames.
  const trueKops = TF.median(sim.truth.filter((x) => Math.abs(((x.phi * 180 / Math.PI % 360) + 540) % 360 - 180) < 6).map((x) => x.kops)) + TF.CONFIG.targets.kopsKneeFrontOffsetMm;
  near(m.kops.value, trueKops, 8, 'KOPS (mm)');
  // Segments recovered in millimetres.
  near(a.segments.thigh, 470, 15, 'thigh mm');
  near(a.segments.shin, 450, 15, 'shin mm');
});

test('analysis: works the same facing left and filmed from the right side', () => {
  const { a: l } = analyseSim({});
  const { a: r } = analyseSim({ facing: -1, side: 'right', bbPx: { x: 720, y: 520 } });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.side, 'right');
  assert.equal(r.facing, -1);
  for (const k of ['kneeExtension', 'hipClosed', 'backAngle', 'elbow']) near(r.metrics[k].value, l.metrics[k].value, 2.5, k);
  near(r.metrics.kops.value, l.metrics.kops.value, 6, 'kops (mm)');
});

test('analysis without calibration: angles still measured, KOPS and millimetres not', () => {
  const { sim, a } = analyseSim({}, { calibrate: false });
  assert.equal(a.ok, true, a.error);
  assert.equal(a.phaseSource, 'foot');
  near(a.metrics.kneeExtension.value, sim.truthSummary.kneeExtension, 2.5, 'knee extension');
  assert.equal(a.metrics.kops.confidence, 'none');
  const res = TF.buildResults(a, PROFILE, 'hoods', null, 'metric');
  assert.ok(res.gauges.find((g) => g.metric === 'kops').status === 'none');
});

// 2.0 E1 replaces Beta 1's "10–25 mm" expectation: one step is at most 10 mm, and a correction that reaches the
// cap is a single 10 mm step.
test('2.0 E1: saddle 15 mm too low → "Raise the saddle 10 mm, then retest."', () => {
  const { a } = analyseSim({ saddleOffsetMm: -15 });
  const r = TF.buildResults(a, PROFILE, 'hoods', null, 'metric').recommendation.current;
  assert.equal(r.id, 'saddleHeight');
  assert.equal(r.direction, 1, 'raise');
  assert.deepEqual([r.amount.lo, r.amount.hi], [10, 10]);
  assert.equal(r.text, 'Raise the saddle 10 mm, then retest.');
  assert.match(r.note, /no more than 10 mm at a time/);
});
test('2.0 E1: saddle 15 mm too high → "Lower the saddle 10 mm, then retest."', () => {
  const { a } = analyseSim({ saddleOffsetMm: 15 });
  const r = TF.buildResults(a, PROFILE, 'hoods', null, 'metric').recommendation.current;
  assert.equal(r.id, 'saddleHeight');
  assert.equal(r.direction, -1, 'lower');
  assert.equal(r.text, 'Lower the saddle 10 mm, then retest.');
});
test('2.0 A3: a smaller error is a range in 5 mm steps, never over 10 mm', () => {
  for (const off of [-6, -9, 7]) {
    const { a } = analyseSim({ saddleOffsetMm: off });
    const r = TF.buildResults(a, PROFILE, 'hoods', null, 'metric').recommendation.current;
    if (!r || r.id !== 'saddleHeight') continue; // small offsets may land in range
    assert.ok(r.amount.hi <= 10 && r.amount.lo % 5 === 0 && r.amount.hi % 5 === 0, `${off} mm → ${r.amount.lo}–${r.amount.hi}`);
  }
});

test('a correctly set saddle gets no saddle-height change', () => {
  const { a } = analyseSim({});
  const r = TF.buildResults(a, PROFILE, 'hoods', null, 'metric').recommendation;
  assert.ok(!r.current || r.current.id !== 'saddleHeight', JSON.stringify(r.current));
});

test('a saddle far forward → move it back, after height is right', () => {
  const { a } = analyseSim({ setbackOffsetMm: -45 });
  const r = TF.buildResults(a, PROFILE, 'hoods', null, 'metric').recommendation;
  const step = [r.current, ...r.queued].find((s) => s && s.id === 'saddleSetback');
  assert.ok(step, `fore/aft step: ${JSON.stringify(r)}`);
  assert.equal(step.direction, 1, 'move back');
});

test('imperial output for adjustments uses sixteenths', () => {
  assert.equal(TF.inchFraction(6.35, 16), '1/4');
  assert.equal(TF.inchFraction(12.7, 16), '1/2');
  assert.equal(TF.inchFraction(25.4 * 1.0625, 16), '1 1/16');
  assert.equal(TF.fmtRange(5, 10, 'imperial'), '3/16–3/8 in');
  assert.equal(TF.fmtLength(172.5, 'metric', 'length'), '172.5 mm');
  assert.equal(TF.fmtLength(812, 'imperial', 'length'), '32.0 in');
  const { a } = analyseSim({ saddleOffsetMm: -15 });
  const r = TF.buildResults(a, PROFILE, 'hoods', null, 'imperial').recommendation.current;
  assert.match(r.text, /in, then retest\.$/);
});

test('section 7 / 15: all in range + moderate front-of-knee discomfort → "unlikely", no saddle change', () => {
  const { a } = analyseSim({});
  const discomfort = { regions: { kneeFront: { level: 'moderate', pattern: 'builds' } }, numbness: false, recentInjury: false };
  const res = TF.buildResults(a, PROFILE, 'hoods', discomfort, 'metric');
  const n = res.discomfortNotes.find((x) => x.region === 'kneeFront');
  assert.ok(n.inRange, n.text);
  assert.match(n.text, /unlikely to be the main factor/);
  assert.match(n.text, /Other common causes/);
  assert.doesNotMatch(n.text, /because|caused by|causes your/i);
  assert.ok(!res.recommendation.current || res.recommendation.current.id !== 'saddleHeight');
  assert.equal(res.gate.gated, false);
});

test('section 7: discomfort with a related measurement out of range is "associated", never "caused"', () => {
  const { a } = analyseSim({ saddleOffsetMm: -15 });
  const discomfort = { regions: { kneeFront: { level: 'mild', pattern: 'builds' } } };
  const res = TF.buildResults(a, PROFILE, 'hoods', discomfort, 'metric');
  const n = res.discomfortNotes[0];
  assert.match(n.text, /often associated with a low saddle/);
  assert.doesNotMatch(n.text, /because|caused by/i);
  assert.ok(res.highlighted.includes('kneeExtension'));
  assert.equal(res.gauges[0].metric, 'kneeExtension', 'flagged metric leads the dashboard');
});

test('section 7: severe, persisting, numbness or injury gate the advice', () => {
  assert.equal(TF.discomfortGate({ regions: { hands: { level: 'severe', pattern: 'builds' } } }).gated, true);
  assert.equal(TF.discomfortGate({ regions: { hands: { level: 'mild', pattern: 'persists' } } }).gated, true);
  assert.equal(TF.discomfortGate({ regions: {}, numbness: true }).gated, true);
  assert.equal(TF.discomfortGate({ regions: {}, recentInjury: true }).gated, true);
  assert.equal(TF.discomfortGate({ regions: { hands: { level: 'moderate', pattern: 'builds' } } }).gated, false);
  assert.equal(TF.discomfortGate(null).gated, false);
});

test('sides of the knee: not measurable from the side view, said plainly', () => {
  const { a } = analyseSim({});
  const n = TF.discomfortNotes({ regions: { kneeSides: { level: 'mild', pattern: 'new' } } }, a, TF.targetsFor(PROFILE, 'hoods'), 'metric')[0];
  assert.match(n.text, /front view/);
});

test('targets: bike, goal, hand position and flexibility shift the bands', () => {
  const road = TF.targetsFor(PROFILE, 'hoods');
  assert.deepEqual(road.kneeExtension.green, [140, 150]);
  assert.deepEqual(road.backAngle.green, [40, 50]);
  assert.deepEqual(TF.targetsFor(PROFILE, 'drops').backAngle.green, [35, 45]);
  assert.deepEqual(TF.targetsFor({ ...PROFILE, bikeType: 'gravel' }, 'hoods').backAngle.green, [43, 53]);
  assert.deepEqual(TF.targetsFor({ bikeType: 'tt', goal: 'race' }, 'aero').hipClosed.green, [40, 52]);
  assert.deepEqual(TF.targetsFor({ bikeType: 'tt', goal: 'race' }, 'aero').kops.green, [20, 80]);
  assert.deepEqual(TF.targetsFor({ ...PROFILE, flexibility: 'no' }, 'hoods').hipClosed.green, [65, 77]);
  assert.deepEqual(TF.targetsFor({ bikeType: 'cruiser', goal: 'upright' }, 'flats').kneeExtension.green, [135, 145]);
  assert.deepEqual(road.kneeExtension.yellow, [136, 154]);
  assert.equal(TF.classify(145, road.kneeExtension).status, 'green');
  assert.equal(TF.classify(138, road.kneeExtension).status, 'yellow');
  assert.equal(TF.classify(130, road.kneeExtension).status, 'red');
});

test('stroke counter: counts, cadence and stability from the foot height', () => {
  const sim = TF.simulateRider({ seconds: 10, fps: 30, cadence: 88 });
  const sc = new TF.StrokeCounter();
  let last = null;
  for (const f of sim.frames) { const e = sc.push(f.t, f.lm[TF.LM.left.toe][1]); if (e) last = e; }
  assert.ok(sc.count >= 13 && sc.count <= 15, `count ${sc.count}`);
  near(last.cadence, 88, 3, 'cadence');
  assert.equal(last.stable, true);
});

test('stroke counter: no strokes from a still rider', () => {
  const sc = new TF.StrokeCounter();
  for (let i = 0; i < 300; i++) sc.push(i / 30, 0.7 + Math.sin(i) * 0.0005);
  assert.equal(sc.count, 0);
});

test('capture quality: a hidden knee is named, with the share of frames', () => {
  const sim = TF.simulateRider({ seconds: 10 });
  const ok = TF.captureQuality(sim.frames, 14);
  assert.equal(ok.ok, true);
  const bad = sim.frames.map((f, i) => {
    if (i % 5 < 2) { const lm = f.lm.map((p) => p.slice()); lm[TF.LM.left.knee][2] = 0.1; return { t: f.t, lm }; }
    return f;
  });
  const q = TF.captureQuality(bad, 14);
  assert.equal(q.ok, false);
  assert.match(q.speech, /lost sight of your knee on 40 percent/);
  assert.equal(TF.captureQuality(sim.frames, 3).reason, 'strokes');
});

test('calibration frame: picked with the crank roughly level and forward', () => {
  const sim = TF.simulateRider({ seconds: 10 });
  const t = TF.pickCalibrationTime(sim.frames, sim.width, sim.height);
  const i = TF.nearestFrameIndex(sim.frames, t);
  const deg = ((sim.truth[i].phi * 180 / Math.PI % 360) + 360) % 360;
  const off = Math.min(deg, 360 - deg);
  assert.ok(off < 35, `crank ${deg.toFixed(0)}° from level-forward`);
});

test('fit file: new, migrate, merge (riders by id, sessions newest wins)', () => {
  const a = TF.newFitFile('Family');
  const r1 = TF.newRider('Todd'); a.riders.push(r1);
  const s1 = TF.newSession(r1); r1.sessions.push(s1);
  const b = JSON.parse(JSON.stringify(a));
  b.riders[0].sessions[0].note = 'newer'; b.riders[0].sessions[0].modified = '2999-01-01T00:00:00.000Z';
  const r2 = TF.newRider('Arthur'); r2.sessions.push(TF.newSession(r2)); b.riders.push(r2);
  b.someFutureField = { keep: true };
  const m = TF.mergeFiles(a, b);
  assert.equal(m.file.riders.length, 2);
  assert.equal(m.ridersAdded, 1);
  assert.equal(m.sessionsUpdated, 1);
  assert.equal(m.file.riders[0].sessions[0].note, 'newer');
  assert.deepEqual(m.file.someFutureField, { keep: true }, 'unknown fields preserved');
  assert.throws(() => TF.migrateFile({ format: 'something-else' }), /not a Tango Fitter file/);
  const mig = TF.migrateFile({ format: 'tango-fit', schema: 1, riders: [{ id: 'r', name: 'X', sessions: [{ id: 's' }] }], future: 1 });
  assert.equal(mig.future, 1);
  assert.deepEqual(mig.riders[0].sessions[0].clips, []);
});

test('sample fit: the simulated rider is in range everywhere it should be', () => {
  const { a } = analyseSim({});
  const res = TF.buildResults(a, PROFILE, 'hoods', null, 'metric');
  const g = Object.fromEntries(res.gauges.map((x) => [x.metric, x.status]));
  assert.equal(g.kneeExtension, 'green');
  assert.equal(g.backAngle, 'green');
});

test('sub-frame accuracy: KOPS steady and knee extension exact across cadences', () => {
  for (const cadence of [78, 86, 95]) {
    const { sim, a } = analyseSim({ cadence, seconds: 12, noisePx: 0.8, seed: 5 });
    assert.ok(a.metrics.kops.spread / 2 < 3, `KOPS spread ±${(a.metrics.kops.spread / 2).toFixed(1)} mm at ${cadence} rpm`);
    assert.equal(a.metrics.kops.confidence, 'high', `KOPS confidence at ${cadence} rpm`);
    near(a.metrics.kneeExtension.value, sim.truthSummary.kneeExtension, 1, `knee extension at ${cadence} rpm`);
  }
});

/* ==========================================================================
   2.0 Part A
   ========================================================================== */
const B8 = { crankLength: 172.5, wheel: '700x28' };
/** True KOPS exactly at crank level-forward: interpolate the simulator's truth across each 0° crossing. */
function trueKopsAtLevel(sim) {
  const tau = 2 * Math.PI, vals = [];
  for (let i = 1; i < sim.truth.length; i++) {
    const p0 = sim.truth[i - 1].phi, p1 = sim.truth[i].phi; // decreasing
    const k = Math.floor(p0 / tau) * tau; // the multiple of 2π just below p0
    if (p1 <= k && p0 > k) { const f = (p0 - k) / (p0 - p1); vals.push(sim.truth[i - 1].kops + (sim.truth[i].kops - sim.truth[i - 1].kops) * f); }
  }
  return TF.median(vals) + TF.CONFIG.targets.kopsKneeFrontOffsetMm;
}
const calOf = (marks, sim, extra) => Object.assign(TF.computeCalibration(marks, B8, sim.height, sim.width), extra || {});

test('A1: eight marks give the bike its own numbers, exactly, in the bike frame', () => {
  const sim = TF.simulateRider({});
  const cal = calOf(sim.marks, sim);
  assert.equal(cal.ok, true, JSON.stringify(cal.warnings));
  for (const k of Object.keys(TF.BIKE_MEASURES)) near(cal.bikeMeasures[k], sim.bikeTruth[k], k === 'effectiveSeatAngle' ? 0.2 : 1, k);
  assert.equal(TF.BIKE_MARKS.length, 8);
});

test('A1: bike measures are corrected for bike tilt (front low 3°)', () => {
  const sim = TF.simulateRider({});
  const t = -3 * Math.PI / 180, bb = sim.marks.bb;
  // Rotate every mark about the bottom bracket in the image (y down): a front-low bike.
  const rot = (p) => { const dx = p.x - bb.x, dy = p.y - bb.y; return { x: bb.x + dx * Math.cos(t) + dy * Math.sin(t), y: bb.y - dx * Math.sin(t) + dy * Math.cos(t) }; };
  const tilted = Object.fromEntries(Object.entries(sim.marks).map(([k, p]) => [k, rot(p)]));
  const cal = calOf(tilted, sim);
  near(cal.tiltDeg, -3, 0.05, 'tilt');
  for (const k of ['saddleHeight', 'saddleSetback', 'drop', 'reach']) near(cal.bikeMeasures[k], sim.bikeTruth[k], 1, k);
});

test('A1: six Beta 1 taps still calibrate, with no bike numbers', () => {
  const sim = TF.simulateRider({});
  const cal = calOf(sim.taps, sim);
  assert.equal(cal.ok, true);
  assert.equal(cal.bikeMeasures, null);
});

test('A1: distance hint from the wheel size against the silhouette', () => {
  const sim = TF.simulateRider({});
  const good = calOf(sim.marks, sim).distance;
  assert.equal(good.distance, 'good');
  assert.ok(good.metres > 2.2 && good.metres < 3.0, `about ${good.metres.toFixed(2)} m`);
  assert.match(good.text, /^Distance is good \(about \d\.\d m\)\.$/);
  const near1 = TF.simulateRider({ pxPerMm: 0.5, bbPx: { x: 600, y: 500 } });
  assert.equal(calOf(near1.marks, near1).distance.distance, 'further');
  const far1 = TF.simulateRider({ pxPerMm: 0.26 });
  assert.equal(calOf(far1.marks, far1).distance.distance, 'closer');
  const off = TF.simulateRider({ bbPx: { x: 820, y: 540 } });
  assert.equal(calOf(off.marks, off).distance.centre, 'right');
});

test('A1: compareMarks reports the saddle change, and when the camera moved', () => {
  const a = TF.simulateRider({}), b = TF.simulateRider({ saddleOffsetMm: 9 });
  const c = TF.compareMarks(calOf(a.marks, a), calOf(b.marks, b));
  assert.equal(c.cameraMoved, false);
  near(c.changes.saddleHeight, 9, 1, 'saddle height change');
  near(c.changes.drop, 9 * Math.sin(73.5 * Math.PI / 180), 1, 'drop follows the saddle up the seat tube');
  const moved = TF.simulateRider({ saddleOffsetMm: 9, bbPx: { x: 600, y: 540 } });
  const c2 = TF.compareMarks(calOf(a.marks, a), calOf(moved.marks, moved));
  assert.equal(c2.cameraMoved, true);
  near(c2.changes.saddleHeight, 9, 1.5, 'measured change still right when the camera moved');
});

test('A2: the pedal is followed from the ride alone (empty-bike marks)', () => {
  for (const cadence of [78, 90]) {
    const sim = TF.simulateRider({ cadence, seconds: 12 });
    const cal = calOf(sim.marks, sim, { markedWithRider: false });
    const a = TF.analyseClip({ width: sim.width, height: sim.height, frames: sim.frames, calibration: cal });
    assert.equal(a.phaseSource, 'crank');
    assert.equal(cal.spindleFit.ok, true);
    assert.equal(cal.spindleFit.source, 'fit');
    near(cal.footSpindle.a, sim.footSpindleTruth.a, 0.05, 'a (foot lengths)');
    near(cal.footSpindle.b, sim.footSpindleTruth.b, 0.05, 'b (foot lengths)');
    near(a.metrics.kops.value, trueKopsAtLevel(sim), 5, `KOPS at ${cadence} rpm`);
  }
});

test('A2: a spindle mark made with the rider on starts and steadies the fit', () => {
  const sim = TF.simulateRider({});
  const cal = calOf(sim.marksWithRider, sim, { markedWithRider: true, calT: sim.calT });
  const a = TF.analyseClip({ width: sim.width, height: sim.height, frames: sim.frames, calibration: cal });
  assert.equal(cal.spindleFit.source, 'fit+mark');
  near(cal.footSpindle.a, sim.footSpindleTruth.a, 0.05, 'a');
  near(cal.footSpindle.b, sim.footSpindleTruth.b, 0.05, 'b');
  assert.equal(a.metrics.kops.confidence, 'high');
});

test('A2: without a mark, the fit starts from the pedal-forward frame and converges', () => {
  const sim = TF.simulateRider({});
  const sm = TF.smoothSide(sim.frames, 'left', sim.width, sim.height);
  const crankPx = TF.dist(sim.marks.bb, sim.marks.spindle);
  const fit = TF.fitFootSpindle(sm.map((f) => ({ heel: f.j.heel, toe: f.j.toe })), sim.marks.bb, crankPx, { facing: 1 });
  assert.equal(fit.ok, true);
  near(fit.rel.a, sim.footSpindleTruth.a, 0.05, 'a');
  near(fit.rel.b, sim.footSpindleTruth.b, 0.05, 'b');
  assert.ok(fit.residual < 0.03, `residual ${(fit.residual * 100).toFixed(1)}%`);
});

test('A2: falls back cleanly to the foot path when heel and toe are hidden', () => {
  const sim = TF.simulateRider({});
  const frames = sim.frames.map((f) => { const lm = f.lm.map((p) => p.slice()); for (const j of ['heel', 'toe']) lm[TF.LM.left[j]][2] = 0.05; return { t: f.t, lm }; });
  const cal = calOf(sim.marks, sim, { markedWithRider: false });
  const a = TF.analyseClip({ width: sim.width, height: sim.height, frames, calibration: cal });
  assert.equal(cal.spindleFit.ok, false);
  assert.equal(cal.footSpindle, null);
  assert.equal(a.phaseSource, 'foot');
  assert.equal(a.metrics.kops.confidence, 'none');
  assert.ok(a.notes.length, 'a note says why');
});

test('A2: a stored relation is reused, so a session reads the same every time', () => {
  const sim = TF.simulateRider({});
  const cal = calOf(sim.marks, sim, { markedWithRider: false });
  const a1 = TF.analyseClip({ width: sim.width, height: sim.height, frames: sim.frames, calibration: cal });
  const stored = JSON.parse(JSON.stringify(cal));
  const a2 = TF.analyseClip({ width: sim.width, height: sim.height, frames: sim.frames, calibration: stored });
  assert.equal(a2.metrics.kops.value, a1.metrics.kops.value);
});

/* A3: history. Build a history entry from a simulated session with its marks. */
function sessionAt(offset, history) {
  const sim = TF.simulateRider({ saddleOffsetMm: offset });
  const cal = calOf(sim.marks, sim, { markedWithRider: false });
  const a = TF.analyseClip({ width: sim.width, height: sim.height, frames: sim.frames, calibration: cal });
  const res = TF.buildResults(a, PROFILE, 'hoods', null, 'metric', { history: history || [], bikeMeasures: cal.bikeMeasures });
  return { res, entry: TF.historyEntry(res, cal.bikeMeasures, new Date().toISOString()) };
}

test('A3: suggestion made, still low → "One more step", with the measured change', () => {
  const s1 = sessionAt(-25);
  assert.equal(s1.res.recommendation.current.text, 'Raise the saddle 10 mm, then retest.');
  const s2 = sessionAt(-15, [s1.entry]);
  const r = s2.res.recommendation.current;
  assert.equal(r.history.status, 'progress');
  assert.match(r.text, /^One more step: raise the saddle (\d+–)?\d+ mm, then retest\.$/);
  assert.match(r.why, /^Your knee extension went from \d+° to \d+° after raising the saddle 10 mm, and is still below the target range of 140–150°\.$/);
});

test('A3: suggestion not made → says so; does not present the advice as new', () => {
  const s1 = sessionAt(-25);
  const s2 = sessionAt(-25, [s1.entry]);
  const r = s2.res.recommendation.current;
  assert.equal(r.history.status, 'notMade');
  assert.match(r.text, /^Still to do: raise the saddle 10 mm, then retest\.$/);
  assert.match(r.why, /^The marks show the saddle height hasn't changed since your last session/);
});

test('A3: the other way → says what the marks show', () => {
  const s1 = sessionAt(-15);
  const s2 = sessionAt(-21, [s1.entry]);
  const r = s2.res.recommendation.current;
  assert.equal(r.history.status, 'different');
  assert.match(r.why, /^The marks show the saddle was lowered 6 mm since your last session; the suggestion was to raise the saddle 10 mm\./);
});

test('A3: three sessions out of range despite changes → see a professional', () => {
  // The saddle was raised 10 mm twice (measured), yet the knee is still low: a rider the advice is not helping.
  const now = sessionAt(-25);
  const S = now.entry.bikeMeasures.saddleHeight;
  const raise10 = { id: 'saddleHeight', metric: 'kneeExtension', direction: 1, amount: { lo: 10, hi: 10 } };
  const h1 = { current: raise10, metrics: { kneeExtension: 134 }, bikeMeasures: Object.assign({}, now.entry.bikeMeasures, { saddleHeight: S - 20 }) };
  const h2 = { current: raise10, metrics: { kneeExtension: 135 }, bikeMeasures: Object.assign({}, now.entry.bikeMeasures, { saddleHeight: S - 10 }) };
  const r = sessionAt(-25, [h1, h2]).res.recommendation.current;
  assert.equal(r.id, 'seePro', JSON.stringify(r));
  assert.equal(r.text, 'See a professional fitter before changing the saddle height again.');
  assert.match(r.why, /below the target range for 3 sessions in a row, even though the saddle was raised each time \(10 mm, then 10 mm\)/);
  // Only two sessions: still advice, not a referral.
  assert.equal(sessionAt(-25, [h2]).res.recommendation.current.id, 'saddleHeight');
  // A round where the change was not made breaks the chain.
  const h1b = Object.assign({}, h1, { bikeMeasures: Object.assign({}, h1.bikeMeasures, { saddleHeight: S - 10 }) });
  assert.equal(sessionAt(-25, [h1b, h2]).res.recommendation.current.id, 'saddleHeight');
});

test('A3: without marks on both sessions the advice is unchanged', () => {
  const s1 = sessionAt(-25);
  const entry = Object.assign({}, s1.entry, { bikeMeasures: null });
  const s2 = sessionAt(-25, [entry]);
  assert.equal(s2.res.recommendation.current.text, 'Raise the saddle 10 mm, then retest.');
  assert.equal(s2.res.recommendation.current.history, undefined);
});

test('A4: riderPresent — the simulated rider yes, an empty frame no, a person beside the bike no', () => {
  const sim = TF.simulateRider({});
  const f = sim.frames[10].lm;
  assert.equal(TF.riderPresent(f), true);
  assert.equal(TF.riderPresent(f, sim.marks, sim.width, sim.height), true);
  assert.equal(TF.riderPresent(null, sim.marks, sim.width, sim.height), false);
  // Someone standing in front of the bike: hip ahead of the front axle.
  const beside = f.map((p) => [p[0] + 0.45, p[1], p[2]]);
  assert.equal(TF.riderPresent(beside, sim.marks, sim.width, sim.height), false);
  // Joints barely seen: not present.
  const faint = f.map((p) => [p[0], p[1], 0.2]);
  assert.equal(TF.riderPresent(faint), false);
});

test('A4: head and feet cut off are reported; feet cut is a retake, head cut a warning', () => {
  const sim = TF.simulateRider({ seconds: 10 });
  assert.deepEqual([TF.framingCheck(sim.frames[0].lm).headCut, TF.framingCheck(sim.frames[0].lm).feetCut], [false, false]);
  const up = (dy) => sim.frames.map((f) => ({ t: f.t, lm: f.lm.map((p) => [p[0], p[1] + dy, p[2]]) }));
  const headCut = up(-0.1); // everything 10% higher: the nose leaves the top
  assert.equal(TF.framingCheck(headCut[0].lm).headCut, true);
  const qh = TF.captureQuality(headCut, 14);
  if (qh.ok) assert.equal(qh.warnings[0].code, 'headCut');
  const feetCut = up(0.18); // everything lower: the feet leave the bottom at the bottom of each stroke
  const low = feetCut.reduce((b, f) => (f.lm[TF.LM.left.toe][1] > b.lm[TF.LM.left.toe][1] ? f : b));
  assert.equal(TF.framingCheck(low.lm).feetCut, true);
  const qf = TF.captureQuality(feetCut, 14);
  assert.equal(qf.ok, false);
  assert.equal(qf.reason, 'feetCut');
  assert.match(qf.speech, /^Your feet were cut off at the bottom of the frame on \d+ percent of the frames\. The camera needs to be further back or a little higher\.$/);
});

test('A5: schema 2 — new sessions carry the new fields; schema 1 files move forward', () => {
  const r = TF.newRider('T'); const s = TF.newSession(r);
  for (const k of ['marks', 'bikeMeasures', 'markedWithRider', 'secondClip']) assert.ok(k in s, k);
  assert.deepEqual(s.replies, []);
  assert.equal(TF.newFitFile().schema, 2);
  const old = { format: 'tango-fit', schema: 1, riders: [{ id: 'r', name: 'X', sessions: [{ id: 's', clips: [{ calibration: { taps: { bb: { x: 1, y: 2 } } } }] }, { id: 's2', clips: [] }] }] };
  const m = TF.migrateFile(old);
  assert.equal(m.schema, 2);
  assert.deepEqual(m.riders[0].sessions[0].marks, { bb: { x: 1, y: 2 } });
  assert.equal(m.riders[0].sessions[0].markedWithRider, true);
  assert.equal(m.riders[0].sessions[0].bikeMeasures, null);
  assert.equal(m.riders[0].sessions[1].marks, null);
  assert.deepEqual(m.riders[0].sessions[1].replies, []);
  const newer = TF.migrateFile({ format: 'tango-fit', schema: 9, riders: [] });
  assert.equal(newer.schema, 9, 'a newer file keeps its schema');
});
