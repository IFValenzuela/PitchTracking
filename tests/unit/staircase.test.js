import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStaircase, updateStaircase, thresholdEstimate, targetPercent, lerpLevel } from '../../src/engine/staircase.js';
import { makeRng } from '../../src/engine/rng.js';

// Simulated observer: logistic psychometric function over level with guess and lapse rates.
function observer(threshold, slope = 1.2, guess = 0.5, lapse = 0.02) {
  return (level) => guess + (1 - guess - lapse) / (1 + Math.exp((level - threshold) / slope));
}
// Level at which the observer is correct with probability p.
function levelForP(threshold, p, slope = 1.2, guess = 0.5, lapse = 0.02) {
  return threshold + slope * Math.log((1 - guess - lapse) / (p - guess) - 1);
}

test('2-down/1-up converges near the 70.7 % point', () => {
  const ests = [];
  for (let seed = 1; seed <= 40; seed++) {
    const rng = makeRng(seed);
    const obs = observer(10);
    let s = createStaircase({ start: 2, max: 20 });
    for (let i = 0; i < 120; i++) s = updateStaircase(s, rng.next() < obs(s.level));
    ests.push(thresholdEstimate(s));
  }
  const mean = ests.reduce((a, b) => a + b, 0) / ests.length;
  const target = levelForP(10, 0.707);
  assert.ok(Math.abs(mean - target) < 1.0, `mean estimate ${mean.toFixed(2)} vs ${target.toFixed(2)}`);
});

test('3-down/1-up converges higher on the psychometric curve than 2-down/1-up', () => {
  const run = (down) => {
    let tot = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const rng = makeRng(seed * 7);
      const obs = observer(10);
      let s = createStaircase({ start: 2, down });
      for (let i = 0; i < 150; i++) s = updateStaircase(s, rng.next() < obs(s.level));
      tot += thresholdEstimate(s);
    }
    return tot / 30;
  };
  assert.ok(run(3) < run(2), '3-down targets a higher % correct, i.e. an easier level');
  assert.ok(Math.abs(targetPercent(2) - 70.71) < 0.01);
});

test('staircase tracks a better and a worse simulated hitter', () => {
  const est = (thr) => {
    const rng = makeRng(99);
    let s = createStaircase({ start: 5 });
    for (let i = 0; i < 150; i++) s = updateStaircase(s, rng.next() < observer(thr)(s.level));
    return thresholdEstimate(s);
  };
  assert.ok(est(14) - est(6) > 5);
});

test('bounds, step halving and reversal bookkeeping', () => {
  let s = createStaircase({ min: 0, max: 4, start: 0, step: 2, minStep: 0.5 });
  for (let i = 0; i < 20; i++) s = updateStaircase(s, true);
  assert.equal(s.level, 4);
  s = updateStaircase(s, false);
  assert.equal(s.reversals.length, 1);
  s = updateStaircase(s, true); s = updateStaircase(s, true);
  assert.equal(s.reversals.length, 2);
  assert.equal(s.step, 1);
  for (let i = 0; i < 30; i++) s = updateStaircase(s, false);
  assert.equal(s.level, 0);
  assert.ok(s.step >= 0.5);
});

test('state is plain JSON (storable)', () => {
  let s = createStaircase();
  s = updateStaircase(s, true);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('lerpLevel clamps', () => {
  assert.equal(lerpLevel(-5, 20, 10, 30), 10);
  assert.equal(lerpLevel(10, 20, 10, 30), 20);
  assert.equal(lerpLevel(25, 20, 10, 30), 30);
});
