// Visual Span (tachistoscope): a pattern of balls flashes for 50–300 ms, then a
// mask. Tap the cells where the balls were. Exposure is quantised to whole display
// frames; the actual on-screen time is logged.
import { t } from '../../../i18n/i18n.js';
import { baseball } from '../draw.js';
import { L, LL } from './common.js';

export default {
  id: 'visualSpan', skill: 'visualSpan', nameKey: 'drill.span.name', descKey: 'drill.span.desc', howKey: 'drill.span.how',
  defaultSeconds: 120, priority: 'support',
  stair: { start: 2 },
  ladder: (level) => ({ k: Math.round(L(level, 3, 7)), exposureMs: LL(level, 300, 50), grid: level < 8 ? 3 : 4 }),
  ladderText: (level) => t('drill.span.ladder', { k: Math.round(L(level, 3, 7)), ms: Math.round(LL(level, 300, 50)) }),
  create(api) {
    let tr = null, phase = 'idle', picks = new Set(), frames = 0;
    const layout = (n) => {
      const size = Math.min(api.w, api.h) * 0.7, cell = size / n;
      return { x0: api.cx - size / 2, y0: api.cy - size / 2, cell, size };
    };
    return {
      nextTrial(p) {
        const n = p.grid, cells = api.rng.shuffle([...Array(n * n).keys()]).slice(0, Math.min(p.k, n * n - 1));
        return { ...p, cells: cells.sort((a, b) => a - b) };
      },
      start(trial, now) {
        tr = trial; phase = 'fore'; picks = new Set(); frames = 0;
        trial._onsetAt = now + 700; trial._shown = null; trial._timeoutMs = 700 + 15000;
        const f = api.clock.frameMs;
        trial._frames = Math.max(1, Math.round(trial.exposureMs / f));
      },
      frame(ts, present) {
        if (!tr) return;
        const g = api.g, Lt = layout(tr.grid);
        g.strokeStyle = '#2a3442'; g.lineWidth = 1;
        for (let i = 0; i <= tr.grid; i++) {
          g.beginPath(); g.moveTo(Lt.x0 + i * Lt.cell, Lt.y0); g.lineTo(Lt.x0 + i * Lt.cell, Lt.y0 + Lt.size); g.stroke();
          g.beginPath(); g.moveTo(Lt.x0, Lt.y0 + i * Lt.cell); g.lineTo(Lt.x0 + Lt.size, Lt.y0 + i * Lt.cell); g.stroke();
        }
        const center = (c) => [Lt.x0 + ((c % tr.grid) + 0.5) * Lt.cell, Lt.y0 + (Math.floor(c / tr.grid) + 0.5) * Lt.cell];
        if (phase === 'fore' && ts + api.clock.frameMs / 2 >= tr._onsetAt) { phase = 'show'; tr._shown = present; }
        if (phase === 'show') {
          frames++;
          for (const c of tr.cells) baseball(g, ...center(c), Lt.cell * 0.3);
          if (frames >= tr._frames) { phase = 'mask'; tr._maskAt = present; tr.shownMs = Math.round(frames * api.clock.frameMs); }
        } else if (phase === 'mask') {
          for (let c = 0; c < tr.grid * tr.grid; c++) { const [x, y] = center(c); g.fillStyle = (c * 7) % 3 ? '#3a4554' : '#5d6b7c'; g.fillRect(x - Lt.cell * 0.3, y - Lt.cell * 0.3, Lt.cell * 0.6, Lt.cell * 0.6); }
          if (present - tr._maskAt > 150) phase = 'recall';
        } else if (phase === 'recall') {
          for (const c of picks) { const [x, y] = center(c); g.strokeStyle = '#46c2ff'; g.lineWidth = 3; g.strokeRect(x - Lt.cell * 0.4, y - Lt.cell * 0.4, Lt.cell * 0.8, Lt.cell * 0.8); }
        }
      },
      onPointer(e) {
        if (!tr || phase !== 'recall') return;
        const Lt = layout(tr.grid);
        const col = Math.floor((e.x - Lt.x0) / Lt.cell), row = Math.floor((e.y - Lt.y0) / Lt.cell);
        if (col < 0 || row < 0 || col >= tr.grid || row >= tr.grid) return;
        const c = row * tr.grid + col;
        if (picks.has(c)) picks.delete(c); else picks.add(c);
        if (picks.size >= tr.cells.length) {
          const r = { picks: [...picks].sort((a, b) => a - b), rtMs: api.tapTime(e.ts) - tr._maskAt };
          tr = null; phase = 'idle';
          api.complete(r);
        }
      },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        const hits = r.picks.filter((c) => trial.cells.includes(c)).length;
        return { correct: hits === trial.cells.length, hits, recall: hits / trial.cells.length, rtMs: r.rtMs, note: t('drill.span.hits', { n: hits, k: trial.cells.length }) };
      },
    };
  },
};
