// Multiple-Object Tracking. Included for completeness but deliberately low
// priority: independent reviews found little or no transfer from MOT training
// to other tasks, so the plan rarely schedules it.
import { t } from '../../../i18n/i18n.js';
import { baseball, ring } from '../draw.js';
import { L } from './common.js';

export default {
  id: 'mot', skill: 'mot', nameKey: 'drill.mot.name', descKey: 'drill.mot.desc', howKey: 'drill.mot.how',
  defaultSeconds: 120, priority: 'low',
  stair: { start: 2 },
  ladder: (level) => ({ n: Math.round(L(level, 6, 12)), targets: Math.round(L(level, 2, 5)), speedDeg: L(level, 4, 14), trackMs: 6000 }),
  ladderText: (level) => t('drill.mot.ladder', { k: Math.round(L(level, 2, 5)), n: Math.round(L(level, 6, 12)) }),
  create(api) {
    let tr = null, phase = 'idle', balls = [], picks = new Set(), last = 0;
    const R = () => api.deg(0.6);
    return {
      nextTrial(p) { return { ...p }; },
      start(trial, now) {
        tr = trial; phase = 'cue'; picks = new Set(); last = 0;
        const W = api.wDeg - 2, H = api.hDeg - 3;
        balls = [];
        for (let i = 0; i < trial.n; i++) {
          let x, y, tries = 0;
          do { x = api.rng.range(-W / 2, W / 2); y = api.rng.range(-H / 2, H / 2); tries++; } while (tries < 200 && balls.some((b) => Math.hypot(b.x - x, b.y - y) < 2));
          const a = api.rng.range(0, Math.PI * 2);
          balls.push({ x, y, vx: Math.cos(a) * trial.speedDeg, vy: Math.sin(a) * trial.speedDeg, target: i < trial.targets });
        }
        trial._cueEnd = now + 2000; trial._stopAt = trial._cueEnd + trial.trackMs; trial._timeoutMs = 2000 + trial.trackMs + 15000;
      },
      frame(ts, present) {
        if (!tr) return;
        const g = api.g, W = api.wDeg - 2, H = api.hDeg - 3;
        const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
        last = ts;
        if (phase === 'cue' && present >= tr._cueEnd) phase = 'track';
        if (phase === 'track' && present >= tr._stopAt) phase = 'select';
        if (phase === 'track') {
          for (const b of balls) {
            b.x += b.vx * dt; b.y += b.vy * dt;
            if (Math.abs(b.x) > W / 2) { b.vx = -b.vx; b.x = Math.sign(b.x) * W / 2; }
            if (Math.abs(b.y) > H / 2) { b.vy = -b.vy; b.y = Math.sign(b.y) * H / 2; }
          }
        }
        balls.forEach((b, i) => {
          const x = api.cx + api.deg(b.x), y = api.cy - api.deg(b.y);
          baseball(g, x, y, R());
          if (phase === 'cue' && b.target) ring(g, x, y, R() * 1.6, '#ffd34d', 3);
          if (phase === 'select' && picks.has(i)) ring(g, x, y, R() * 1.6, '#46c2ff', 3);
        });
      },
      onPointer(e) {
        if (!tr || phase !== 'select') return;
        let best = -1, bd = 1e9;
        balls.forEach((b, i) => { const d = Math.hypot(e.x - (api.cx + api.deg(b.x)), e.y - (api.cy - api.deg(b.y))); if (d < bd) { bd = d; best = i; } });
        if (bd > R() * 2.5) return;
        if (picks.has(best)) picks.delete(best); else picks.add(best);
        if (picks.size >= tr.targets) {
          const hits = [...picks].filter((i) => balls[i].target).length;
          tr = null; phase = 'idle';
          api.complete({ hits });
        }
      },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        return { correct: r.hits === trial.targets, hits: r.hits, note: t('drill.span.hits', { n: r.hits, k: trial.targets }) };
      },
    };
  },
};
