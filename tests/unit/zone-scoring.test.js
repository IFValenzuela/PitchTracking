import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strikeZone, isStrike, edgeDistanceIn, zoneRegion, sampleLocation, horizontalSide } from '../../src/engine/zone.js';
import { sdt, biasLabel, timingGrade, probit, twoProportionZ, summarizeTrials } from '../../src/engine/scoring.js';
import { BALL_RADIUS, PLATE_HALF_WIDTH } from '../../src/engine/units.js';
import { makeRng } from '../../src/engine/rng.js';

const zone = strikeZone(72);

test('zone geometry for a 6 ft hitter', () => {
  assert.ok(zone.top > 3.2 && zone.top < 3.6 && zone.bottom > 1.4 && zone.bottom < 1.8);
});

test('a ball clipping the edge is a strike', () => {
  const x = PLATE_HALF_WIDTH + BALL_RADIUS - 0.001;
  assert.ok(isStrike(x, 2.5, zone));
  assert.ok(!isStrike(x + 0.01, 2.5, zone));
  assert.ok(edgeDistanceIn(0, 2.5, zone) > 8);
  assert.ok(edgeDistanceIn(2, 2.5, zone) < -10);
});

test('regions', () => {
  assert.equal(zoneRegion(0, (zone.top + zone.bottom) / 2, zone), 5);
  assert.equal(zoneRegion(-0.6, zone.top - 0.05, zone), 1);
  assert.equal(zoneRegion(1.5, zone.top + 0.5, zone), 12);
  assert.equal(zoneRegion(-1.5, 0.5, zone), 13);
  assert.equal(horizontalSide(-0.5, 'R'), 'in');
  assert.equal(horizontalSide(-0.5, 'L'), 'away');
});

test('sampleLocation honours strike/ball and edge band', () => {
  const rng = makeRng(11);
  for (let i = 0; i < 200; i++) {
    const strike = i % 2 === 0;
    const loc = sampleLocation(rng, zone, { strike, edgeMin: 1, edgeMax: 3 });
    const e = edgeDistanceIn(loc.x, loc.z, zone);
    assert.equal(isStrike(loc.x, loc.z, zone), strike);
    assert.ok(Math.abs(e) >= 1 - 1e-9 && Math.abs(e) <= 3 + 1e-9, `edge ${e}`);
  }
});

test('probit inverts the normal CDF', () => {
  assert.ok(Math.abs(probit(0.5)) < 1e-9);
  assert.ok(Math.abs(probit(0.975) - 1.95996) < 1e-4);
});

test('signal detection identifies strike over-calling', () => {
  const liberal = sdt({ hits: 45, misses: 5, fas: 25, crs: 25 });
  const neutral = sdt({ hits: 40, misses: 10, fas: 10, crs: 40 });
  assert.ok(liberal.c < -0.2);
  assert.equal(biasLabel(liberal), 'strikes');
  assert.equal(biasLabel(neutral), 'balanced');
  assert.equal(biasLabel({ c: -1, n: 8 }), 'thin');
  assert.ok(neutral.dprime > 1.4);
});

test('timing grades', () => {
  assert.equal(timingGrade(-10), 'perfect');
  assert.equal(timingGrade(-30), 'slightlyEarly');
  assert.equal(timingGrade(60), 'late');
});

test('two-proportion test and summaries', () => {
  const r = twoProportionZ(30, 100, 15, 100);
  assert.ok(r.p < 0.05 && r.diff < 0);
  const s = summarizeTrials([{ correct: true, rtMs: 400 }, { correct: false, rtMs: 600 }]);
  assert.equal(s.accuracy, 0.5);
  assert.equal(s.meanRt, 500);
});
