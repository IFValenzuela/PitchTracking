// Contrast Hunter: find a faint, drifting target on a grey background and tap it.
// Contrast follows a log staircase. Displays are 8-bit, so the floor is ~0.8 %.
import { t } from '../../../i18n/i18n.js';
import { LL } from './common.js';

const BG = 128;

export default {
  id: 'contrast', skill: 'contrast', nameKey: 'drill.contrast.name', descKey: 'drill.contrast.desc', howKey: 'drill.contrast.how',
  defaultSeconds: 90, priority: 'support',
  stair: { start: 2 },
  ladder: (level) => ({ contrast: Math.max(1 / BG, LL(level, 0.3, 0.008)), sizeDeg: 2.2, driftDeg: 1.5 }),
  ladderText: (level) => t('drill.contrast.ladder', { n: (Math.max(1 / BG, LL(level, 0.3, 0.008)) * 100).toFixed(1) }),
  create(api) {
    let tr = null;
    const pos = (trial, present) => {
      const s = Math.max(0, (present - trial._t0) / 1000);
      return { x: api.cx + api.deg(trial.xDeg + Math.cos(trial.ang) * trial.driftDeg * s), y: api.cy - api.deg(trial.yDeg + Math.sin(trial.ang) * trial.driftDeg * s) };
    };
    let lastPos = null;
    return {
      bg: `rgb(${BG},${BG},${BG})`,
      nextTrial(p) {
        const mx = Math.max(1, api.wDeg / 2 - p.sizeDeg * 2), my = Math.max(1, api.hDeg / 2 - p.sizeDeg * 2);
        return { ...p, xDeg: api.rng.range(-mx, mx) * 0.8, yDeg: api.rng.range(-my, my) * 0.75, ang: api.rng.range(0, Math.PI * 2), polarity: api.rng.chance(0.5) ? 1 : -1 };
      },
      start(trial, now) { tr = trial; trial._t0 = now + 250; trial._timeoutMs = 4500; },
      frame(ts, present) {
        if (!tr || present < tr._t0) return;
        const g = api.g;
        const { x, y } = pos(tr, present);
        lastPos = { x, y };
        const r = api.deg(tr.sizeDeg) / 2;
        const peak = Math.round(Math.max(0, Math.min(255, BG * (1 + tr.polarity * tr.contrast))));
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgb(${peak},${peak},${peak})`);
        grd.addColorStop(0.55, `rgb(${peak},${peak},${peak})`);
        grd.addColorStop(1, `rgb(${BG},${BG},${BG})`);
        g.fillStyle = grd;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      },
      onPointer(e) {
        if (!tr || !lastPos) return;
        const d = Math.hypot(e.x - lastPos.x, e.y - lastPos.y) / api.ppd;
        const r = { hitDeg: d, rtMs: api.tapTime(e.ts) - tr._t0 };
        tr = null;
        api.complete(r);
      },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        return { correct: r.hitDeg <= trial.sizeDeg * 0.9, rtMs: r.rtMs };
      },
    };
  },
};
