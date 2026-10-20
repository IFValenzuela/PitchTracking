// Eye Check: the ~8-minute baseline battery. Each test runs a drill (or a Pitch Lab
// block) with feedback off and a fresh, non-persistent staircase, then the results
// are normalised against the user's own first Eye Check.
import { app } from '../../app.js';
import { uid } from '../../data/repo.js';
import { DRILLS } from '../gym/registry.js';
import { runDrill } from '../gym/runner.js';
import { PitchLabSession } from '../pitchlab/session.js';
import { computeMetric, scoreAssessment, baselinesFrom } from './metrics.js';
import { StairBank } from '../stairs.js';

const EYE_TYPES = ['FF', 'SL', 'CH', 'CU'];

export const EYE_TESTS = [
  { skill: 'reaction', drill: 'reaction', trials: 10, estSec: 30 },
  { skill: 'zoneJudgment', lab: { mode: 'zone', types: EYE_TYPES, hand: 'R', slot: 'threeQuarter', count: 16 }, fixedLevel: 8, estSec: 60 },
  { skill: 'dynamicAcuity', drill: 'dynamicAcuity', trials: 18, estSec: 60 },
  { skill: 'pitchRecognition', lab: { mode: 'pid', types: EYE_TYPES, hand: 'R', slot: 'threeQuarter', count: 16 }, fixedLevel: 6, estSec: 60 },
  { skill: 'anticipation', drill: 'anticipation', trials: 12, fixedLevel: 6, estSec: 40 },
  { skill: 'inhibition', drill: 'gonogo', trials: 24, fixedLevel: 8, estSec: 45 },
  { skill: 'saccades', drill: 'saccadeId', trials: 16, estSec: 50 },
  { skill: 'pursuit', drill: 'pursuit', trials: 10, estSec: 50 },
  { skill: 'contrast', drill: 'contrast', trials: 18, estSec: 50 },
  { skill: 'depth', drill: 'depth', trials: 16, optional: true, estSec: 60 },
];

export const RETEST_DAYS = 21;

export class EyeCheckRun {
  constructor({ includeDepth = false } = {}) {
    this.id = uid('a_');
    this.tests = EYE_TESTS.filter((x) => !x.optional || includeDepth);
    this.results = {}; // skill → {raw, sessionId}
    this.startedAt = Date.now();
    this.index = 0;
  }

  get current() { return this.tests[this.index]; }

  get done() { return this.index >= this.tests.length; }

  skip() { this.index++; }

  // Runs the current test; returns true if completed (not stopped).
  async runCurrent({ first }) {
    const test = this.current;
    const cap = app.testTrialCap || Infinity; // e2e tests shorten the battery
    let trials = [], stair = null, stopped = false;
    if (test.lab) {
      const res = await new PitchLabSession({ ...test.lab, count: Math.min(test.lab.count, cap) }, { fixedLevel: test.fixedLevel, feedback: false, sessionKind: 'eyecheck', module: 'eyecheck', assessmentId: this.id, skipChecks: !first, summaryPanel: false }).run();
      if (!res) return false;
      trials = res.trials; stopped = res.stopped;
    } else {
      const bank = new StairBank(DRILLS[test.drill].stair, { persist: false });
      const res = await runDrill(DRILLS[test.drill], { trials: Math.min(test.trials, cap), fixedLevel: test.fixedLevel, feedback: false, module: 'eyecheck', persist: false, bank, assessmentId: this.id, skipChecks: !first, summaryPanel: false });
      if (!res) return false;
      trials = res.trials; stair = res.stair; stopped = res.stopped;
    }
    if (stopped) return false;
    this.results[test.skill] = computeMetric(test.skill, trials, stair);
    this.index++;
    return true;
  }

  async finish() {
    const prev = await app.repo.listAssessments();
    const raw = Object.fromEntries(Object.entries(this.results).filter(([, v]) => v));
    const baselines = baselinesFrom([...prev, { at: this.startedAt, raw }]);
    const { scores, composite, compositeSE } = scoreAssessment(raw, baselines);
    const record = {
      id: this.id, at: this.startedAt, finishedAt: Date.now(), durationMs: Date.now() - this.startedAt,
      raw, scores, composite, compositeSE, baseline: prev.length === 0,
      profileLevel: app.repo.settings.profile.level,
      calibration: { ...app.repo.settings.calibration },
    };
    await app.repo.saveAssessment(record);
    return record;
  }
}

// Recompute every assessment's scores against the current baselines (used by Progress).
export function rescoreAll(assessments) {
  const baselines = baselinesFrom(assessments);
  return assessments.map((a) => ({ ...a, ...scoreAssessment(a.raw || {}, baselines) }));
}
