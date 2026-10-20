import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameStats, syncStats, eventTime, quantile, correctedTapTime } from '../../src/engine/timing.js';
import { cmToDeg, degToCm, screenFov, pxPerDeg } from '../../src/engine/optics.js';

test('frameStats on a steady 60 Hz stream', () => {
  const s = frameStats(Array(120).fill(16.667));
  assert.ok(Math.abs(s.fps - 60) < 0.1);
  assert.equal(s.latePct, 0);
});

test('frameStats counts late frames', () => {
  const xs = Array(95).fill(16.7).concat(Array(5).fill(50));
  assert.equal(frameStats(xs).latePct, 5);
});

test('syncStats rejects outliers and adds half-frame quantisation', () => {
  const xs = [-20, -25, -18, -22, -30, -15, -21, 300];
  const s = syncStats(xs, 16.7);
  assert.equal(s.rejected, 1);
  assert.ok(s.meanMs < -15 && s.meanMs > -30);
  assert.ok(s.uncertaintyMs >= 16.7 / 2);
});

test('eventTime prefers event.timeStamp on the perf clock, rejects epoch stamps', () => {
  assert.equal(eventTime({ timeStamp: 995 }, 1000), 995);
  assert.equal(eventTime({ timeStamp: 1.7e12 }, 1000), 1000);
  assert.equal(eventTime({}, 1000), 1000);
});

test('quantile interpolates', () => { assert.equal(quantile([0, 10], 0.5), 5); });

test('tap correction only when enabled', () => {
  assert.equal(correctedTapTime(100, { applyOffset: false, inputOffsetMs: 20 }), 100);
  assert.equal(correctedTapTime(100, { applyOffset: true, inputOffsetMs: 20 }), 80);
});

test('optics conversions are consistent', () => {
  assert.ok(Math.abs(cmToDeg(degToCm(5, 50), 50) - 5) < 1e-9);
  const fov = screenFov(800, 400, { pxPerCm: 40, viewDistCm: 50 });
  assert.ok(Math.abs(fov.hDeg - 2 * Math.atan(10 / 50) * 180 / Math.PI) < 1e-9);
  assert.ok(Math.abs(pxPerDeg(40, 57.3) - 40) < 0.1);
});
