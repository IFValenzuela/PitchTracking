// Dynamic visual acuity: read the gap of a Landolt C moving across the screen.
import { t } from '../../../i18n/i18n.js';
import { landolt } from '../draw.js';
import { L, directionButtons } from './common.js';

export default {
  id: 'dynamicAcuity', skill: 'dynamicAcuity', nameKey: 'drill.dva.name', descKey: 'drill.dva.desc', howKey: 'drill.dva.how',
  defaultSeconds: 90, priority: 'core', strobeOk: true,
  stair: { start: 2 },
  ladder: (level) => ({ sizeDeg: L(level, 1.5, 0.3), speedDeg: L(level, 8, 55) }),
  ladderText: (level) => t('drill.dva.ladder', { size: L(level, 1.5, 0.3).toFixed(2), speed: Math.round(L(level, 8, 55)) }),
  create(api) {
    let tr = null;
    return {
      buttons: directionButtons(),
      nextTrial(p) {
        const ltr = api.rng.chance(0.5);
        const yDeg = api.rng.range(-0.22, 0.22) * api.hDeg;
        const spanDeg = api.wDeg * 1.1;
        return { ...p, ltr, yDeg, dir: api.rng.int(0, 3), travelMs: Math.round((spanDeg / p.speedDeg) * 1000) };
      },
      start(trial, now) { tr = trial; trial._t0 = now + 300; trial._timeoutMs = 300 + trial.travelMs + 2500; api.enableButtons(true); },
      frame(ts, present) {
        if (!tr) return;
        const f = (present - tr._t0) / tr.travelMs;
        if (f < 0 || f > 1) return;
        const x0 = -api.w * 0.05, x1 = api.w * 1.05;
        const x = tr.ltr ? x0 + (x1 - x0) * f : x1 - (x1 - x0) * f;
        landolt(api.g, x, api.cy - api.deg(tr.yDeg), Math.max(3, api.deg(tr.sizeDeg)), tr.dir, '#f4f6f8');
      },
      onButton(id, ts) { if (!tr) return; const r = { dir: Number(id), rtMs: api.tapTime(ts) - tr._t0 }; tr = null; api.complete(r); },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        return { correct: r.dir === trial.dir, rtMs: r.rtMs };
      },
    };
  },
};
