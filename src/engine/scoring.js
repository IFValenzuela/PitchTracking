// Scoring helpers: signal detection (bias), timing grades, summaries, standard errors.
import { mean, median } from './timing.js';

// Inverse standard normal CDF (Acklam's approximation).
export function probit(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Signal detection for strike calls. "Signal" = true strike.
 *  hits: strikes called strike; misses: strikes called ball;
 *  fas: balls called strike; crs: balls called ball.
 * Log-linear correction keeps d′ finite. c < 0 → liberal (over-calls strikes /
 * swings too much); c > 0 → conservative (over-calls balls / takes too much).
 */
export function sdt({ hits = 0, misses = 0, fas = 0, crs = 0 }) {
  const nS = hits + misses, nN = fas + crs;
  const H = (hits + 0.5) / (nS + 1), F = (fas + 0.5) / (nN + 1);
  const zH = probit(H), zF = probit(F);
  return { n: nS + nN, hitRate: nS ? hits / nS : NaN, faRate: nN ? fas / nN : NaN, dprime: zH - zF, c: -(zH + zF) / 2 };
}

// Bias label from c, with a minimum sample size before saying anything.
export function biasLabel({ c, n }, { minN = 20, threshold = 0.2 } = {}) {
  if (!n || n < minN) return 'thin';
  if (c < -threshold) return 'strikes'; // over-calls strikes / chases
  if (c > threshold) return 'balls'; // over-calls balls / too passive
  return 'balanced';
}

// Swing timing error (ms): negative = early, positive = late.
export function timingGrade(errMs) {
  const a = Math.abs(errMs);
  if (a <= 15) return 'perfect';
  if (a <= 35) return errMs < 0 ? 'slightlyEarly' : 'slightlyLate';
  return errMs < 0 ? 'early' : 'late';
}

// Standard error of a proportion and of a mean.
export function seProportion(k, n) { if (!n) return NaN; const p = k / n; return Math.sqrt((p * (1 - p)) / n) || 0.5 / n; }

export function seMean(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
}

// Accuracy and reaction-time summary of a list of trials {correct, rtMs}.
export function summarizeTrials(trials) {
  const n = trials.length;
  const k = trials.filter((t) => t.correct).length;
  const rts = trials.filter((t) => Number.isFinite(t.rtMs) && t.rtMs > 0).map((t) => t.rtMs);
  return { n, correct: k, accuracy: n ? k / n : NaN, accSE: seProportion(k, n), meanRt: mean(rts), medianRt: median(rts) };
}

// Groups trials by key function and summarises each group.
export function groupSummary(trials, keyFn) {
  const groups = new Map();
  for (const t of trials) {
    const k = keyFn(t);
    if (k === undefined || k === null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  return [...groups.entries()].map(([key, ts]) => ({ key, ...summarizeTrials(ts) }));
}

// Two-proportion z-test (used for the honesty checks on real-game data).
export function twoProportionZ(k1, n1, k2, n2) {
  if (!n1 || !n2) return { z: NaN, p: NaN };
  const p1 = k1 / n1, p2 = k2 / n2, p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return { z: 0, p: 1, diff: p2 - p1 };
  const z = (p2 - p1) / se;
  return { z, p: 2 * (1 - normCdf(Math.abs(z))), diff: p2 - p1 };
}

export function normCdf(x) {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
