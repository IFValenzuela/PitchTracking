// Simple reaction time: tap as soon as the ball appears (random foreperiod).
import { t } from '../../../i18n/i18n.js';
import { disc, crosshair } from '../draw.js';
import { isTapKey } from './common.js';

export default {
  id: 'reaction', skill: 'reaction', nameKey: 'drill.reaction.name', descKey: 'drill.reaction.desc', howKey: 'drill.reaction.how',
  defaultSeconds: 45, adaptive: false, gym: false, priority: 'support',
  stair: { start: 0 },
  ladder: () => ({}),
  create(api) {
    let tr = null, shownAt = null;
    const respond = (raw) => {
      if (!tr) return;
      const ts = api.tapTime(raw);
      const r = shownAt === null || ts < shownAt ? { early: true } : { rtMs: ts - shownAt };
      tr = null;
      api.complete(r);
    };
    return {
      nextTrial: () => ({ foreMs: Math.round(api.rng.range(900, 2600)) }),
      start(trial, now) { tr = trial; shownAt = null; trial._onsetAt = now + trial.foreMs; trial._timeoutMs = trial.foreMs + 1500; },
      frame(ts, present) {
        if (!tr) return;
        if (shownAt === null && ts + api.clock.frameMs / 2 >= tr._onsetAt) shownAt = present;
        if (shownAt !== null) disc(api.g, api.cx, api.cy, api.deg(2), '#f4f1ea');
        else crosshair(api.g, api.cx, api.cy, 10, '#5d6b7c');
      },
      onPointer: (e) => respond(e.ts),
      onKey: (e, ts) => { if (isTapKey(e)) respond(ts); },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        if (r.early) return { correct: false, note: t('drill.tooEarly') };
        // < 100 ms is faster than humanly possible: an anticipation, not a reaction.
        return { correct: r.rtMs >= 100, rtMs: r.rtMs, note: r.rtMs < 100 ? t('drill.tooEarly') : `${Math.round(r.rtMs)} ms` };
      },
      iti: () => 300,
    };
  },
};
