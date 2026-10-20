// Peripheral Awareness: keep your eyes on the centre while a flash appears in the
// periphery. Report where the flash was (tap that side of the screen), then what
// the small centre arrow showed. A wrong centre answer means you probably looked
// away (a fixation break), so the trial does not count as correct.
import { t } from '../../../i18n/i18n.js';
import { disc, crosshair, text } from '../draw.js';
import { L, LL } from './common.js';

export default {
  id: 'peripheral', skill: 'peripheral', nameKey: 'drill.peripheral.name', descKey: 'drill.peripheral.desc', howKey: 'drill.peripheral.how',
  defaultSeconds: 90, priority: 'support', strobeOk: false,
  stair: { start: 2 },
  ladder: (level) => ({ eccDeg: L(level, 7, 22), flashMs: LL(level, 260, 50), arrowDeg: L(level, 0.8, 0.4), flashDeg: L(level, 1.2, 0.6) }),
  ladderText: (level) => t('drill.peripheral.ladder', { ecc: Math.round(L(level, 7, 22)), ms: Math.round(LL(level, 260, 50)) }),
  create(api) {
    let tr = null, step = 0, where = null;
    const sectorOf = (x, y) => { const a = Math.atan2(-(y - api.cy), x - api.cx); return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; };
    return {
      buttons: [{ id: 'L', label: '◀', aria: t('dir.left'), key: ['ArrowLeft'] }, { id: 'R', label: '▶', aria: t('dir.right'), key: ['ArrowRight'] }],
      buttonLayout: 'bottom',
      nextTrial(p) {
        const sector = api.rng.int(0, 7);
        const a = (sector * Math.PI) / 4;
        // eccentricity limited by the visible field in that direction
        const lim = Math.min(Math.abs(Math.cos(a)) > 1e-3 ? (api.wDeg / 2 - 1) / Math.abs(Math.cos(a)) : 1e9, Math.abs(Math.sin(a)) > 1e-3 ? (api.hDeg / 2 - 1) / Math.abs(Math.sin(a)) : 1e9);
        const ecc = Math.min(p.eccDeg, lim);
        return { ...p, sector, eccDeg: ecc, xDeg: Math.cos(a) * ecc, yDeg: Math.sin(a) * ecc, arrow: api.rng.chance(0.5) ? 'L' : 'R', foreMs: Math.round(api.rng.range(700, 1400)) };
      },
      start(trial, now) {
        tr = trial; step = 0; where = null;
        trial._onsetAt = now + trial.foreMs; trial._shown = null; trial._timeoutMs = trial.foreMs + 7000;
        api.enableButtons(false);
      },
      frame(ts, present) {
        if (!tr) return;
        const g = api.g;
        if (tr._shown === null && ts + api.clock.frameMs / 2 >= tr._onsetAt) tr._shown = present;
        const on = tr._shown !== null && present - tr._shown <= tr.flashMs;
        if (on) {
          disc(g, api.cx + api.deg(tr.xDeg), api.cy - api.deg(tr.yDeg), api.deg(tr.flashDeg) / 2, '#ffffff');
          text(g, tr.arrow === 'L' ? '◀' : '▶', api.cx, api.cy, { size: Math.max(10, api.deg(tr.arrowDeg)) });
        } else if (tr._shown === null) crosshair(g, api.cx, api.cy, 8, '#cfd6df');
        else {
          text(g, '■', api.cx, api.cy, { size: Math.max(10, api.deg(tr.arrowDeg) * 1.2), color: '#5d6b7c' }); // mask
          if (step === 0) text(g, t('drill.peripheral.tapWhere'), api.cx, api.cy + 40, { size: 15, color: '#93a3b8', weight: 500 });
          if (step === 1) text(g, t('drill.peripheral.centre'), api.cx, api.cy + 40, { size: 15, color: '#93a3b8', weight: 500 });
        }
      },
      onPointer(e) {
        if (!tr || tr._shown === null || step !== 0) return;
        where = { sector: sectorOf(e.x, e.y), rtMs: api.tapTime(e.ts) - tr._shown };
        step = 1;
        api.enableButtons(true);
      },
      onButton(id) {
        if (!tr || step !== 1) return;
        const r = { ...where, centre: id };
        tr = null;
        api.enableButtons(false);
        api.complete(r);
      },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        const sectorOk = r.sector === trial.sector;
        const fixationBreak = r.centre !== trial.arrow;
        return { correct: sectorOk && !fixationBreak, rtMs: r.rtMs, fixationBreak, sectorOk, note: fixationBreak ? t('drill.peripheral.break') : null };
      },
      summary(trials) {
        const br = trials.filter((x) => x.response.fixationBreak).length;
        return trials.length ? { extraValue: `${Math.round((100 * br) / trials.length)}%`, extraLabel: t('drill.peripheral.breaks') } : {};
      },
    };
  },
};
