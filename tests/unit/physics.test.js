import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, crossingAt, stateAt, aim, spinVector, liftCoefficient, timeAtDistanceFromRelease } from '../../src/engine/physics.js';
import { makePitcher, generatePitch, PITCH_KEYS, movementClock, divergenceDistance, armSideX } from '../../src/engine/pitches.js';
import { MPH, RPM, G, PLATE_FRONT_Y, IN } from '../../src/engine/units.js';
import { makeRng } from '../../src/engine/rng.js';

const pitcherR = makePitcher({ hand: 'R', slot: 'threeQuarter', fbMph: 95 });
const pitcherL = makePitcher({ hand: 'L', slot: 'threeQuarter', fbMph: 95 });
const mid = { x: 0, z: 2.5 };

test('95 mph fastball reaches the plate in about 0.4 s', () => {
  const p = generatePitch({ pitcher: pitcherR, type: 'FF', target: mid, noise: false, mphOverride: 95 });
  assert.ok(p.flightMs > 380 && p.flightMs < 420, `flight ${p.flightMs}`);
});

test('time to plate scales with velocity', () => {
  const t = (mph) => generatePitch({ pitcher: pitcherR, type: 'FF', target: mid, noise: false, mphOverride: mph }).flightMs;
  const t70 = t(70), t85 = t(85), t100 = t(100);
  assert.ok(t70 > t85 && t85 > t100);
  assert.ok(t70 > 520 && t70 < 590, `70 mph: ${t70}`);
  assert.ok(t100 > 360 && t100 < 395, `100 mph: ${t100}`);
});

test('gravity-only flight matches the closed-form drop', () => {
  const v0 = [0, -100, 0];
  const traj = simulate({ p0: [0, 50, 6], v0, spin: [0, 0, 0] }, { drag: false, magnus: false, yStop: 0 });
  const c = crossingAt(traj, 0);
  assert.ok(Math.abs(c.t - 0.5) < 1e-3);
  assert.ok(Math.abs(c.z - (6 - 0.5 * G * 0.25)) < 1e-3);
});

test('drag slows a 95 mph pitch by roughly 8–10 % by the plate', () => {
  const p = generatePitch({ pitcher: pitcherR, type: 'FF', target: mid, noise: false, mphOverride: 95 });
  const loss = 1 - p.plateMph / p.mph;
  assert.ok(loss > 0.07 && loss < 0.11, `speed loss ${loss}`);
});

test('aim solver hits the target within a quarter inch', () => {
  const rng = makeRng(7);
  for (const type of PITCH_KEYS) {
    const target = { x: rng.range(-1.2, 1.2), z: rng.range(1.2, 4) };
    const p = generatePitch({ pitcher: pitcherR, type, target, rng });
    const err = Math.hypot(p.plate.x - target.x, p.plate.z - target.z) / IN;
    assert.ok(err < 0.25, `${type} miss ${err} in`);
  }
});

test('break directions: rise, sink, glove side and arm side (RHP)', () => {
  const g = (type) => generatePitch({ pitcher: pitcherR, type, target: mid, noise: false });
  const ff = g('FF'), si = g('SI'), sl = g('SL'), st = g('ST'), cu = g('CU'), ch = g('CH'), fs = g('FS'), fc = g('FC');
  assert.ok(ff.ivbIn > 12 && ff.ivbIn < 20, `FF IVB ${ff.ivbIn}`); // backspin "rise"
  assert.ok(ff.armSideBreakIn > 3, 'FF runs arm side');
  assert.ok(si.armSideBreakIn > ff.armSideBreakIn && si.ivbIn < ff.ivbIn, 'sinker: more run, less rise');
  assert.ok(cu.ivbIn < -6, `curveball drops more than gravity alone (${cu.ivbIn})`);
  assert.ok(sl.armSideBreakIn < -3 && st.armSideBreakIn < sl.armSideBreakIn, 'slider/sweeper break glove side, sweeper more');
  assert.ok(st.armSideBreakIn < -12, `sweeper sweeps (${st.armSideBreakIn})`);
  assert.ok(ch.ivbIn < ff.ivbIn && ch.armSideBreakIn > 8, 'changeup fades arm side with less rise');
  assert.ok(fs.ivbIn < ch.ivbIn, 'splitter drops more than changeup');
  assert.ok(fc.armSideBreakIn < 0 && fc.armSideBreakIn > sl.armSideBreakIn, 'cutter: small glove-side break');
  // RHP arm side is the third-base side (−x).
  assert.ok(ff.hbIn < 0 && sl.hbIn > 0);
});

test('left-handed pitches mirror right-handed ones', () => {
  for (const type of ['FF', 'SL', 'CH', 'CU']) {
    const r = generatePitch({ pitcher: pitcherR, type, target: mid, noise: false });
    const l = generatePitch({ pitcher: pitcherL, type, target: mid, noise: false });
    assert.ok(Math.abs(r.hbIn + l.hbIn) < 0.3, `${type} hb ${r.hbIn} vs ${l.hbIn}`);
    assert.ok(Math.abs(r.ivbIn - l.ivbIn) < 0.3);
  }
  assert.equal(armSideX('R'), -1);
});

test('pure gyro spin adds almost no movement (only as gravity bends the path)', () => {
  const vHat = [0, -1, 0];
  const w = spinVector(vHat, [0, 0, 1], 2400 * RPM, 0, 1);
  const traj = simulate({ p0: [0, 54, 6], v0: [0, -130, 0], spin: w });
  const flat = simulate({ p0: [0, 54, 6], v0: [0, -130, 0], spin: [0, 0, 0] });
  const a = crossingAt(traj, PLATE_FRONT_Y), b = crossingAt(flat, PLATE_FRONT_Y);
  const moveIn = Math.hypot(a.z - b.z, a.x - b.x) / IN;
  assert.ok(moveIn < 2, `gyro movement ${moveIn} in`);
  const full = simulate({ p0: [0, 54, 6], v0: [0, -130, 0], spin: spinVector(vHat, [1, 0, 0], 2400 * RPM, 1) });
  assert.ok(Math.abs(crossingAt(full, PLATE_FRONT_Y).x - b.x) / IN > 10 * moveIn);
});

test('backspin vector points the Magnus force up', () => {
  const w = spinVector([0, -1, 0], [0, 0, 1], 2300 * RPM, 1);
  const traj = simulate({ p0: [0, 54, 6], v0: [0, -137, 0], spin: w });
  const flat = simulate({ p0: [0, 54, 6], v0: [0, -137, 0], spin: [0, 0, 0] });
  assert.ok(crossingAt(traj, 1).z > crossingAt(flat, 1).z + 0.8);
  assert.ok(liftCoefficient(0.2) > liftCoefficient(0.1) && liftCoefficient(0) === 0);
});

test('stateAt interpolates and time-at-distance is monotonic', () => {
  const p = generatePitch({ pitcher: pitcherR, type: 'FF', target: mid, noise: false });
  const s = stateAt(p.traj, p.plate.t);
  assert.ok(Math.abs(s.y - PLATE_FRONT_Y) < 0.2);
  const t10 = timeAtDistanceFromRelease(p.traj, 10), t30 = timeAtDistanceFromRelease(p.traj, 30);
  assert.ok(t10 > 0 && t30 > t10 && t30 < p.plate.t);
});

test('tunnelled pitches share the tunnel point then diverge', () => {
  const ff = generatePitch({ pitcher: pitcherR, type: 'FF', target: { x: 0.3, z: 3.0 }, noise: false });
  const tunnelY = 25;
  const at = crossingAt(ff.traj, tunnelY);
  const ch = generatePitch({ pitcher: pitcherR, type: 'CH', tunnel: { x: at.x, y: tunnelY, z: at.z }, noise: false, deception: 1 });
  const chAt = crossingAt(ch.traj, tunnelY);
  assert.ok(Math.hypot(chAt.x - at.x, chAt.z - at.z) < 0.01);
  const plateSep = Math.hypot(ch.plate.x - ff.plate.x, ch.plate.z - ff.plate.z) / IN;
  assert.ok(plateSep > 5, `pitches separate at the plate (${plateSep} in)`);
  const d = divergenceDistance(ff, ch);
  assert.ok(d.toPlate > 0 && d.toPlate < 40);
});

test('movement clock reads as the hitter sees it', () => {
  assert.equal(movementClock(0, 'R'), '12:00');
  assert.equal(movementClock(90, 'R'), '9:00'); // RHP arm side = 3B side = hitter's view left
  assert.equal(movementClock(90, 'L'), '3:00');
  assert.equal(movementClock(180, 'R'), '6:00');
});

test('pitch generation is fast enough for real-time use', () => {
  const t0 = performance.now();
  const rng = makeRng(3);
  for (let i = 0; i < 20; i++) generatePitch({ pitcher: pitcherR, type: rng.pick(PITCH_KEYS), target: mid, rng });
  const per = (performance.now() - t0) / 20;
  assert.ok(per < 60, `${per} ms per pitch`);
});
