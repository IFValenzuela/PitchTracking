// Pitch Lab game modes. Each mode is a small strategy object used by the
// session controller (session.js):
//   stairKey(trialSeed)      → which staircase drives this trial
//   ladder(level, ctx)       → difficulty parameters for that level (0–20)
//   makeTrial(ctx)           → { pitches, truth, params, ... }
//   buttons(ctx)             → response buttons
//   evaluate(trial, resp, ctx) → { correct, ... }
// All difficulty variables (velocity, occlusion distance, pitch similarity,
// zone-edge proximity, response window, cue assist) come from the ladder.
import { t } from '../../i18n/i18n.js';
import { generatePitch, makePitcher, LEVEL_VELO, PITCH_TYPES, pitchRecord, divergenceDistance } from '../../engine/pitches.js';
import { crossingAt } from '../../engine/physics.js';
import { lerpLevel } from '../../engine/staircase.js';
import { isStrike, edgeDistanceIn, zoneRegion, sampleLocation } from '../../engine/zone.js';
import { timingGrade } from '../../engine/scoring.js';
import { IN, PLATE_FRONT_Y } from '../../engine/units.js';

export const MAX_LEVEL = 20;
export const CONTACT_Y = PLATE_FRONT_Y + 0.6; // ideal contact point, a little in front of the plate

export const TUNNEL_PAIRS = [['FF', 'CH'], ['FF', 'SL'], ['FF', 'CU'], ['SI', 'CH'], ['FF', 'FS'], ['SL', 'ST'], ['FC', 'SL'], ['SI', 'SL']];

const L = (level, a, b) => lerpLevel(level, MAX_LEVEL, a, b);

// Shared difficulty pieces.
function fbVelo(level, ctx) {
  const [lo, hi] = LEVEL_VELO[ctx.settings.profile.level] || LEVEL_VELO.hs;
  return L(level, lo, hi + 4);
}

export function cueFor(level, setting) {
  if (setting === 'on') return 1;
  if (setting === 'off') return 0;
  return Math.max(0, Math.min(1, 1 - level / 12));
}

function makePitcherFor(ctx, level) {
  const { cfg, rng } = ctx;
  const hand = cfg.hand === 'mix' ? rng.pick(['R', 'L']) : cfg.hand || 'R';
  const slot = cfg.slot === 'mix' ? rng.pick(['over', 'threeQuarter', 'low', 'side']) : cfg.slot || 'threeQuarter';
  const key = `${hand}|${slot}`;
  if (!ctx.pitcherCache || ctx.pitcherCache.key !== key) {
    ctx.pitcherCache = { key, base: makePitcher({ hand, slot, rng, rubberShift: rng.range(-0.6, 0.6), extension: rng.range(5.9, 6.8) }) };
  }
  return { ...ctx.pitcherCache.base, fbMph: fbVelo(level, ctx) };
}

function pitchFor(ctx, level, { type, strike, edgeMin, edgeMax, deception }) {
  const pitcher = makePitcherFor(ctx, level);
  const target = sampleLocation(ctx.rng, ctx.zone, { strike, edgeMin, edgeMax });
  return generatePitch({ pitcher, type, target, rng: ctx.rng, deception: ctx.cfg.deception ? 1 : deception });
}

function describe(pitch, zone) {
  const strike = isStrike(pitch.plate.x, pitch.plate.z, zone);
  return {
    ...pitchRecord(pitch),
    isStrike: strike,
    edgeIn: +edgeDistanceIn(pitch.plate.x, pitch.plate.z, zone).toFixed(2),
    region: zoneRegion(pitch.plate.x, pitch.plate.z, zone),
  };
}

const typeName = (k) => t(`pitch.${k}`);

// ---------------------------------------------------------------------------
const zoneCall = {
  id: 'zone',
  skill: 'zoneJudgment',
  stairKey: () => 'pl:zone',
  ladder(level, ctx) {
    return {
      fbMph: fbVelo(level, ctx),
      edgeMax: L(level, 10, 2.5), edgeMin: L(level, 3, 0),
      windowAfterMs: L(level, 1500, 150),
      deception: L(level, 0, 1),
      cue: cueFor(level, ctx.settings.prefs.cueAssist),
    };
  },
  makeTrial(ctx, level) {
    const p = this.ladder(level, ctx);
    const strike = ctx.rng.chance(0.5);
    const pitch = pitchFor(ctx, level, { type: ctx.rng.pick(ctx.cfg.types), strike, ...p });
    return { pitches: [pitch], params: p, truth: isStrike(pitch.plate.x, pitch.plate.z, ctx.zone) ? 'strike' : 'ball', deadlineAfterPlateMs: p.windowAfterMs, cue: p.cue };
  },
  buttons: () => [
    { id: 'ball', label: t('lab.ball'), key: ['f', 'ArrowLeft'], cls: 'ball' },
    { id: 'strike', label: t('lab.strike'), key: ['j', 'ArrowRight'], cls: 'strike' },
  ],
  evaluate(trial, resp) {
    if (!resp) return { correct: false, timeout: true };
    return { correct: resp.id === trial.truth, call: resp.id };
  },
  feedback(trial, res) {
    const truth = t(trial.truth === 'strike' ? 'lab.strike' : 'lab.ball');
    const e = Math.abs(trial.stim.edgeIn).toFixed(1);
    return { big: res.timeout ? t('train.tooSlow') : res.correct ? `${truth} ✓` : `${truth}`, sub: t(trial.stim.isStrike ? 'lab.edgeInside' : 'lab.edgeOutside', { n: e }) };
  },
};

// ---------------------------------------------------------------------------
const pitchId = {
  id: 'pid',
  skill: 'pitchRecognition',
  // Per pitch pair: truth type + a foil from the selected set.
  stairKey: (trial) => `pl:pid:${[trial.truthType, trial.foil].sort().join('|')}`,
  ladder(level, ctx) {
    return {
      fbMph: fbVelo(level, ctx),
      deception: L(level, 0, 1), // release-point tells fade out
      windowAfterMs: L(level, 2000, 300),
      cue: cueFor(level, ctx.settings.prefs.cueAssist),
      edgeMax: 12, edgeMin: 0,
    };
  },
  preTrial(ctx) {
    const truthType = ctx.rng.pick(ctx.cfg.types);
    const foil = ctx.rng.pick(ctx.cfg.types.filter((x) => x !== truthType));
    return { truthType, foil };
  },
  makeTrial(ctx, level, pre) {
    const p = this.ladder(level, ctx);
    const pitch = pitchFor(ctx, level, { type: pre.truthType, strike: ctx.rng.chance(0.55), ...p });
    return { pitches: [pitch], params: p, truth: pre.truthType, ...pre, deadlineAfterPlateMs: p.windowAfterMs, cue: p.cue };
  },
  buttons: (ctx) => ctx.cfg.types.map((k, i) => ({ id: k, label: typeName(k), key: [String(i + 1)] })),
  evaluate(trial, resp) {
    if (!resp) return { correct: false, timeout: true };
    return { correct: resp.id === trial.truth, call: resp.id };
  },
  feedback(trial, res) {
    const p = trial.pitches[0];
    return { big: res.timeout ? t('train.tooSlow') : res.correct ? `${typeName(trial.truth)} ✓` : typeName(trial.truth),
      sub: t('lab.pitchInfo', { mph: p.mph.toFixed(0), rpm: Math.round(p.rpm / 10) * 10, clock: p.clock }) };
  },
};

// ---------------------------------------------------------------------------
const swingTake = {
  id: 'swing',
  skill: 'zoneJudgment',
  stairKey: () => 'pl:swing',
  ladder(level, ctx) {
    return {
      fbMph: fbVelo(level, ctx),
      edgeMax: L(level, 10, 3), edgeMin: L(level, 2.5, 0),
      timingTolMs: L(level, 60, 18),
      deception: L(level, 0, 1),
      cue: cueFor(level, ctx.settings.prefs.cueAssist),
    };
  },
  makeTrial(ctx, level) {
    const p = this.ladder(level, ctx);
    const pitch = pitchFor(ctx, level, { type: ctx.rng.pick(ctx.cfg.types), strike: ctx.rng.chance(0.5), ...p });
    const contact = crossingAt(pitch.traj, CONTACT_Y);
    return { pitches: [pitch], params: p, truth: isStrike(pitch.plate.x, pitch.plate.z, ctx.zone) ? 'swing' : 'take', contactMs: contact.t * 1000, deadlineAfterPlateMs: 80, cue: p.cue, noResponseIs: 'take' };
  },
  buttons: () => [{ id: 'swing', label: t('lab.swing'), key: [' ', 'j'], keyLabel: t('lab.space'), cls: 'strike' }],
  evaluate(trial, resp, ctx) {
    const decision = resp ? 'swing' : 'take';
    const decisionCorrect = decision === trial.truth;
    if (!resp) return { correct: decisionCorrect, decision, decisionCorrect };
    const contactTap = resp.rtMs + ctx.settings.prefs.swingTimeMs; // when the bat arrives
    const timingErrMs = contactTap - trial.contactMs;
    const onTime = Math.abs(timingErrMs) <= trial.params.timingTolMs;
    return { correct: decisionCorrect && (trial.truth !== 'swing' || onTime), decision, decisionCorrect, timingErrMs, grade: timingGrade(timingErrMs), onTime };
  },
  feedback(trial, res) {
    if (res.decision === 'take') return { big: res.correct ? t('lab.goodTake') : t('lab.missedStrike'), sub: t(trial.stim.isStrike ? 'lab.edgeInside' : 'lab.edgeOutside', { n: Math.abs(trial.stim.edgeIn).toFixed(1) }) };
    if (!res.decisionCorrect) return { big: t('lab.chase'), sub: t('lab.edgeOutside', { n: Math.abs(trial.stim.edgeIn).toFixed(1) }) };
    return { big: t(`lab.timing.${res.grade}`), sub: t('lab.timingMs', { n: Math.round(Math.abs(res.timingErrMs)), dir: t(res.timingErrMs < 0 ? 'lab.early' : 'lab.late') }) };
  },
};

// ---------------------------------------------------------------------------
const locationCall = {
  id: 'location',
  skill: 'zoneJudgment',
  stairKey: () => 'pl:loc',
  respondAfterPitch: true,
  ladder(level, ctx) {
    return { fbMph: fbVelo(level, ctx), tolIn: L(level, 9, 2.5), deception: L(level, 0, 1), cue: cueFor(level, ctx.settings.prefs.cueAssist), edgeMax: 14, edgeMin: 0 };
  },
  makeTrial(ctx, level) {
    const p = this.ladder(level, ctx);
    const pitch = pitchFor(ctx, level, { type: ctx.rng.pick(ctx.cfg.types), strike: ctx.rng.chance(0.6), ...p });
    return { pitches: [pitch], params: p, truth: { x: pitch.plate.x, z: pitch.plate.z }, deadlineAfterPlateMs: 6000, cue: p.cue };
  },
  buttons: () => [],
  evaluate(trial, resp) {
    if (!resp?.loc) return { correct: false, timeout: true };
    const errIn = Math.hypot(resp.loc.x - trial.truth.x, resp.loc.z - trial.truth.z) / IN;
    return { correct: errIn <= trial.params.tolIn, errIn, loc: resp.loc, dxIn: (resp.loc.x - trial.truth.x) / IN, dzIn: (resp.loc.z - trial.truth.z) / IN };
  },
  feedback(trial, res) {
    if (res.timeout) return { big: t('train.tooSlow') };
    return { big: res.correct ? t('lab.locGood', { n: res.errIn.toFixed(1) }) : t('lab.locMiss', { n: res.errIn.toFixed(1) }), sub: t('lab.locTol', { n: trial.params.tolIn.toFixed(1) }) };
  },
};

// ---------------------------------------------------------------------------
// Occlusion: the ball disappears `occlusionFt` after release. Progression = earlier occlusion.
const occlusion = {
  id: 'occlusion',
  skill: 'pitchRecognition',
  stairKey: (trial, ctx) => `pl:occl:${ctx.cfg.occlTask || 'zone'}`,
  ladder(level, ctx) {
    const [lo, hi] = LEVEL_VELO[ctx.settings.profile.level] || LEVEL_VELO.hs;
    return {
      occlusionFt: L(level, 42, 5),
      fbMph: (lo + hi) / 2,
      edgeMax: 9, edgeMin: 1.5,
      windowAfterMs: 1500,
      deception: 0.6,
      cue: cueFor(level, ctx.settings.prefs.cueAssist),
    };
  },
  preTrial(ctx) {
    if (ctx.cfg.occlTask !== 'pid') return {};
    const truthType = ctx.rng.pick(ctx.cfg.types);
    return { truthType, foil: ctx.rng.pick(ctx.cfg.types.filter((x) => x !== truthType)) };
  },
  makeTrial(ctx, level, pre) {
    const p = this.ladder(level, ctx);
    const pid = ctx.cfg.occlTask === 'pid';
    const pitch = pitchFor(ctx, level, { type: pid ? pre.truthType : ctx.rng.pick(ctx.cfg.types), strike: ctx.rng.chance(0.5), ...p });
    const truth = pid ? pre.truthType : isStrike(pitch.plate.x, pitch.plate.z, ctx.zone) ? 'strike' : 'ball';
    return { pitches: [pitch], params: p, truth, ...pre, occlusionFt: p.occlusionFt, deadlineAfterPlateMs: p.windowAfterMs, cue: p.cue };
  },
  buttons(ctx) { return ctx.cfg.occlTask === 'pid' ? pitchId.buttons(ctx) : zoneCall.buttons(); },
  evaluate(trial, resp) {
    if (!resp) return { correct: false, timeout: true };
    return { correct: resp.id === trial.truth, call: resp.id };
  },
  feedback(trial, res) {
    const name = trial.truth === 'strike' || trial.truth === 'ball' ? t(`lab.${trial.truth}`) : typeName(trial.truth);
    return { big: res.timeout ? t('train.tooSlow') : res.correct ? `${name} ✓` : name, sub: t('lab.occludedAt', { n: trial.occlusionFt.toFixed(0) }) };
  },
};

// ---------------------------------------------------------------------------
// Tunnel Trainer: two pitches through the same tunnel point; name the second.
const tunnel = {
  id: 'tunnel',
  skill: 'pitchRecognition',
  stairKey: (trial) => `pl:tunnel:${trial.pair.join('|')}`,
  ladder(level, ctx) {
    return { tunnelToPlateFt: L(level, 46, 16), fbMph: fbVelo(Math.min(level, 14), ctx), deception: L(level, 0.5, 1), windowAfterMs: 1800, cue: cueFor(level, ctx.settings.prefs.cueAssist) };
  },
  preTrial(ctx) {
    const pairs = ctx.cfg.pairs?.length ? ctx.cfg.pairs : [TUNNEL_PAIRS[0]];
    return { pair: ctx.rng.pick(pairs) };
  },
  makeTrial(ctx, level, pre) {
    const p = this.ladder(level, ctx);
    const pitcher = makePitcherFor(ctx, level);
    const [a, b] = pre.pair;
    const firstType = ctx.rng.pick([a, b]);
    const secondType = ctx.rng.pick([a, b]);
    const target = sampleLocation(ctx.rng, ctx.zone, { strike: ctx.rng.chance(0.6), edgeMin: 0, edgeMax: 8 });
    const dec = ctx.cfg.deception ? 1 : p.deception;
    const first = generatePitch({ pitcher, type: firstType, target, rng: ctx.rng, deception: dec });
    const y = PLATE_FRONT_Y + p.tunnelToPlateFt;
    const at = crossingAt(first.traj, y);
    const second = secondType === firstType
      ? generatePitch({ pitcher, type: secondType, target: { x: target.x + ctx.rng.normal(0, 0.15), z: target.z + ctx.rng.normal(0, 0.15) }, rng: ctx.rng, deception: dec })
      : generatePitch({ pitcher, type: secondType, tunnel: { x: at.x, y, z: at.z }, rng: ctx.rng, deception: dec });
    const div = divergenceDistance(first, second);
    return { pitches: [first, second], params: p, truth: secondType, pair: pre.pair, firstType, tunnelY: y, tunnelPoint: [at.x, y, at.z], divergence: div, deadlineAfterPlateMs: p.windowAfterMs, cue: p.cue };
  },
  buttons(ctx, trial) { return (trial?.pair || TUNNEL_PAIRS[0]).map((k, i) => ({ id: k, label: typeName(k), key: [String(i + 1)] })); },
  evaluate(trial, resp) {
    if (!resp) return { correct: false, timeout: true };
    return { correct: resp.id === trial.truth, call: resp.id };
  },
  feedback(trial, res) {
    return { big: res.timeout ? t('train.tooSlow') : res.correct ? `${typeName(trial.truth)} ✓` : typeName(trial.truth),
      sub: t('lab.divergedAt', { n: trial.divergence.toPlate.toFixed(0) }) };
  },
};

export const MODES = { zone: zoneCall, pid: pitchId, swing: swingTake, location: locationCall, occlusion, tunnel };
export const MODE_IDS = Object.keys(MODES);

export { describe as describePitch, PITCH_TYPES };
