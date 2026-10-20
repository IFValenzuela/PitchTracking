// Visual Search: find the ball with the red spin dot among balls with blue dots and
// balls with red stripes (a conjunction search), and tap it.
import { t } from '../../../i18n/i18n.js';
import { baseball, disc } from '../draw.js';
import { L } from './common.js';

export default {
  id: 'visualSearch', skill: 'visualSearch', nameKey: 'drill.search.name', descKey: 'drill.search.desc', howKey: 'drill.search.how',
  defaultSeconds: 90, priority: 'support',
  stair: { start: 2 },
  ladder: (level) => ({ n: Math.round(L(level, 6, 36)), sizeDeg: L(level, 1.5, 0.8), limitMs: L(level, 6000, 2400) }),
  ladderText: (level) => t('drill.search.ladder', { n: Math.round(L(level, 6, 36)) }),
  create(api) {
    let tr = null;
    return {
      nextTrial(p) {
        const r = p.sizeDeg / 2 + 0.25;
        const items = [];
        const W = api.wDeg - 2 * r - 1, H = api.hDeg - 2 * r - 3;
        for (let tries = 0; items.length < p.n && tries < 4000; tries++) {
          const x = api.rng.range(-W / 2, W / 2), y = api.rng.range(-H / 2, H / 2 - 1);
          if (items.every((o) => Math.hypot(o.x - x, o.y - y) > 2 * r)) items.push({ x, y, kind: items.length === 0 ? 'target' : api.rng.chance(0.5) ? 'blueDot' : 'redStripe' });
        }
        return { ...p, items: api.rng.shuffle(items).map((o) => ({ x: +o.x.toFixed(2), y: +o.y.toFixed(2), kind: o.kind })) };
      },
      start(trial, now) { tr = trial; trial._t0 = now + 200; trial._timeoutMs = 200 + trial.limitMs; },
      frame(ts, present) {
        if (!tr || present < tr._t0) return;
        const g = api.g;
        for (const o of tr.items) {
          const x = api.cx + api.deg(o.x), y = api.cy - api.deg(o.y), r = api.deg(tr.sizeDeg) / 2;
          if (o.kind === 'redStripe') baseball(g, x, y, r, { mark: 'stripe' });
          else { baseball(g, x, y, r); disc(g, x, y, r * 0.3, o.kind === 'target' ? '#d6332f' : '#2f6fd6'); }
        }
      },
      onPointer(e) {
        if (!tr) return;
        const tgt = tr.items.find((o) => o.kind === 'target');
        const d = Math.hypot(e.x - (api.cx + api.deg(tgt.x)), e.y - (api.cy - api.deg(tgt.y))) / api.ppd;
        const r = { dDeg: d, rtMs: api.tapTime(e.ts) - tr._t0 };
        tr = null;
        api.complete(r);
      },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        return { correct: r.dDeg <= trial.sizeDeg * 0.8, rtMs: r.rtMs };
      },
    };
  },
};
