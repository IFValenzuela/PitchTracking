// Abstract low-poly pitcher (no likeness) with a procedural delivery whose
// throwing hand arrives exactly at the pitch's release point at t = 0.
// Positions are computed in physics coordinates (see engine/units.js) and
// converted to three.js coordinates with toThree().
import * as THREE from 'three';
import { RUBBER_Y, moundHeightAt } from '../engine/units.js';
import { armSideX } from '../engine/pitches.js';

export const toThree = (p, out = new THREE.Vector3()) => out.set(p[0], p[2], -p[1]);

export const WINDUP_S = 1.7; // delivery starts this long before release

const lerp = (a, b, f) => a + (b - a) * f;
const lerp3 = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const smooth = (f) => f * f * (3 - 2 * f);
const clamp01 = (f) => Math.max(0, Math.min(1, f));

// Catmull-Rom through keyframes [[t, [x,y,z]], ...]
function spline(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
  let i = 0;
  while (keys[i + 1][0] < t) i++;
  const p0 = keys[Math.max(0, i - 1)][1], p1 = keys[i][1], p2 = keys[i + 1][1], p3 = keys[Math.min(keys.length - 1, i + 2)][1];
  const f = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
  const f2 = f * f, f3 = f2 * f;
  return [0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3));
}

// Two-bone IK: elbow/knee position for root→end with segment lengths l1, l2 and a bend hint.
function ik(root, end, l1, l2, hint) {
  const d = [end[0] - root[0], end[1] - root[1], end[2] - root[2]];
  let len = Math.hypot(...d);
  const maxLen = (l1 + l2) * 0.999;
  const dn = d.map((v) => v / (len || 1));
  if (len > maxLen) len = maxLen;
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // hint projected perpendicular to the limb
  const hd = hint[0] * dn[0] + hint[1] * dn[1] + hint[2] * dn[2];
  let pv = [hint[0] - hd * dn[0], hint[1] - hd * dn[1], hint[2] - hd * dn[2]];
  const pn = Math.hypot(...pv) || 1;
  pv = pv.map((v) => v / pn);
  return [root[0] + dn[0] * a + pv[0] * hgt, root[1] + dn[1] * a + pv[1] * hgt, root[2] + dn[2] * a + pv[2] * hgt];
}

export function createPitcherFigure({ shadows = false } = {}) {
  const group = new THREE.Group();
  group.name = 'pitcher';
  const uni = new THREE.MeshLambertMaterial({ color: 0x2b3a55 });
  const pants = new THREE.MeshLambertMaterial({ color: 0xc9ccd2 });
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a6a55 });
  const glove = new THREE.MeshLambertMaterial({ color: 0x4a2f1c });
  const cap = new THREE.MeshLambertMaterial({ color: 0x1a2232 });
  const limb = (r, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, 1, 8, 1), mat);
    m.castShadow = shadows;
    group.add(m);
    return m;
  };
  const ball = (r, mat) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
    m.castShadow = shadows;
    group.add(m);
    return m;
  };
  const parts = {
    torso: limb(0.42, uni), pelvis: ball(0.42, pants), head: ball(0.36, skin), cap: ball(0.38, cap), brim: null,
    uArmT: limb(0.13, uni), fArmT: limb(0.11, skin), handT: ball(0.11, skin),
    uArmG: limb(0.13, uni), fArmG: limb(0.11, uni), glove: ball(0.22, glove),
    thighP: limb(0.2, pants), shinP: limb(0.16, pants), footP: ball(0.16, cap),
    thighS: limb(0.2, pants), shinS: limb(0.16, pants), footS: ball(0.16, cap),
  };
  parts.cap.scale.set(1, 0.55, 1);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.3), cap);
  group.add(brim);
  parts.brim = brim;

  const up = new THREE.Vector3(0, 1, 0);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), dir = new THREE.Vector3();
  const place = (mesh, a, b) => {
    toThree(a, va); toThree(b, vb);
    dir.subVectors(vb, va);
    const len = dir.length();
    mesh.position.addVectors(va, vb).multiplyScalar(0.5);
    mesh.scale.set(1, Math.max(len, 0.01), 1);
    if (len > 1e-6) mesh.quaternion.setFromUnitVectors(up, dir.multiplyScalar(1 / len));
  };
  const at = (mesh, p) => toThree(p, mesh.position);

  let P = null; // pitcher description from engine/pitches.js
  let release = null;

  return {
    group,
    setPitcher(pitcher) { P = pitcher; release = pitcher.release; },
    setRelease(p0) { release = p0; },
    // Returns the hand position (physics coords) at time t (s) relative to release.
    pose(t) {
      if (!P) return null;
      const sx = armSideX(P.hand);
      const rub = P.rubberShift;
      const sh0 = P.shoulder; // throwing shoulder at release
      const relY = sh0[1];
      const strideY = relY - 0.2 - 0.2; // stride foot lands a little behind the release point
      // Timeline (s): -1.7 set, -1.25 leg lift peak -0.95, stride lands -0.12, release 0, finish 0.5
      const fLift = smooth(clamp01((t + 1.35) / 0.45)) * (1 - smooth(clamp01((t + 0.75) / 0.45)));
      const fStride = smooth(clamp01((t + 0.85) / 0.73));
      const fRot = smooth(clamp01((t + 0.22) / 0.22)); // trunk rotation into release
      const fFinish = smooth(clamp01(t / 0.45));
      const groundAt = (y) => moundHeightAt(y);

      const pivot = [rub + sx * 0.35, RUBBER_Y + 0.35, groundAt(RUBBER_Y + 0.35)];
      const strideLand = [rub - sx * 0.15, strideY, groundAt(strideY)];
      const strideStart = [rub - sx * 0.55, RUBBER_Y + 0.4, groundAt(RUBBER_Y + 0.4)];
      let strideFoot = lerp3(strideStart, strideLand, fStride);
      strideFoot[2] += fLift * 1.2 + Math.sin(fStride * Math.PI) * 0.35;
      strideFoot[1] += fLift * 0.6;

      const hipStart = [rub, RUBBER_Y + 0.3, MOUNDH() + 3.15];
      const hipRel = [rub + sx * 0.2, relY + 1.6, groundAt(relY + 1.6) + 2.75];
      let hips = lerp3(hipStart, hipRel, fStride);
      hips = lerp3(hips, add(hipRel, [-sx * 0.25, -1.0, -0.15]), fFinish);
      hips[2] += fLift * 0.2;

      // Torso top (centre between shoulders). Closed (shoulders along y) before rotation.
      const chestRel = [sh0[0] - sx * 0.62, sh0[1] + 0.25, sh0[2] - 0.05];
      let chest = lerp3([rub, RUBBER_Y + 0.25, MOUNDH() + 5.2], chestRel, fStride);
      chest = lerp3(chest, add(chestRel, [-sx * 0.4, -1.3, -0.7]), fFinish);
      chest[2] += fLift * 0.15;
      const psi = (1 - fRot) * (Math.PI / 2) + fFinish * (-Math.PI / 5);
      const half = 0.62;
      const shT = [chest[0] + sx * half * Math.cos(psi), chest[1] + half * Math.sin(psi), chest[2]];
      const shG = [chest[0] - sx * half * Math.cos(psi), chest[1] - half * Math.sin(psi), chest[2]];
      // Adjust so the throwing shoulder is exactly at P.shoulder at release.
      const slot = (P.slotDeg * Math.PI) / 180;
      const handSet = add(chest, [-sx * 0.15, -0.55, -0.55]);
      const keys = [
        [-WINDUP_S, handSet],
        [-0.75, handSet],
        [-0.45, add(shT, [sx * 0.4, 1.5, -1.0])],
        [-0.2, add(shT, [sx * (0.35 + 0.9 * Math.cos(slot)), 0.9, 0.3 + 1.1 * Math.sin(slot)])],
        [-0.07, add(sh0, [sx * 1.4 * Math.cos(slot), 0.75, 1.4 * Math.sin(slot)])],
        [0, release],
        [0.12, add(release, [-sx * 0.6, -1.6, -1.0])],
        [0.35, add(chest, [-sx * 1.3, -1.0, -2.3])],
        [0.9, add(chest, [-sx * 1.1, -0.9, -2.2])],
      ];
      // Throwing hand follows the spline; before t=0 the shoulder blends from the
      // rotating torso to the exact release shoulder so the arm length stays sane.
      const hand = spline(keys, t);
      const shoulderT = t < 0 ? lerp3(shT, sh0, smooth(clamp01((t + 0.22) / 0.22))) : shT;
      const gloveHand = t < -0.75 ? add(handSet, [sx * 0.15, 0, 0.05])
        : lerp3(add(shG, [-sx * 0.2, -1.6, 0.1]), add(chest, [-sx * 0.35, -0.6, -0.35]), smooth(clamp01((t + 0.15) / 0.3)));

      place(parts.torso, add(hips, [0, 0, 0.3]), chest);
      at(parts.pelvis, hips);
      const neck = add(chest, [0, -0.05, 0.25]);
      const head = add(neck, [0, -0.08, 0.42]);
      at(parts.head, head);
      at(parts.cap, add(head, [0, 0, 0.16]));
      at(parts.brim, add(head, [0, -0.32, 0.12]));
      const elbowT = ik(shoulderT, hand, 1.0, 1.0, [sx * 0.6, 0.4, -0.7]);
      place(parts.uArmT, shoulderT, elbowT); place(parts.fArmT, elbowT, hand); at(parts.handT, hand);
      const elbowG = ik(shG, gloveHand, 1.0, 1.0, [-sx * 0.5, 0.2, -0.8]);
      place(parts.uArmG, shG, elbowG); place(parts.fArmG, elbowG, gloveHand); at(parts.glove, gloveHand);
      const hipP = add(hips, [sx * 0.28, 0, -0.15]), hipS = add(hips, [-sx * 0.28, 0, -0.15]);
      const kneeP = ik(hipP, pivot, 1.55, 1.55, [0, -1, 0.2]);
      place(parts.thighP, hipP, kneeP); place(parts.shinP, kneeP, pivot); at(parts.footP, pivot);
      const kneeS = ik(hipS, strideFoot, 1.55, 1.55, [0, -1, 0.4]);
      place(parts.thighS, hipS, kneeS); place(parts.shinS, kneeS, strideFoot); at(parts.footS, strideFoot);
      return hand;
    },
  };

  function MOUNDH() { return moundHeightAt(RUBBER_Y); }
}
