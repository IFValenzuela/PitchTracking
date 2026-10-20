// Eye Check scoring. Pure functions (unit-tested).
//
// Each skill has a performance index p (higher = better) computed from trials.
// Scores are relative to YOUR first Eye Check: score = 50 + 50·(p − p_first)/scale,
// clamped to 0–100. `scale` is the change we consider large (worth +50 points).
// Every score carries a standard error so re-tests can say whether a change is
// bigger than measurement noise.
import { thresholdEstimate } from '../../engine/staircase.js';
import { sdt, probit } from '../../engine/scoring.js';
import { median, mean, sd } from '../../engine/timing.js';
import { makeRng } from '../../engine/rng.js';

export const SKILLS = {
  pitchRecognition: { scale: 2.0, weight: 2 },
  zoneJudgment: { scale: 1.5, weight: 2 },
  anticipation: { scale: 0.7, weight: 1.5 },
  reaction: { scale: 0.25, weight: 1 },
  inhibition: { scale: 0.3, weight: 1 },
  dynamicAcuity: { scale: 8, weight: 1 },
  saccades: { scale: 8, weight: 1 },
  pursuit: { scale: 8, weight: 1 },
  contrast: { scale: 8, weight: 0.75 },
  depth: { scale: 8, weight: 0.5, optional: true },
};
export const SKILL_IDS = Object.keys(SKILLS);

export function bootstrapSE(xs, stat, B = 300, seed = 1) {
  if (xs.length < 3) return NaN;
  const rng = makeRng(seed);
  const vals = [];
  for (let b = 0; b < B; b++) {
    const s = [];
    for (let i = 0; i < xs.length; i++) s.push(xs[Math.floor(rng.next() * xs.length)]);
    const v = stat(s);
    if (Number.isFinite(v)) vals.push(v);
  }
  return sd(vals);
}

function stairMetric(stair) {
  if (!stair) return null;
  const rev = stair.reversals.slice(-6);
  const p = thresholdEstimate(stair);
  let se = rev.length >= 3 ? sd(rev) / Math.sqrt(rev.length) : 2.5;
  se = Math.max(0.75, Number.isFinite(se) ? se : 2.5);
  return { p, se, n: stair.trials, display: { level: p } };
}

/**
 * trials: logged trial records for this skill; stair: staircase state for adaptive tests.
 * Returns { p, se, n, display } or null if there is not enough data.
 */
export function computeMetric(skill, trials, stair) {
  switch (skill) {
    case 'reaction': {
      const rts = trials.filter((x) => x.correct && Number.isFinite(x.rtMs)).map((x) => x.rtMs);
      if (rts.length < 4) return null;
      const stat = (xs) => -Math.log(median(xs) / 1000);
      return { p: stat(rts), se: bootstrapSE(rts, stat), n: rts.length, display: { ms: median(rts) } };
    }
    case 'inhibition': {
      if (trials.length < 8) return null;
      // inverse efficiency: go-trial RT divided by overall accuracy (penalises false starts)
      const goRts = trials.filter((x) => x.stimulus?.go && x.correct && Number.isFinite(x.rtMs)).map((x) => x.rtMs);
      const stat = (ts) => {
        // floors keep the index finite when nothing was answered correctly
        const acc = Math.max(0.05, ts.filter((x) => x.correct).length / ts.length);
        const rt = mean(ts.filter((x) => x.stimulus?.go && x.correct && Number.isFinite(x.rtMs)).map((x) => x.rtMs));
        return -Math.log((Number.isFinite(rt) ? rt : 1000) / 1000 / acc);
      };
      const nogo = trials.filter((x) => !x.stimulus?.go);
      return { p: stat(trials), se: bootstrapSE(trials, stat), n: trials.length,
        display: { ms: mean(goRts), commissionPct: nogo.length ? (100 * nogo.filter((x) => !x.correct).length) / nogo.length : NaN } };
    }
    case 'anticipation': {
      // a tap more than 500 ms off is a miss, not a timing estimate: cap its influence
      const errs = trials.filter((x) => Number.isFinite(x.errorMs)).map((x) => Math.min(500, Math.abs(x.errorMs)));
      if (errs.length < 4) return null;
      const stat = (xs) => -Math.log(mean(xs) / 1000);
      return { p: stat(errs), se: bootstrapSE(errs, stat), n: errs.length, display: { ms: mean(errs) } };
    }
    case 'pitchRecognition': {
      const n = trials.length;
      if (n < 6) return null;
      const k = trials.filter((x) => x.correct).length;
      const pc = (k + 0.5) / (n + 1);
      return { p: Math.log(pc / (1 - pc)), se: Math.sqrt(1 / ((n + 1) * pc * (1 - pc))), n, display: { pct: (100 * k) / n } };
    }
    case 'zoneJudgment': {
      const c = { hits: 0, misses: 0, fas: 0, crs: 0 };
      for (const x of trials) {
        const strike = x.stimulus?.isStrike, call = x.response?.call;
        if (strike === undefined || !call) { if (strike) c.misses++; else if (strike === false) c.crs++; continue; }
        if (strike) call === 'strike' ? c.hits++ : c.misses++;
        else call === 'strike' ? c.fas++ : c.crs++;
      }
      const s = sdt(c);
      if (s.n < 6) return null;
      const nS = c.hits + c.misses, nN = c.fas + c.crs;
      const H = (c.hits + 0.5) / (nS + 1), F = (c.fas + 0.5) / (nN + 1);
      const phi = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
      const se = Math.sqrt((H * (1 - H)) / ((nS + 1) * phi(probit(H)) ** 2) + (F * (1 - F)) / ((nN + 1) * phi(probit(F)) ** 2));
      return { p: s.dprime, se, n: s.n, display: { dprime: s.dprime, pct: (100 * (c.hits + c.crs)) / s.n, c: s.c } };
    }
    default:
      return stairMetric(stair);
  }
}

export function normalize(raw, base, skill) {
  const { scale } = SKILLS[skill];
  const score = Math.max(0, Math.min(100, 50 + (50 * (raw.p - base.p)) / scale));
  // Floor of 2 points: no test is more precise than that between sessions.
  const sePts = Math.max(2, (50 * (Number.isFinite(raw.se) ? raw.se : scale / 2)) / scale);
  return { score, sePts };
}

// Earliest p for each skill across assessments (sorted by time) = personal baseline.
export function baselinesFrom(assessments) {
  const base = {};
  for (const a of [...assessments].sort((x, y) => x.at - y.at)) {
    for (const [skill, raw] of Object.entries(a.raw || {})) if (raw && Number.isFinite(raw.p) && !(skill in base)) base[skill] = raw;
  }
  return base;
}

export function scoreAssessment(raw, baselines) {
  const scores = {};
  let wsum = 0, acc = 0, varAcc = 0;
  for (const skill of SKILL_IDS) {
    const r = raw[skill];
    if (!r || !Number.isFinite(r.p)) continue;
    const base = baselines[skill] || r;
    scores[skill] = normalize(r, base, skill);
    const w = SKILLS[skill].weight;
    wsum += w; acc += w * scores[skill].score; varAcc += (w * scores[skill].sePts) ** 2;
  }
  return { scores, composite: wsum ? acc / wsum : NaN, compositeSE: wsum ? Math.sqrt(varAcc) / wsum : NaN };
}

// Classifies a change as a real improvement/decline or within measurement noise (95 %).
export function compareScore(prev, cur) {
  if (!prev || !cur) return null;
  const delta = cur.score - prev.score;
  const se = Math.sqrt(prev.sePts ** 2 + cur.sePts ** 2);
  return { delta, se, verdict: Math.abs(delta) > 1.96 * se ? (delta > 0 ? 'up' : 'down') : 'noise' };
}
