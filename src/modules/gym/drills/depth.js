// Optional stereo depth test (needs red-cyan glasses, or a side-by-side phone viewer).
// Alternates two trial types on one disparity staircase:
//  • random-dot stereogram: a square floats in front in one of four places;
//  • 3D ball-distance judgment rendered with the Three.js stereo pipeline: which ball
//    is closer? Both balls are scaled to the same angular size, so only disparity tells.
import * as THREE from 'three';
import { t } from '../../../i18n/i18n.js';
import { LL, directionButtons } from './common.js';
import { StereoOutput } from '../../../render/stereo.js';
import { BALL_RADIUS } from '../../../engine/units.js';

const IPD_FT = 0.207; // 6.3 cm

function makeRDS(sizePx, dotPx, dispPx, pos, rng, mode) {
  const n = Math.floor(sizePx / dotPx);
  const base = new Uint8Array(n * n);
  for (let i = 0; i < base.length; i++) base[i] = rng.next() < 0.5 ? 1 : 0;
  const right = base.slice();
  const ps = Math.floor(n / 3), off = Math.floor(n / 4);
  const cx = Math.floor(n / 2) + [off, 0, -off, 0][pos], cy = Math.floor(n / 2) + [0, -off, 0, off][pos];
  const x0 = cx - Math.floor(ps / 2), y0 = cy - Math.floor(ps / 2);
  const d = Math.max(1, Math.round(dispPx / dotPx));
  // Right eye: patch shifted left by d (crossed disparity → appears in front).
  for (let y = y0; y < y0 + ps; y++) {
    for (let x = x0 - d; x < x0 + ps; x++) {
      if (x < 0 || x >= n) continue;
      right[y * n + x] = x < x0 + ps - d ? base[y * n + x + d] : (rng.next() < 0.5 ? 1 : 0);
    }
  }
  const W = mode === 'sbs' ? n * 2 + 8 : n;
  const cv = document.createElement('canvas');
  cv.width = W * dotPx; cv.height = n * dotPx;
  const g = cv.getContext('2d');
  const img = g.createImageData(cv.width, cv.height);
  const put = (px, py, r, gg, b) => {
    for (let yy = 0; yy < dotPx; yy++) for (let xx = 0; xx < dotPx; xx++) {
      const o = ((py * dotPx + yy) * cv.width + px * dotPx + xx) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const L = base[y * n + x], R = right[y * n + x];
    if (mode === 'sbs') { put(x, y, L * 255, L * 255, L * 255); put(x + n + 8, y, R * 255, R * 255, R * 255); }
    else put(x, y, L * 255, R * 255, R * 255);
  }
  g.putImageData(img, 0, 0);
  return { canvas: cv, dispDots: d };
}

export default {
  id: 'depth', skill: 'depth', nameKey: 'drill.depth.name', descKey: 'drill.depth.desc', howKey: 'drill.depth.how',
  defaultSeconds: 90, priority: 'support', gym: false, optional: true,
  stair: { start: 2 },
  ladder: (level) => ({ arcsec: LL(level, 1200, 30) }),
  ladderText: (level) => t('drill.depth.ladder', { n: Math.round(LL(level, 1200, 30)) }),
  create(api) {
    const mode = api.settings.prefs.stereo === 'sbs' ? 'sbs' : 'anaglyph';
    const dpr = Math.min(2, devicePixelRatio || 1);
    let tr = null, idx = 0, rds = null;
    // Three.js overlay for the ball trials
    const cv3 = document.createElement('canvas');
    Object.assign(cv3.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none', display: 'none' });
    api.shell.root.appendChild(cv3);
    let renderer = null, out = null, scene = null, camera = null, balls = [];
    const init3d = () => {
      if (renderer) return;
      renderer = new THREE.WebGLRenderer({ canvas: cv3, antialias: true });
      renderer.setPixelRatio(dpr);
      renderer.setSize(api.w, api.h, false);
      out = new StereoOutput(renderer);
      out.setMode(mode, IPD_FT);
      out.focusFt = 20;
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 2.2));
      const fovV = api.h / api.ppd; // degrees (screen height at the calibrated distance)
      camera = new THREE.PerspectiveCamera(fovV, api.w / api.h, 0.5, 200);
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 24, 16), new THREE.MeshLambertMaterial({ color: 0xf4f1ea }));
        scene.add(m); balls.push(m);
      }
    };
    const setButtons = (kind) => api.setButtons(kind === 'rds' ? directionButtons() : [
      { id: 'L', label: t('drill.depth.left'), key: ['ArrowLeft'] }, { id: 'R', label: t('drill.depth.right'), key: ['ArrowRight'] }]);
    return {
      intro: () => t(mode === 'sbs' ? 'drill.depth.introSbs' : 'drill.depth.introAnaglyph'),
      nextTrial(p) {
        const kind = idx++ % 2 === 0 ? 'rds' : 'ball';
        const ppdDev = api.ppd * dpr;
        if (kind === 'rds') {
          const pos = api.rng.int(0, 3);
          const size = Math.floor(Math.min(mode === 'sbs' ? api.w / 2 - 20 : api.w - 40, api.h - 150) * dpr * 0.9);
          const dispPx = (p.arcsec / 3600) * ppdDev;
          rds = makeRDS(size, 2, dispPx, pos, api.rng, mode);
          return { kind, answer: String(pos), arcsecTarget: p.arcsec, arcsec: (rds.dispDots * 2 / ppdDev) * 3600 };
        }
        const D = 20; // ft
        const delta = (p.arcsec / 206265) * D * D / IPD_FT;
        const nearSide = api.rng.chance(0.5) ? 'L' : 'R';
        return { kind, answer: nearSide, arcsecTarget: p.arcsec, arcsec: p.arcsec, distFt: D, deltaFt: delta };
      },
      start(trial, now) {
        tr = trial;
        setButtons(trial.kind);
        cv3.style.display = trial.kind === 'ball' ? 'block' : 'none';
        if (trial.kind === 'ball') {
          init3d();
          const ang = 0.035; // rad either side of centre
          const dists = trial.answer === 'L' ? [trial.distFt, trial.distFt + trial.deltaFt] : [trial.distFt + trial.deltaFt, trial.distFt];
          balls.forEach((b, i) => {
            const d = dists[i];
            b.position.set((i === 0 ? -1 : 1) * Math.tan(ang) * d, 0, -d);
            b.scale.setScalar((d / trial.distFt) * 3); // equal angular size (3× real ball)
          });
        }
        trial._t0 = now;
        trial._timeoutMs = 8000;
      },
      frame() {
        if (!tr) return;
        if (tr.kind === 'rds' && rds) {
          const wCss = rds.canvas.width / dpr, hCss = rds.canvas.height / dpr;
          api.g.imageSmoothingEnabled = false;
          api.g.drawImage(rds.canvas, Math.round(api.cx - wCss / 2), Math.round(api.cy - hCss / 2 - 30), wCss, hCss);
        } else if (tr.kind === 'ball' && renderer) out.render(scene, camera);
      },
      onButton(id, ts) { if (!tr) return; const r = { answer: id, rtMs: api.tapTime(ts) - tr._t0 }; tr = null; cv3.style.display = 'none'; api.complete(r); },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        return { correct: r.answer === trial.answer, rtMs: r.rtMs };
      },
      dispose() { out?.dispose(); renderer?.dispose(); cv3.remove(); },
    };
  },
};
