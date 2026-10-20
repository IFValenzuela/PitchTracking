// Pitch Lab statistics shared by the end-of-block summary and the Progress page.
import { sdt, biasLabel, summarizeTrials, groupSummary } from '../../engine/scoring.js';
import { mean } from '../../engine/timing.js';

// Strike-call signal detection from Zone Call / Occlusion(zone) / Swing-Take trials.
export function strikeCallSDT(trials) {
  const c = { hits: 0, misses: 0, fas: 0, crs: 0 };
  for (const tr of trials) {
    const isStrike = tr.stimulus?.isStrike;
    let called;
    if (tr.mode === 'swing') called = tr.response?.decision === 'swing';
    else if (tr.response?.call === 'strike' || tr.response?.call === 'ball') called = tr.response.call === 'strike';
    else continue;
    if (isStrike === undefined) continue;
    if (isStrike) called ? c.hits++ : c.misses++;
    else called ? c.fas++ : c.crs++;
  }
  const s = sdt(c);
  return { ...c, ...s, bias: biasLabel(s) };
}

export function velocityBin(mph) { return `${Math.floor(mph / 5) * 5}`; }

export function occlusionBin(ft) { return `${Math.floor(ft / 5) * 5}`; }

export function summarizeLab(trials) {
  const base = summarizeTrials(trials);
  const swings = trials.filter((t) => t.mode === 'swing' && Number.isFinite(t.response?.timingErrMs));
  const errs = swings.map((t) => t.response.timingErrMs);
  const decisions = trials.filter((t) => t.mode === 'swing');
  const chases = decisions.filter((t) => !t.stimulus.isStrike);
  const zoneSwings = decisions.filter((t) => t.stimulus.isStrike);
  return {
    ...base,
    sdt: strikeCallSDT(trials),
    byType: groupSummary(trials, (t) => t.stimulus?.type),
    byRegion: groupSummary(trials, (t) => t.stimulus?.region),
    byVelo: groupSummary(trials, (t) => (t.stimulus?.mph ? velocityBin(t.stimulus.mph) : null)),
    byOcclusion: groupSummary(trials.filter((t) => t.mode === 'occlusion'), (t) => occlusionBin(t.stimulus.occlusionFt)),
    timing: errs.length ? {
      n: errs.length,
      meanErr: mean(errs),
      meanAbsErr: mean(errs.map(Math.abs)),
      earlyPct: (100 * errs.filter((e) => e < -15).length) / errs.length,
      latePct: (100 * errs.filter((e) => e > 15).length) / errs.length,
    } : null,
    decisions: decisions.length ? {
      n: decisions.length,
      correctPct: (100 * decisions.filter((t) => t.response.decisionCorrect).length) / decisions.length,
      chasePct: chases.length ? (100 * chases.filter((t) => t.response.decision === 'swing').length) / chases.length : NaN,
      zoneSwingPct: zoneSwings.length ? (100 * zoneSwings.filter((t) => t.response.decision === 'swing').length) / zoneSwings.length : NaN,
    } : null,
    locErrIn: mean(trials.filter((t) => Number.isFinite(t.response?.errIn)).map((t) => t.response.errIn)),
  };
}
