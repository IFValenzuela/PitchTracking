import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, MODE_IDS, cueFor } from '../../src/modules/pitchlab/modes.js';
import { defaultSettings } from '../../src/data/defaults.js';
import { strikeZone, isStrike } from '../../src/engine/zone.js';
import { makeRng } from '../../src/engine/rng.js';
import { summarizeLab, strikeCallSDT } from '../../src/modules/pitchlab/stats.js';

const settings = defaultSettings();
const ctxFor = (cfg, seed = 5) => ({ cfg: { types: ['FF', 'SL', 'CH'], hand: 'R', slot: 'threeQuarter', occlTask: 'zone', pairs: [['FF', 'CH']], ...cfg }, settings, zone: strikeZone(72), rng: makeRng(seed) });

test('every mode builds valid trials at the easiest and hardest level', () => {
  for (const id of MODE_IDS) {
    const mode = MODES[id];
    for (const level of [0, 20]) {
      const ctx = ctxFor({ mode: id });
      const pre = mode.preTrial?.(ctx) || {};
      const key = mode.stairKey(pre, ctx);
      assert.match(key, /^pl:/);
      const trial = mode.makeTrial(ctx, level, pre);
      assert.ok(trial.pitches.length >= 1);
      for (const p of trial.pitches) assert.ok(p.flightMs > 300 && p.flightMs < 800, `${id} flight ${p.flightMs}`);
      assert.ok(mode.buttons(ctx, trial).length >= (id === 'location' ? 0 : 1));
    }
  }
});

test('difficulty increases with level in every dimension', () => {
  const ctx = ctxFor({});
  const z0 = MODES.zone.ladder(0, ctx), z20 = MODES.zone.ladder(20, ctx);
  assert.ok(z20.fbMph > z0.fbMph && z20.edgeMax < z0.edgeMax && z20.windowAfterMs < z0.windowAfterMs && z20.deception > z0.deception && z20.cue <= z0.cue);
  const o0 = MODES.occlusion.ladder(0, ctx), o20 = MODES.occlusion.ladder(20, ctx);
  assert.ok(o0.occlusionFt >= 40 && o20.occlusionFt <= 6, 'occlusion runs ~42 ft → 5 ft');
  const t0 = MODES.tunnel.ladder(0, ctx), t20 = MODES.tunnel.ladder(20, ctx);
  assert.ok(t20.tunnelToPlateFt < t0.tunnelToPlateFt);
  assert.ok(MODES.location.ladder(20, ctx).tolIn < MODES.location.ladder(0, ctx).tolIn);
  assert.ok(MODES.swing.ladder(20, ctx).timingTolMs < MODES.swing.ladder(0, ctx).timingTolMs);
  assert.equal(cueFor(0, 'auto'), 1);
  assert.equal(cueFor(15, 'auto'), 0);
  assert.equal(cueFor(15, 'on'), 1);
});

test('zone trials near the edge at high levels', () => {
  const ctx = ctxFor({}, 9);
  for (let i = 0; i < 10; i++) {
    const tr = MODES.zone.makeTrial(ctx, 20);
    const p = tr.pitches[0];
    const strike = isStrike(p.plate.x, p.plate.z, ctx.zone);
    assert.equal(tr.truth, strike ? 'strike' : 'ball');
  }
});

test('pitch ID staircases are keyed per pitch pair', () => {
  const ctx = ctxFor({ types: ['FF', 'SL'] });
  const pre = MODES.pid.preTrial(ctx);
  assert.equal(MODES.pid.stairKey(pre, ctx), 'pl:pid:FF|SL');
});

test('swing scoring: decision and timing', () => {
  const ctx = ctxFor({});
  const trial = { truth: 'swing', contactMs: 420, params: { timingTolMs: 30 } };
  const onTime = MODES.swing.evaluate(trial, { rtMs: 270 }, ctx); // 270 + 150 = 420
  assert.ok(onTime.correct && Math.abs(onTime.timingErrMs) < 1e-9);
  const late = MODES.swing.evaluate(trial, { rtMs: 320 }, ctx);
  assert.ok(!late.correct && late.timingErrMs === 50 && late.grade === 'late');
  const take = MODES.swing.evaluate({ ...trial, truth: 'take' }, null, ctx);
  assert.ok(take.correct && take.decision === 'take');
});

test('bias statistics from logged trials', () => {
  const mk = (isStrike, call) => ({ mode: 'zone', correct: (call === 'strike') === isStrike, stimulus: { isStrike, type: 'FF' }, response: { call } });
  const trials = [];
  for (let i = 0; i < 15; i++) trials.push(mk(true, 'strike'), mk(false, 'strike'));
  for (let i = 0; i < 5; i++) trials.push(mk(false, 'ball'));
  const s = strikeCallSDT(trials);
  assert.equal(s.bias, 'strikes');
  const sum = summarizeLab(trials);
  assert.equal(sum.n, 35);
  assert.equal(sum.byType[0].key, 'FF');
});
