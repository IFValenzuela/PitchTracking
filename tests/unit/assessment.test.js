import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetric, normalize, scoreAssessment, baselinesFrom, compareScore, SKILLS } from '../../src/modules/assessment/metrics.js';
import { createStaircase, updateStaircase } from '../../src/engine/staircase.js';
import { makeRng } from '../../src/engine/rng.js';

const rtTrials = (ms) => ms.map((rtMs) => ({ correct: true, rtMs }));

test('first assessment scores exactly 50 on every skill', () => {
  const raw = {
    reaction: computeMetric('reaction', rtTrials([280, 300, 310, 290, 305, 295])),
    pitchRecognition: computeMetric('pitchRecognition', Array.from({ length: 16 }, (_, i) => ({ correct: i % 3 !== 0 }))),
  };
  const { scores, composite } = scoreAssessment(raw, baselinesFrom([{ at: 1, raw }]));
  assert.equal(scores.reaction.score, 50);
  assert.equal(scores.pitchRecognition.score, 50);
  assert.equal(composite, 50);
});

test('faster reactions and better accuracy raise scores; scores stay in 0–100', () => {
  const base = { reaction: computeMetric('reaction', rtTrials([300, 300, 310, 290, 305, 295])) };
  const faster = computeMetric('reaction', rtTrials([240, 250, 245, 255, 250, 248]));
  const slower = computeMetric('reaction', rtTrials([600, 620, 640, 610, 650, 630]));
  assert.ok(normalize(faster, base.reaction, 'reaction').score > 60);
  assert.equal(normalize(slower, base.reaction, 'reaction').score, 0);
});

test('zone judgment uses d-prime and its standard error shrinks with more trials', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ stimulus: { isStrike: i % 2 === 0 }, response: { call: i % 5 === 0 ? (i % 2 === 0 ? 'ball' : 'strike') : (i % 2 === 0 ? 'strike' : 'ball') } }));
  const a = computeMetric('zoneJudgment', mk(16)), b = computeMetric('zoneJudgment', mk(64));
  assert.ok(a.p > 0.5 && b.se < a.se);
});

test('staircase skills use the threshold estimate with a floor on SE', () => {
  const rng = makeRng(2);
  let s = createStaircase();
  for (let i = 0; i < 30; i++) s = updateStaircase(s, rng.next() < (s.level < 8 ? 0.9 : 0.4));
  const m = computeMetric('dynamicAcuity', [], s);
  assert.ok(m.p > 3 && m.p < 13 && m.se >= 0.75);
});

test('changes are only called real when beyond measurement noise', () => {
  assert.equal(compareScore({ score: 50, sePts: 5 }, { score: 54, sePts: 5 }).verdict, 'noise');
  assert.equal(compareScore({ score: 50, sePts: 3 }, { score: 65, sePts: 3 }).verdict, 'up');
  assert.equal(compareScore({ score: 50, sePts: 3 }, { score: 35, sePts: 3 }).verdict, 'down');
});

test('baselines come from the earliest assessment containing each skill', () => {
  const b = baselinesFrom([{ at: 5, raw: { depth: { p: 9 } } }, { at: 1, raw: { reaction: { p: 1 } } }, { at: 9, raw: { reaction: { p: 2 }, depth: { p: 11 } } }]);
  assert.equal(b.reaction.p, 1);
  assert.equal(b.depth.p, 9);
});

test('core baseball skills carry the most composite weight; depth is optional', () => {
  assert.ok(SKILLS.pitchRecognition.weight >= SKILLS.dynamicAcuity.weight * 2);
  assert.ok(SKILLS.depth.optional);
});

test('degenerate inputs still give finite, bounded results', () => {
  const allWrongGo = Array.from({ length: 10 }, (_, i) => ({ correct: false, stimulus: { go: i % 4 !== 0 } }));
  const m = computeMetric('inhibition', allWrongGo);
  assert.ok(Number.isFinite(m.p));
  const wild = computeMetric('anticipation', [{ errorMs: -2200 }, { errorMs: 30 }, { errorMs: -20 }, { errorMs: 2500 }]);
  assert.ok(wild.display.ms <= 500);
  const r = scoreAssessment({ reaction: { p: NaN } }, {});
  assert.deepEqual(r.scores, {});
});
