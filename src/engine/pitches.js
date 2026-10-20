// Pitch catalogue, pitcher generator and pitch generator.
// Values are typical for MLB right-handers; a pitcher's own fastball velocity
// scales the others. moveDeg = direction of spin-induced movement measured from
// straight up, positive toward the pitcher's arm side.
import { MPH, RPM, DEG, IN, RUBBER_Y, PLATE_FRONT_Y, moundHeightAt } from './units.js';
import { simulate, crossingAt, aim, spinVector, vec, stateAt } from './physics.js';

export const PITCH_TYPES = {
  FF: { key: 'FF', mph: 94.0, rpm: 2300, eff: 0.92, moveDeg: 27, family: 'fastball', gyro: 1, seam: 4 },
  SI: { key: 'SI', mph: 93.3, rpm: 2150, eff: 0.90, moveDeg: 62, family: 'fastball', gyro: 1, seam: 2 },
  FC: { key: 'FC', mph: 89.0, rpm: 2400, eff: 0.36, moveDeg: -18, family: 'breaking', gyro: -1, seam: 4 },
  SL: { key: 'SL', mph: 85.0, rpm: 2450, eff: 0.22, moveDeg: -80, family: 'breaking', gyro: -1, seam: 4 },
  ST: { key: 'ST', mph: 82.0, rpm: 2600, eff: 0.62, moveDeg: -86, family: 'breaking', gyro: -1, seam: 2 },
  CU: { key: 'CU', mph: 79.0, rpm: 2550, eff: 0.66, moveDeg: -138, family: 'breaking', gyro: -1, seam: 4 },
  CH: { key: 'CH', mph: 85.5, rpm: 1750, eff: 0.90, moveDeg: 66, family: 'offspeed', gyro: 1, seam: 2 },
  FS: { key: 'FS', mph: 86.0, rpm: 1350, eff: 0.80, moveDeg: 73, family: 'offspeed', gyro: 1, seam: 2 },
};
export const PITCH_KEYS = Object.keys(PITCH_TYPES);

export const ARM_SLOTS = { over: 65, threeQuarter: 40, low: 25, side: 10 };

// Level → typical fastball velocity range (mph).
export const LEVEL_VELO = { youth: [55, 70], hs: [70, 86], college: [80, 93], pro: [88, 100] };

// World x-direction of the pitcher's arm side (catcher's view).
export const armSideX = (hand) => (hand === 'L' ? 1 : -1);

// A pitcher: handedness, arm slot, release point, extension and fastball velocity.
export function makePitcher({ hand = 'R', slot = 'threeQuarter', fbMph = 90, rng, rubberShift = 0, extension = 6.3 } = {}) {
  const slotDeg = typeof slot === 'number' ? slot : ARM_SLOTS[slot] ?? 40;
  const s = Math.sin(slotDeg * DEG), c = Math.cos(slotDeg * DEG);
  const arm = 1.8; // effective shoulder-to-ball distance at release
  const sx = armSideX(hand);
  const shoulderX = sx * (0.6 + (1 - s) * 0.5);
  const shoulderZ = 4.85 - (1 - s) * 0.6;
  const relY = RUBBER_Y - extension;
  const ground = moundHeightAt(relY);
  return {
    hand, slotDeg, fbMph, extension, rubberShift,
    shoulder: [rubberShift + shoulderX, relY, ground + shoulderZ],
    release: [rubberShift + shoulderX + sx * arm * c, relY, ground + shoulderZ + arm * s],
    jitter: rng ? { x: rng.normal(0, 0.02), z: rng.normal(0, 0.02) } : { x: 0, z: 0 },
  };
}

// Movement direction adjusted for arm slot: lower slots flatten movement toward
// horizontal, higher slots make it more vertical.
export function slotAdjustedMoveDeg(baseDeg, slotDeg) {
  const target = baseDeg >= 0 ? 90 : -90;
  const k = 0.8 * ((40 - slotDeg) / 90);
  if (Math.abs(baseDeg) > 90) {
    // Curveballs: lower slots move them toward horizontal too.
    return baseDeg + (target - baseDeg) * k * 0.6;
  }
  return Math.max(-175, Math.min(175, baseDeg + (target - baseDeg) * k));
}

export function moveDirWorld(moveDeg, hand) {
  return [armSideX(hand) * Math.sin(moveDeg * DEG), 0, Math.cos(moveDeg * DEG)];
}

// Clock-face direction (as the hitter/catcher sees it) of the spin-induced movement.
export function movementClock(moveDeg, hand) {
  // 12 = up, 3 = toward first base (catcher's right).
  const ang = Math.atan2(armSideX(hand) * Math.sin(moveDeg * DEG), Math.cos(moveDeg * DEG)) / DEG; // + toward 1B
  let hours = (ang / 30 + 12) % 12;
  if (hours < 0) hours += 12;
  const hh = Math.floor(hours) || 12;
  const mm = Math.round((hours - Math.floor(hours)) * 60 / 15) * 15;
  return mm === 60 ? `${(hh % 12) + 1}:00` : `${hh}:${String(mm).padStart(2, '0')}`;
}

// Release-point "tell" per pitch family (ft): breaking balls often come out a little
// higher and more on top. Deception removes it.
const RELEASE_TELL = { fastball: [0, 0], breaking: [-0.08, 0.14], offspeed: [0.03, -0.05] };

/**
 * Generates a fully simulated pitch.
 * opts: { pitcher, type, target: {x, z} at plate front | tunnel: {x, y, z},
 *         rng, mphOverride, deception (0..1), noise (bool) }
 */
export function generatePitch({ pitcher, type, target, tunnel, rng, mphOverride, deception = 0, noise = true }) {
  const pt = PITCH_TYPES[type];
  if (!pt) throw new Error(`unknown pitch type ${type}`);
  const r = rng || { normal: () => 0 };
  const n = (sd) => (noise ? r.normal(0, sd) : 0);
  const mph = mphOverride ?? (pitcher.fbMph * pt.mph) / PITCH_TYPES.FF.mph + n(0.7);
  const rpm = pt.rpm * (0.85 + 0.15 * Math.min(1, pitcher.fbMph / 94)) + n(50);
  const eff = Math.max(0.05, Math.min(1, pt.eff + n(0.03)));
  const moveDeg = slotAdjustedMoveDeg(pt.moveDeg, pitcher.slotDeg) + n(3);
  const tell = RELEASE_TELL[pt.family].map((v) => v * (1 - deception));
  const sx = armSideX(pitcher.hand);
  const p0 = [
    pitcher.release[0] + pitcher.jitter.x + sx * tell[0] + n(0.03),
    pitcher.release[1],
    pitcher.release[2] + pitcher.jitter.z + tell[1] + n(0.03),
  ];
  const md = moveDirWorld(moveDeg, pitcher.hand);
  // Spin is an axial vector: mirroring a pitcher also mirrors the gyro rotation sense.
  const gyroSign = pt.gyro * (pitcher.hand === 'L' ? -1 : 1);
  const spinFor = (vHat) => spinVector(vHat, md, rpm * RPM, eff, gyroSign);
  const aimAt = tunnel || { x: target.x, y: PLATE_FRONT_Y, z: target.z };
  const shot = aim({ p0, speed: mph * MPH, spinFor, target: aimAt });
  const plate = crossingAt(shot.traj, PLATE_FRONT_Y);
  // Spin-free comparison trajectory: induced break = difference at the plate.
  const flat = simulate({ p0, v0: shot.v0, spin: [0, 0, 0] }, { yStop: PLATE_FRONT_Y - 0.5 });
  const flatPlate = crossingAt(flat, PLATE_FRONT_Y);
  return {
    type, hand: pitcher.hand, slotDeg: pitcher.slotDeg, pitcher,
    mph, rpm, eff, moveDeg, gyroSign, seam: pt.seam,
    clock: movementClock(moveDeg, pitcher.hand),
    p0, v0: shot.v0, spin: shot.spin,
    traj: shot.traj,
    plate, // {t, x, z, ...} at the front of the plate
    flightMs: plate.t * 1000,
    plateMph: Math.hypot(plate.vx, plate.vy, plate.vz) / MPH,
    ivbIn: (plate.z - flatPlate.z) / IN, // induced vertical break, inches
    hbIn: (plate.x - flatPlate.x) / IN, // horizontal break, inches (+ toward 1B)
    armSideBreakIn: ((plate.x - flatPlate.x) / IN) * sx,
    aimed: aimAt,
  };
}

// Plain-JSON description of a pitch for trial logs (trajectory can be regenerated).
export function pitchRecord(p) {
  const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000);
  return {
    type: p.type, hand: p.hand, slotDeg: p.slotDeg, mph: +p.mph.toFixed(1), rpm: Math.round(p.rpm), eff: +p.eff.toFixed(2),
    moveDeg: +p.moveDeg.toFixed(1), p0: r3(p.p0), v0: r3(p.v0), spin: r3(p.spin),
    plateX: +p.plate.x.toFixed(3), plateZ: +p.plate.z.toFixed(3), flightMs: Math.round(p.flightMs),
    ivbIn: +p.ivbIn.toFixed(1), hbIn: +p.hbIn.toFixed(1),
  };
}

// Distance from release (ft along y) where two pitches separate by more than `sepFt`.
export function divergenceDistance(a, b, sepFt = 2.9 * IN) {
  const y0 = Math.min(a.p0[1], b.p0[1]);
  for (let d = 0; d <= y0 - PLATE_FRONT_Y; d += 0.25) {
    const y = y0 - d;
    const ca = crossingAt(a.traj, y), cb = crossingAt(b.traj, y);
    if (!ca || !cb) break;
    if (Math.hypot(ca.x - cb.x, ca.z - cb.z) > sepFt) return { fromRelease: d, toPlate: y - PLATE_FRONT_Y, y };
  }
  return { fromRelease: y0 - PLATE_FRONT_Y, toPlate: 0, y: PLATE_FRONT_Y };
}

export { stateAt, vec };
