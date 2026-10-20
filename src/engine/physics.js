// Pitch flight physics: gravity, drag and Magnus lift, integrated with RK4.
// Pure functions, no DOM. See units.js for the coordinate system.
import { G, K_AERO, DRAG_CD, BALL_RADIUS, PLATE_FRONT_Y } from './units.js';

export const DT = 0.001; // 1 ms integration and sampling step
const STRIDE = 7; // t, x, y, z, vx, vy, vz

// Lift coefficient as a function of spin factor S = r·ω⊥/v (Sawicki/Nathan form).
export function liftCoefficient(S) {
  if (S <= 0) return 0;
  return LIFT_SCALE / (2.32 + 0.4 / S);
}
// Scales the lift curve so typical pitches match measured movement
// (≈16 in of induced rise for a 94 mph, 2300 rpm four-seamer with high spin efficiency).
export const LIFT_SCALE = 0.86;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a) => { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 0]; };
export const vec = { cross, dot, norm, scale, sub, unit };

// Acceleration for velocity v (ft/s) and spin vector w (rad/s).
export function acceleration(v, w, { magnus = true, drag = true } = {}) {
  const speed = norm(v);
  let ax = 0, ay = 0, az = -G;
  if (drag && speed > 0) {
    const k = K_AERO * DRAG_CD * speed;
    ax -= k * v[0]; ay -= k * v[1]; az -= k * v[2];
  }
  if (magnus && speed > 0) {
    const vh = scale(v, 1 / speed);
    const wPerp = sub(w, scale(vh, dot(w, vh))); // gyro component makes no lift
    const S = (BALL_RADIUS * norm(wPerp)) / speed;
    const dir = cross(w, v);
    const dn = norm(dir);
    if (dn > 0 && S > 0) {
      const a = K_AERO * liftCoefficient(S) * speed * speed;
      ax += (a * dir[0]) / dn; ay += (a * dir[1]) / dn; az += (a * dir[2]) / dn;
    }
  }
  return [ax, ay, az];
}

// Integrates from release until the ball passes yStop (default: 3 ft behind the
// plate, where the catcher's mitt would be). Returns sampled trajectory.
export function simulate({ p0, v0, spin }, { yStop = -3, maxT = 3, magnus = true, drag = true } = {}) {
  const maxN = Math.ceil(maxT / DT) + 2;
  const buf = new Float64Array(maxN * STRIDE);
  let p = [...p0], v = [...v0], t = 0, n = 0;
  const w = spin || [0, 0, 0];
  const opts = { magnus, drag };
  const push = () => {
    const o = n * STRIDE;
    buf[o] = t; buf[o + 1] = p[0]; buf[o + 2] = p[1]; buf[o + 3] = p[2];
    buf[o + 4] = v[0]; buf[o + 5] = v[1]; buf[o + 6] = v[2];
    n++;
  };
  push();
  while (p[1] > yStop && t < maxT && n < maxN) {
    // Classic RK4 on (p, v).
    const a1 = acceleration(v, w, opts);
    const v2 = [v[0] + a1[0] * DT / 2, v[1] + a1[1] * DT / 2, v[2] + a1[2] * DT / 2];
    const a2 = acceleration(v2, w, opts);
    const v3 = [v[0] + a2[0] * DT / 2, v[1] + a2[1] * DT / 2, v[2] + a2[2] * DT / 2];
    const a3 = acceleration(v3, w, opts);
    const v4 = [v[0] + a3[0] * DT, v[1] + a3[1] * DT, v[2] + a3[2] * DT];
    const a4 = acceleration(v4, w, opts);
    for (let i = 0; i < 3; i++) {
      p[i] += (DT / 6) * (v[i] + 2 * v2[i] + 2 * v3[i] + v4[i]);
      v[i] += (DT / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]);
    }
    t += DT;
    push();
  }
  return { data: buf.subarray(0, n * STRIDE), n, dt: DT };
}

// Linear interpolation of the state at time t (clamped to the trajectory).
export function stateAt(traj, t) {
  const { data, n } = traj;
  const f = Math.max(0, Math.min(n - 1, t / DT));
  const i = Math.min(n - 2, Math.floor(f));
  const a = f - i;
  const o = i * STRIDE, o2 = (i + 1) * STRIDE;
  const s = new Array(STRIDE);
  for (let k = 0; k < STRIDE; k++) s[k] = data[o + k] * (1 - a) + data[o2 + k] * a;
  return { t: s[0], x: s[1], y: s[2], z: s[3], vx: s[4], vy: s[5], vz: s[6] };
}

// State where the ball crosses the plane y = yPlane (interpolated), or null.
export function crossingAt(traj, yPlane = PLATE_FRONT_Y) {
  const { data, n } = traj;
  for (let i = 1; i < n; i++) {
    const y0 = data[(i - 1) * STRIDE + 2], y1 = data[i * STRIDE + 2];
    if (y0 >= yPlane && y1 < yPlane) {
      const a = (y0 - yPlane) / (y0 - y1);
      const o = (i - 1) * STRIDE, o2 = i * STRIDE;
      const s = [];
      for (let k = 0; k < STRIDE; k++) s[k] = data[o + k] * (1 - a) + data[o2 + k] * a;
      return { t: s[0], x: s[1], y: yPlane, z: s[3], vx: s[4], vy: s[5], vz: s[6] };
    }
  }
  return null;
}

// Time at which the ball has travelled `dist` feet (path length along y) from release.
export function timeAtDistanceFromRelease(traj, dist) {
  const y0 = traj.data[2];
  const c = crossingAt(traj, y0 - dist);
  return c ? c.t : traj.data[(traj.n - 1) * STRIDE];
}

// Builds the spin vector (rad/s) for a desired movement direction.
//  vHat: unit initial velocity; moveDir: world-space direction the Magnus force should push;
//  efficiency: fraction of spin that is transverse (1 = pure backspin/sidespin/topspin).
export function spinVector(vHat, moveDir, rateRadS, efficiency, gyroSign = 1) {
  const b = unit(sub(moveDir, scale(vHat, dot(moveDir, vHat))));
  const transverse = cross(vHat, b); // (v̂ × b) × v̂ = b
  const e = Math.max(0, Math.min(1, efficiency));
  const g = Math.sqrt(1 - e * e) * gyroSign;
  return [
    rateRadS * (e * transverse[0] + g * vHat[0]),
    rateRadS * (e * transverse[1] + g * vHat[1]),
    rateRadS * (e * transverse[2] + g * vHat[2]),
  ];
}

// Finds the release velocity direction so the pitch passes through `target`
// {x, y, z} (y = plane, e.g. the plate front or a tunnel point). Newton's method
// on two direction slopes with a finite-difference Jacobian.
export function aim({ p0, speed, spinFor, target, tol = 0.002, maxIter = 12 }) {
  const dirFrom = (sx, sz) => unit([sx, -1, sz]);
  const shoot = (sx, sz) => {
    const vHat = dirFrom(sx, sz);
    const v0 = scale(vHat, speed);
    const spin = spinFor(vHat);
    const traj = simulate({ p0, v0, spin }, { yStop: Math.min(target.y - 0.5, -0.5) });
    const c = crossingAt(traj, target.y);
    return { v0, spin, traj, c, err: c ? [c.x - target.x, c.z - target.z] : [1e3, 1e3] };
  };
  const dy = p0[1] - target.y;
  let sx = (target.x - p0[0]) / dy;
  let sz = (target.z - p0[2]) / dy;
  let r = shoot(sx, sz);
  for (let i = 0; i < maxIter && Math.hypot(...r.err) > tol; i++) {
    const h = 1e-4;
    const rx = shoot(sx + h, sz), rz = shoot(sx, sz + h);
    const J = [[(rx.err[0] - r.err[0]) / h, (rz.err[0] - r.err[0]) / h], [(rx.err[1] - r.err[1]) / h, (rz.err[1] - r.err[1]) / h]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (Math.abs(det) < 1e-12) break;
    sx -= (J[1][1] * r.err[0] - J[0][1] * r.err[1]) / det;
    sz -= (-J[1][0] * r.err[0] + J[0][0] * r.err[1]) / det;
    r = shoot(sx, sz);
  }
  return r;
}
