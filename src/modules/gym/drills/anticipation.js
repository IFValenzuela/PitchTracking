// Anticipation timing (coincidence timing): a light sweeps along an LED track;
// tap exactly when it reaches the target. Later levels hide the end of the track.
// Variant "motion": swing the phone like a bat instead of tapping (device motion).
import { t } from '../../../i18n/i18n.js';
import { disc, ring } from '../draw.js';
import { L, isTapKey } from './common.js';

const N = 32;
export const SWING_THRESHOLD_DPS = 280; // rotation rate that counts as a swing

export default {
  id: 'anticipation', skill: 'anticipation', nameKey: 'drill.anticipation.name', descKey: 'drill.anticipation.desc', howKey: 'drill.anticipation.how',
  defaultSeconds: 90, priority: 'core', strobeOk: true,
  stair: { start: 2 },
  ladder: (level) => ({ traverseMs: L(level, 1800, 520), occlude: L(level, 0, 0.6), tolMs: L(level, 70, 18) }),
  ladderText: (level) => t('drill.anticipation.ladder', { tol: Math.round(L(level, 70, 18)), occ: Math.round(L(level, 0, 0.6) * 100) }),
  create(api, variant) {
    let tr = null;
    const motion = variant === 'motion';
    let lastSwing = 0;
    const onMotion = (e) => {
      const r = e.rotationRate;
      if (!r) return;
      const mag = Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0);
      if (mag > SWING_THRESHOLD_DPS && e.timeStamp - lastSwing > 600) { lastSwing = e.timeStamp; respond(e.timeStamp); }
    };
    if (motion) window.addEventListener('devicemotion', onMotion);
    const respond = (raw) => {
      if (!tr || !tr._start) return;
      const ts = api.tapTime(raw);
      const r = { errorMs: ts - tr._arrive };
      tr = null;
      api.complete(r);
    };
    const geom = () => { const x0 = api.w * 0.1, x1 = api.w * 0.9; return { x0, x1, y: api.cy, step: (x1 - x0) / (N - 1), r: Math.min(api.deg(0.35), (x1 - x0) / (N - 1) * 0.38) }; };
    return {
      nextTrial: (p) => ({ ...p, foreMs: Math.round(api.rng.range(500, 1200)), motion }),
      start(trial, now) {
        tr = trial;
        trial._start = now + trial.foreMs;
        trial._arrive = trial._start + trial.traverseMs;
        trial._timeoutMs = trial.foreMs + trial.traverseMs + 700;
      },
      frame(ts, present) {
        const g = api.g, G = geom();
        const lastVisible = tr ? Math.floor((1 - tr.occlude) * (N - 1)) : N - 1;
        for (let k = 0; k < N; k++) disc(g, G.x0 + k * G.step, G.y, G.r, k > lastVisible ? '#0d1218' : '#1d2732');
        ring(g, G.x1, G.y, G.r * 1.9, '#ffd34d', 3);
        if (!tr) return;
        const p = ((present - tr._start) / tr.traverseMs) * (N - 1);
        const k = Math.round(p);
        if (p >= 0 && k <= lastVisible && k < N) disc(g, G.x0 + k * G.step, G.y, G.r * 1.15, '#ff4d4d');
      },
      onPointer: (e) => respond(e.ts),
      onKey: (e, ts) => { if (isTapKey(e)) respond(ts); },
      score(trial, r) {
        if (!r) return { correct: false, note: t('drill.missed') };
        const e = r.errorMs;
        return { correct: Math.abs(e) <= trial.tolMs, errorMs: e, note: t(e < 0 ? 'drill.msEarly' : 'drill.msLate', { n: Math.round(Math.abs(e)) }) };
      },
      summary(trials) {
        const errs = trials.filter((x) => Number.isFinite(x.errorMs)).map((x) => Math.abs(x.errorMs));
        return errs.length ? { extraValue: `${Math.round(errs.reduce((a, b) => a + b, 0) / errs.length)} ms`, extraLabel: t('drill.anticipation.mae') } : {};
      },
      dispose() { if (motion) window.removeEventListener('devicemotion', onMotion); },
      iti: () => 350,
    };
  },
};

// iOS needs explicit permission for motion sensors (must be called from a tap).
export async function requestMotionPermission() {
  const DME = globalThis.DeviceMotionEvent;
  if (!DME) return false;
  if (typeof DME.requestPermission === 'function') {
    try { return (await DME.requestPermission()) === 'granted'; } catch { return false; }
  }
  return true;
}
