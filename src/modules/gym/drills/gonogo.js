// Go / No-Go: tap for balls inside the zone, hold off on balls outside it.
// Maps directly onto plate discipline (response inhibition).
import { t } from '../../../i18n/i18n.js';
import { baseball, crosshair } from '../draw.js';
import { L, isTapKey } from './common.js';

export default {
  id: 'gonogo', skill: 'inhibition', nameKey: 'drill.gonogo.name', descKey: 'drill.gonogo.desc', howKey: 'drill.gonogo.how',
  defaultSeconds: 90, priority: 'core', strobeOk: true,
  stair: { start: 2, down: 3 }, // 3-down/1-up: errors are rarer, target ~79 %
  ladder: (level) => ({ windowMs: L(level, 800, 330), stimMs: L(level, 700, 220), nogoOutDeg: L(level, 2.4, 0.25), goInDeg: L(level, 1.2, 0.15), goRate: 0.72 }),
  ladderText: (level) => t('drill.gonogo.ladder', { w: Math.round(L(level, 800, 330)) }),
  create(api) {
    let tr = null, shownAt = null;
    const zone = () => ({ w: Math.min(api.deg(4), api.w * 0.28), h: Math.min(api.deg(5), api.h * 0.42) });
    const respond = (raw) => {
      if (!tr) return;
      const ts = api.tapTime(raw);
      if (shownAt === null || ts < shownAt) { tr = null; api.complete({ early: true }); return; }
      tr = null;
      api.complete({ tapped: true, rtMs: ts - shownAt });
    };
    return {
      nextTrial(p) {
        const go = api.rng.chance(p.goRate);
        const z = zone();
        const zw = z.w / api.ppd, zh = z.h / api.ppd; // degrees
        let x, y;
        if (go) { x = api.rng.range(-zw / 2 + p.goInDeg, zw / 2 - p.goInDeg); y = api.rng.range(-zh / 2 + p.goInDeg, zh / 2 - p.goInDeg); }
        else {
          const side = api.rng.int(0, 3), d = p.nogoOutDeg + api.rng.range(0, 0.6);
          x = side === 0 ? zw / 2 + d : side === 2 ? -zw / 2 - d : api.rng.range(-zw / 2, zw / 2);
          y = side === 1 ? zh / 2 + d : side === 3 ? -zh / 2 - d : api.rng.range(-zh / 2, zh / 2);
        }
        return { go, xDeg: x, yDeg: y, isiMs: Math.round(api.rng.range(450, 1100)), ...p };
      },
      start(trial, now) { tr = trial; shownAt = null; trial._onsetAt = now + trial.isiMs; trial._timeoutMs = trial.isiMs + trial.windowMs + 30; },
      frame(ts, present) {
        const g = api.g, z = zone();
        g.strokeStyle = '#d7dde5'; g.lineWidth = 2;
        g.strokeRect(api.cx - z.w / 2, api.cy - z.h / 2, z.w, z.h);
        if (!tr) return;
        if (shownAt === null && ts + api.clock.frameMs / 2 >= tr._onsetAt) shownAt = present;
        if (shownAt !== null && present - shownAt <= tr.stimMs) baseball(g, api.cx + api.deg(tr.xDeg), api.cy - api.deg(tr.yDeg), api.deg(0.45));
        else if (shownAt === null) crosshair(g, api.cx, api.cy, 6, '#5d6b7c');
      },
      onPointer: (e) => respond(e.ts),
      onKey: (e, ts) => { if (isTapKey(e)) respond(ts); },
      score(trial, r) {
        if (r?.early) return { correct: false, note: t('drill.tooEarly') };
        const tapped = !!r?.tapped;
        if (trial.go) return { correct: tapped, rtMs: r?.rtMs, commission: false, note: tapped ? null : t('drill.missed') };
        return { correct: !tapped, commission: tapped, note: tapped ? t('drill.gonogo.held') : null };
      },
      summary(trials) {
        const nogo = trials.filter((x) => !x.stimulus.go);
        const comm = nogo.filter((x) => x.response.commission).length;
        return nogo.length ? { extraValue: `${Math.round((100 * comm) / nogo.length)}%`, extraLabel: t('drill.gonogo.commission') } : {};
      },
      iti: () => 250,
    };
  },
};
