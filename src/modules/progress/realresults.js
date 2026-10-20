// Real Results Log analysis. Pure functions (unit-tested).
//
// The app may only say real-game performance changed when the user's own logged
// numbers show a change bigger than chance (two-proportion test, p < 0.05) with
// enough data in both periods. Otherwise it says the data are too thin or that
// there is no clear change. Even a real change is not proof that training caused it.
import { twoProportionZ } from '../../engine/scoring.js';

// metric: numerator field, denominator field, whether lower is better, minimum denominator per period
export const REAL_METRICS = {
  chase: { num: 'chases', den: 'outsidePitches', lowerBetter: true, minDen: 60 },
  decision: { num: 'goodDecisions', den: 'decisions', lowerBetter: false, minDen: 60 },
  k: { num: 'k', den: 'pa', lowerBetter: true, minDen: 40 },
  bb: { num: 'bb', den: 'pa', lowerBetter: false, minDen: 40 },
  hardHit: { num: 'hardHit', den: 'bip', lowerBetter: false, minDen: 25 },
};
export const MIN_ENTRIES = 3;

export function sumField(entries, f) { return entries.reduce((a, e) => a + (Number(e[f]) || 0), 0); }

export function rate(entries, key) {
  const m = REAL_METRICS[key];
  const den = sumField(entries, m.den);
  return den ? sumField(entries, m.num) / den : NaN;
}

/**
 * Compares a "before" period with a "recent" period.
 * trainingStart: date (YYYY-MM-DD) of the first training session. Entries before it
 * form the baseline; otherwise the earliest half of the log does.
 */
export function analyzeRealResults(entries, trainingStart) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  let before = trainingStart ? sorted.filter((e) => e.date < trainingStart) : [];
  let after = trainingStart ? sorted.filter((e) => e.date >= trainingStart) : [];
  let split = 'training';
  if (before.length < MIN_ENTRIES) {
    const half = Math.floor(sorted.length / 2);
    before = sorted.slice(0, half);
    after = sorted.slice(half);
    split = 'halves';
  }
  const metrics = {};
  for (const [key, m] of Object.entries(REAL_METRICS)) {
    const n1 = sumField(before, m.den), n2 = sumField(after, m.den);
    const k1 = sumField(before, m.num), k2 = sumField(after, m.num);
    if (!n1 && !n2) { metrics[key] = { verdict: 'none' }; continue; }
    const thin = before.length < MIN_ENTRIES || after.length < MIN_ENTRIES || n1 < m.minDen || n2 < m.minDen;
    const zt = twoProportionZ(k1, n1, k2, n2);
    let verdict = 'thin';
    if (!thin) {
      if (zt.p < 0.05) verdict = (zt.diff < 0) === m.lowerBetter ? 'better' : 'worse';
      else verdict = 'noChange';
    }
    metrics[key] = { verdict, before: n1 ? k1 / n1 : NaN, after: n2 ? k2 / n2 : NaN, n1, n2, p: zt.p };
  }
  const verdicts = Object.values(metrics).map((x) => x.verdict).filter((v) => v !== 'none');
  let overall = 'thin';
  if (verdicts.includes('better')) overall = 'someBetter';
  else if (verdicts.some((v) => v === 'noChange' || v === 'worse')) overall = verdicts.includes('worse') ? 'someWorse' : 'noChange';
  return { split, before: before.length, after: after.length, metrics, overall };
}

// Groups minutes of training per ISO week (Monday) for plotting next to real results.
export function weeklyMinutes(usageByDay) {
  const out = {};
  for (const [day, ms] of Object.entries(usageByDay || {})) {
    const d = new Date(`${day}T12:00:00`);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    const wk = d.toISOString().slice(0, 10);
    out[wk] = (out[wk] || 0) + ms / 60000;
  }
  return Object.entries(out).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([week, min]) => ({ week, min }));
}

// Consecutive days with any training, ending today (or yesterday).
export function streakDays(usageByDay, today = new Date()) {
  const has = (d) => (usageByDay?.[d.toISOString().slice(0, 10)] || usageByDay?.[localKey(d)] || 0) > 0;
  const d = new Date(today);
  if (!has(d)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (has(d)) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function localKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
