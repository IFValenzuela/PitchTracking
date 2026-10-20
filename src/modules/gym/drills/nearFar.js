// Near-Far Shift.
//  • "screen": letters alternate between a near panel (bottom, large field) and a
//    far panel (top, small, as if far away). Trains quick fixation and attention
//    shifts; a flat screen cannot change the eyes' focus distance.
//  • "guided": the real version. Look at a distant object (3 m+) when told, then
//    back to the phone and read the small ring as fast as you can.
import { t } from '../../../i18n/i18n.js';
import { landolt, text } from '../draw.js';
import { L, LL, directionButtons } from './common.js';

export default {
  id: 'nearFar', skill: 'focusShift', nameKey: 'drill.nearfar.name', descKey: 'drill.nearfar.desc', howKey: 'drill.nearfar.how',
  defaultSeconds: 90, priority: 'support', variants: ['screen', 'guided'],
  stair: { start: 2 },
  ladder: (level) => ({ showMs: LL(level, 900, 160), sizeDeg: L(level, 1.0, 0.35), limitMs: L(level, 2600, 900) }),
  ladderText: (level) => t('drill.nearfar.ladder', { ms: Math.round(L(level, 2600, 900)) }),
  create(api, variant = 'screen') {
    let tr = null, n = 0;
    const guided = variant === 'guided';
    return {
      buttons: directionButtons(),
      intro: () => t(guided ? 'drill.nearfar.introGuided' : 'drill.nearfar.introScreen'),
      nextTrial(p) {
        const where = guided ? 'near' : n++ % 2 === 0 ? 'far' : 'near';
        return { ...p, where, dir: api.rng.int(0, 3), farMs: guided ? Math.round(api.rng.range(1800, 3200)) : Math.round(api.rng.range(300, 700)), variant };
      },
      start(trial, now) {
        tr = trial;
        trial._onsetAt = now + trial.farMs;
        trial._shown = null;
        trial._timeoutMs = trial.farMs + trial.limitMs + 400;
        if (guided) { api.sound('go'); }
      },
      frame(ts, present) {
        if (!tr) return;
        const g = api.g;
        if (tr._shown === null && ts + api.clock.frameMs / 2 >= tr._onsetAt) { tr._shown = present; if (guided) api.sound('tick'); }
        if (guided) {
          if (tr._shown === null) { text(g, t('drill.nearfar.lookFar'), api.cx, api.cy, { size: 42 }); return; }
          landolt(g, api.cx, api.cy, Math.max(4, api.deg(tr.sizeDeg)), tr.dir, '#fff');
          return;
        }
        // screen version: far panel (top, small, dim haze) and near panel (bottom)
        const farY = api.h * 0.24, nearY = api.h * 0.72;
        g.fillStyle = '#0f151d'; g.fillRect(api.cx - api.deg(1.6), farY - api.deg(1.1), api.deg(3.2), api.deg(2.2));
        g.fillStyle = '#18212c'; g.fillRect(api.w * 0.2, nearY - api.deg(2.5), api.w * 0.6, api.deg(5));
        if (tr._shown === null || present - tr._shown > tr.showMs) return;
        const far = tr.where === 'far';
        landolt(g, api.cx, far ? farY : nearY, Math.max(3, api.deg(tr.sizeDeg) * (far ? 0.55 : 1)), tr.dir, far ? '#c9d2dc' : '#fff');
      },
      onButton(id, ts) { if (!tr || tr._shown === null) return; const r = { dir: Number(id), rtMs: api.tapTime(ts) - tr._shown }; tr = null; api.complete(r); },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        return { correct: r.dir === trial.dir && r.rtMs <= trial.limitMs, rtMs: r.rtMs };
      },
    };
  },
};
