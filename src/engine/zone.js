// Strike zone geometry, edge distances, regions and target sampling.
import { BALL_RADIUS, PLATE_HALF_WIDTH, IN } from './units.js';

// Zone from batter height (inches). Approximates the rulebook zone in a stance.
export function strikeZone(heightIn = 72) {
  const hFt = heightIn / 12;
  return { left: -PLATE_HALF_WIDTH, right: PLATE_HALF_WIDTH, bottom: +(hFt * 0.27).toFixed(3), top: +(hFt * 0.565).toFixed(3) };
}

// A pitch is a strike if any part of the ball touches the zone (at the plate front).
export function isStrike(x, z, zone) {
  return Math.abs(x) <= zone.right + BALL_RADIUS && z >= zone.bottom - BALL_RADIUS && z <= zone.top + BALL_RADIUS;
}

// Signed distance (inches) from the strike/ball boundary: + inside (strike), − outside.
export function edgeDistanceIn(x, z, zone) {
  const L = zone.left - BALL_RADIUS, R = zone.right + BALL_RADIUS, B = zone.bottom - BALL_RADIUS, T = zone.top + BALL_RADIUS;
  if (x >= L && x <= R && z >= B && z <= T) return Math.min(x - L, R - x, z - B, T - z) / IN;
  const dx = Math.max(L - x, 0, x - R), dz = Math.max(B - z, 0, z - T);
  return -Math.hypot(dx, dz) / IN;
}

// Region labels: 1–9 = 3×3 grid inside the zone (row 1 = top, column 1 = catcher's left),
// 11 = up/left, 12 = up/right, 13 = down/left, 14 = down/right (outside).
export function zoneRegion(x, z, zone) {
  if (isStrike(x, z, zone)) {
    const w = (zone.right - zone.left) / 3, hh = (zone.top - zone.bottom) / 3;
    const col = Math.min(2, Math.max(0, Math.floor((x - zone.left) / w)));
    const row = Math.min(2, Math.max(0, Math.floor((zone.top - z) / hh)));
    return row * 3 + col + 1;
  }
  const midZ = (zone.top + zone.bottom) / 2;
  const up = z >= midZ, left = x < 0;
  return up ? (left ? 11 : 12) : (left ? 13 : 14);
}

// Inside/outside relative to a hitter: "in" is the side the batter stands on.
export function horizontalSide(x, bats) {
  const batterX = bats === 'L' ? 1 : -1; // RHB stands on the 3B side (−x)
  return Math.sign(x) === batterX ? 'in' : 'away';
}

/**
 * Samples a plate location.
 *  strike: true/false; edgeMin/edgeMax: inches from the boundary (always ≥ 0, measured
 *  inward for strikes and outward for balls). Balls never land more than maxOutIn away.
 */
export function sampleLocation(rng, zone, { strike, edgeMin = 0, edgeMax = 12, maxOutIn = 14 } = {}) {
  const midZ = (zone.top + zone.bottom) / 2;
  const maxIn = Math.min(zone.right + BALL_RADIUS, (zone.top - zone.bottom) / 2 + BALL_RADIUS) / IN;
  let lo = edgeMin, hi = edgeMax;
  if (strike) { hi = Math.min(hi, maxIn - 0.01); lo = Math.min(lo, hi); }
  else { hi = Math.min(hi, maxOutIn); lo = Math.min(lo, hi); }
  for (let attempt = 0; attempt < 2000; attempt++) {
    const x = rng.range(-2.0, 2.0);
    const z = rng.range(zone.bottom - 1.4, zone.top + 1.2);
    const e = edgeDistanceIn(x, z, zone);
    const d = strike ? e : -e;
    if (d >= lo && d <= hi && (strike ? e >= 0 : e < 0)) return { x, z };
    if (attempt === 1500) { lo = 0; } // relax if the band is too narrow
  }
  return strike ? { x: 0, z: midZ } : { x: zone.right + BALL_RADIUS + 0.5, z: midZ };
}
