import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRealResults, weeklyMinutes, streakDays, rate } from '../../src/modules/progress/realresults.js';

const entry = (date, o) => ({ date, pa: 0, k: 0, bb: 0, chases: 0, outsidePitches: 0, goodDecisions: 0, decisions: 0, hardHit: 0, bip: 0, ...o });

test('too little data → never claims a change', () => {
  const r = analyzeRealResults([entry('2026-09-01', { pa: 4, k: 2 }), entry('2026-10-01', { pa: 4, k: 0 })], '2026-09-15');
  assert.equal(r.metrics.k.verdict, 'thin');
  assert.equal(r.overall, 'thin');
});

test('a large, well-sampled drop in chase rate is reported as better', () => {
  const before = Array.from({ length: 5 }, (_, i) => entry(`2026-08-0${i + 1}`, { chases: 12, outsidePitches: 30 })); // 40 %
  const after = Array.from({ length: 5 }, (_, i) => entry(`2026-10-0${i + 1}`, { chases: 6, outsidePitches: 30 })); // 20 %
  const r = analyzeRealResults([...before, ...after], '2026-09-01');
  assert.equal(r.split, 'training');
  assert.equal(r.metrics.chase.verdict, 'better');
  assert.equal(r.overall, 'someBetter');
});

test('small differences with enough data → no clear change', () => {
  const before = Array.from({ length: 5 }, (_, i) => entry(`2026-08-0${i + 1}`, { k: 5, pa: 20 }));
  const after = Array.from({ length: 5 }, (_, i) => entry(`2026-10-0${i + 1}`, { k: 4, pa: 20 }));
  const r = analyzeRealResults([...before, ...after], '2026-09-01');
  assert.equal(r.metrics.k.verdict, 'noChange');
  assert.equal(r.overall, 'noChange');
  assert.ok(Math.abs(rate(before, 'k') - 0.25) < 1e-9);
});

test('falls back to comparing halves when there is no pre-training baseline', () => {
  const es = Array.from({ length: 8 }, (_, i) => entry(`2026-10-${10 + i}`, { pa: 10, k: 2 }));
  assert.equal(analyzeRealResults(es, '2026-01-01').split, 'halves');
});

test('weekly minutes and streaks', () => {
  const w = weeklyMinutes({ '2026-10-19': 600000, '2026-10-21': 300000, '2026-10-12': 60000 });
  assert.deepEqual(w.map((x) => Math.round(x.min)), [1, 15]);
  const today = new Date('2026-10-21T15:00:00');
  assert.equal(streakDays({ '2026-10-21': 1, '2026-10-20': 1, '2026-10-19': 1, '2026-10-17': 1 }, today), 3);
  assert.equal(streakDays({}, today), 0);
});
