// Saccade test: a Landolt C flashes away from fixation for a short time; jump
// your eyes to it and report the gap. Shorter exposures need faster, more accurate saccades.
import { t } from '../../../i18n/i18n.js';
import { landolt, crosshair, ring } from '../draw.js';
import { L, LL, directionButtons } from './common.js';

const PATTERNS = ['h', 'v', 'd'];

export default {
  id: 'saccadeId', skill: 'saccades', nameKey: 'drill.saccadeId.name', descKey: 'drill.saccadeId.desc', howKey: 'drill.saccadeId.how',
  defaultSeconds: 75, priority: 'support', gym: false,
  stair: { start: 2 },
  ladder: (level) => ({ exposureMs: LL(level, 500, 70), eccDeg: L(level, 6, 12), sizeDeg: L(level, 1.1, 0.7) }),
  ladderText: (level) => t('drill.saccadeId.ladder', { ms: Math.round(LL(level, 500, 70)) }),
  create(api) {
    let tr = null;
    return {
      buttons: directionButtons(),
      nextTrial(p) {
        const pat = api.rng.pick(PATTERNS);
        const sgn = api.rng.chance(0.5) ? 1 : -1;
        const maxX = api.wDeg / 2 - p.sizeDeg, maxY = api.hDeg / 2 - p.sizeDeg - 2;
        let ecc = p.eccDeg, x = 0, y = 0;
        if (pat === 'h') { ecc = Math.min(ecc, maxX); x = sgn * ecc; }
        else if (pat === 'v') { ecc = Math.min(ecc, maxY); y = sgn * ecc; }
        else { const e = Math.min(ecc / Math.SQRT2, maxX, maxY); x = sgn * e; y = (api.rng.chance(0.5) ? 1 : -1) * e; ecc = e * Math.SQRT2; }
        return { ...p, pattern: pat, eccDeg: ecc, xDeg: x, yDeg: y, dir: api.rng.int(0, 3), foreMs: Math.round(api.rng.range(600, 1300)) };
      },
      start(trial, now) { tr = trial; trial._onsetAt = now + trial.foreMs; trial._shown = null; trial._timeoutMs = trial.foreMs + 3500; },
      frame(ts, present) {
        if (!tr) return;
        const g = api.g;
        if (tr._shown === null && ts + api.clock.frameMs / 2 >= tr._onsetAt) tr._shown = present;
        if (tr._shown === null) { crosshair(g, api.cx, api.cy, 8, '#cfd6df'); return; }
        const el = present - tr._shown;
        const x = api.cx + api.deg(tr.xDeg), y = api.cy - api.deg(tr.yDeg);
        if (el <= tr.exposureMs) landolt(g, x, y, Math.max(4, api.deg(tr.sizeDeg)), tr.dir, '#fff');
        else { ring(g, x, y, api.deg(tr.sizeDeg) / 2, '#3a4554', 3); ring(g, x, y, api.deg(tr.sizeDeg) / 3.2, '#3a4554', 3); } // mask
      },
      onButton(id, ts) { if (!tr || tr._shown === null) return; const r = { dir: Number(id), rtMs: api.tapTime(ts) - tr._shown }; tr = null; api.complete(r); },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        return { correct: r.dir === trial.dir, rtMs: r.rtMs };
      },
    };
  },
};
