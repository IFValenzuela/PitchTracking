// Saccade Snap: targets jump between positions (horizontal, vertical, diagonal,
// rotational). Tap each as it appears; the allowed time shrinks as you improve.
import { t } from '../../../i18n/i18n.js';
import { disc, ring } from '../draw.js';
import { L } from './common.js';

const PATTERNS = ['horizontal', 'vertical', 'diagonal', 'rotational'];

export default {
  id: 'saccadeSnap', skill: 'saccades', nameKey: 'drill.snap.name', descKey: 'drill.snap.desc', howKey: 'drill.snap.how',
  defaultSeconds: 75, priority: 'support', strobeOk: true,
  stair: { start: 2 },
  ladder: (level) => ({ windowMs: L(level, 1400, 420), sizeDeg: L(level, 1.6, 0.7), eccDeg: L(level, 5, 12) }),
  ladderText: (level) => t('drill.snap.ladder', { ms: Math.round(L(level, 1400, 420)) }),
  create(api) {
    let tr = null, n = 0, side = 1, rotIdx = 0;
    return {
      nextTrial(p) {
        const pattern = PATTERNS[Math.floor(n / 10) % PATTERNS.length];
        n++;
        const ex = Math.min(p.eccDeg, api.wDeg / 2 - p.sizeDeg), ey = Math.min(p.eccDeg, api.hDeg / 2 - p.sizeDeg - 1.5);
        side = -side;
        let x = 0, y = 0;
        if (pattern === 'horizontal') x = side * ex;
        else if (pattern === 'vertical') y = side * ey;
        else if (pattern === 'diagonal') { const e = Math.min(ex, ey); x = side * e; y = (api.rng.chance(0.5) ? 1 : -1) * e; }
        else { rotIdx = (rotIdx + 3) % 8; const a = (rotIdx / 8) * Math.PI * 2; x = Math.cos(a) * Math.min(ex, ey); y = Math.sin(a) * Math.min(ex, ey); }
        return { ...p, pattern, xDeg: x, yDeg: y, isiMs: Math.round(api.rng.range(150, 450)) };
      },
      start(trial, now) { tr = trial; trial._onsetAt = now + trial.isiMs; trial._shown = null; trial._timeoutMs = trial.isiMs + trial.windowMs + 40; },
      frame(ts, present) {
        if (!tr) return;
        if (tr._shown === null && ts + api.clock.frameMs / 2 >= tr._onsetAt) tr._shown = present;
        if (tr._shown === null) return;
        const x = api.cx + api.deg(tr.xDeg), y = api.cy - api.deg(tr.yDeg), r = api.deg(tr.sizeDeg) / 2;
        // remaining time shown as a shrinking ring
        const left = Math.max(0, 1 - (present - tr._shown) / tr.windowMs);
        disc(api.g, x, y, r, '#ffd34d');
        disc(api.g, x, y, r * 0.25, '#05070a');
        ring(api.g, x, y, r * (1 + left * 0.8), 'rgba(255,211,77,.45)', 2);
      },
      onPointer(e) {
        if (!tr || tr._shown === null) return;
        const x = api.cx + api.deg(tr.xDeg), y = api.cy - api.deg(tr.yDeg);
        const dDeg = Math.hypot(e.x - x, e.y - y) / api.ppd;
        const r = { dDeg, rtMs: api.tapTime(e.ts) - tr._shown };
        tr = null;
        api.complete(r);
      },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        return { correct: r.dDeg <= Math.max(trial.sizeDeg * 0.9, 0.9) && r.rtMs <= trial.windowMs, rtMs: r.rtMs };
      },
      iti: () => 60,
      feedback: true,
    };
  },
};
