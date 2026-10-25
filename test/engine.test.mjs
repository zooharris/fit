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

test('section 15: saddle 15 mm too low → raise, 10–25 mm', () => {
  const { a } = analyseSim({ saddleOffsetMm: -15 });
  const res = TF.buildResults(a, PROFILE, 'hoods', null, 'metric');
  const r = res.recommendation.current;
  assert.ok(r, 'a recommendation');
  assert.equal(r.id, 'saddleHeight');
  assert.equal(r.direction, 1, 'raise');
  const mid = (r.amount.lo + r.amount.hi) / 2;
  assert.ok(mid >= 10 && mid <= 25, `range ${r.amount.lo}–${r.amount.hi}`);
  assert.match(r.text, /^Raise the saddle \d+–\d+ mm, then retest\.$/);
});

test('section 15: saddle 15 mm too high → lower, 10–25 mm', () => {
  const { a } = analyseSim({ saddleOffsetMm: 15 });
  const r = TF.buildResults(a, PROFILE, 'hoods', null, 'metric').recommendation.current;
  assert.equal(r.id, 'saddleHeight');
  assert.equal(r.direction, -1, 'lower');
  const mid = (r.amount.lo + r.amount.hi) / 2;
  assert.ok(mid >= 10 && mid <= 25, `range ${r.amount.lo}–${r.amount.hi}`);
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
