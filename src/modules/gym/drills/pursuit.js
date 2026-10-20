// Pursuit Trace: follow a moving ball with your eyes; mid-path it briefly shows
// a gap (Landolt C). Report the gap direction. Optional: trace it with a finger or
// mouse to get a tracking-error score.
import { t } from '../../../i18n/i18n.js';
import { landolt, baseball, disc } from '../draw.js';
import { L, LL, directionButtons } from './common.js';

function pathPoint(trial, f, api) {
  const A = trial.ampXDeg, B = trial.ampYDeg;
  switch (trial.path) {
    case 'line': return { x: -A + 2 * A * f, y: trial.yOffDeg };
    case 'sine': return { x: -A + 2 * A * f, y: trial.yOffDeg + B * Math.sin(f * Math.PI * 2 * trial.cycles) };
    case 'circle': { const a = f * Math.PI * 2 * trial.cycles + trial.phase; return { x: A * 0.6 * Math.cos(a), y: B * Math.sin(a) }; }
    default: { const a = f * Math.PI * 2 * trial.cycles; return { x: A * Math.sin(a + trial.phase), y: B * Math.sin(2 * a) }; } // lissajous
  }
}

export default {
  id: 'pursuit', skill: 'pursuit', nameKey: 'drill.pursuit.name', descKey: 'drill.pursuit.desc', howKey: 'drill.pursuit.how',
  defaultSeconds: 100, priority: 'core', strobeOk: true,
  stair: { start: 2 },
  ladder: (level) => ({ speedDeg: L(level, 7, 30), cueMs: LL(level, 450, 90), path: level < 6 ? 'line' : level < 11 ? 'sine' : level < 16 ? 'circle' : 'lissajous', sizeDeg: L(level, 1.4, 0.9) }),
  ladderText: (level) => t('drill.pursuit.ladder', { speed: Math.round(L(level, 7, 30)), ms: Math.round(LL(level, 450, 90)) }),
  create(api) {
    let tr = null;
    const track = [];
    return {
      buttons: directionButtons(),
      nextTrial(p) {
        const A = Math.max(3, api.wDeg / 2 - 2), B = Math.max(2, api.hDeg / 2 - 4);
        const trial = { ...p, ampXDeg: A, ampYDeg: B * 0.7, yOffDeg: api.rng.range(-0.3, 0.3) * B, cycles: p.path === 'sine' ? 1.5 : 1, phase: api.rng.range(0, 6.28), dir: api.rng.int(0, 3) };
        // estimate path length to set duration for the target speed
        let len = 0, prev = pathPoint(trial, 0, api);
        for (let i = 1; i <= 100; i++) { const q = pathPoint(trial, i / 100, api); len += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
        trial.durMs = Math.round((len / p.speedDeg) * 1000);
        trial.cueAtF = api.rng.range(0.35, 0.7);
        return trial;
      },
      start(trial, now) { tr = trial; track.length = 0; trial._t0 = now + 400; trial._timeoutMs = 400 + trial.durMs + 1800; },
      frame(ts, present) {
        if (!tr) return;
        const f = (present - tr._t0) / tr.durMs;
        if (f < 0) { const p0 = pathPoint(tr, 0, api); baseball(api.g, api.cx + api.deg(p0.x), api.cy - api.deg(p0.y), api.deg(tr.sizeDeg) / 2); return; }
        if (f > 1) return;
        const p = pathPoint(tr, f, api);
        const x = api.cx + api.deg(p.x), y = api.cy - api.deg(p.y);
        tr._pos = { x, y };
        const cueStart = tr.cueAtF * tr.durMs;
        const el = present - tr._t0;
        if (el >= cueStart && el <= cueStart + tr.cueMs) {
          disc(api.g, x, y, api.deg(tr.sizeDeg) / 2, '#f4f1ea');
          landolt(api.g, x, y, api.deg(tr.sizeDeg) * 0.8, tr.dir, '#111');
        } else baseball(api.g, x, y, api.deg(tr.sizeDeg) / 2);
      },
      onPointerMove(e) { if (tr?._pos && e.buttons) track.push(Math.hypot(e.x - tr._pos.x, e.y - tr._pos.y) / api.ppd); },
      onButton(id, ts) {
        if (!tr) return;
        const cueAt = tr._t0 + tr.cueAtF * tr.durMs;
        if (api.tapTime(ts) < cueAt) return; // answer only after the cue appeared
        const r = { dir: Number(id), rtMs: api.tapTime(ts) - cueAt, trackErrDeg: track.length ? track.reduce((a, b) => a + b, 0) / track.length : null };
        tr = null;
        api.complete(r);
      },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        return { correct: r.dir === trial.dir, rtMs: r.rtMs };
      },
    };
  },
};
