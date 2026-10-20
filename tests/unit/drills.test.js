// Every drill implements the common interface and survives a full trial cycle
// against a mock canvas (no browser needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRILLS, gymDrills } from '../../src/modules/gym/registry.js';
import { makeRng } from '../../src/engine/rng.js';
import { defaultSettings } from '../../src/data/defaults.js';
import en from '../../src/i18n/en.js';

function mockCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : noop),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}

function mockApi() {
  let completed;
  const api = {
    g: mockCtx(), rng: makeRng(4), settings: defaultSettings(), clock: { frameMs: 16.7, presentLead: () => 16.7 },
    w: 900, h: 520, cx: 450, cy: 260, ppd: 30, deg(d) { return d * 30; }, wDeg: 30, hDeg: 17.3,
    now: () => 0, presentLead: () => 16.7, tapTime: (x) => x,
    complete(r) { completed = r; }, message() {}, clearMessage() {}, sound() {}, haptic() {},
    setButtons() {}, enableButtons() {}, shell: { root: { appendChild() {} } }, opts: {},
    get completed() { return completed; },
  };
  return api;
}

test('drill metadata is complete and translated', () => {
  for (const d of Object.values(DRILLS)) {
    for (const k of ['id', 'skill', 'nameKey', 'descKey', 'howKey', 'ladder', 'create']) assert.ok(d[k] !== undefined, `${d.id} has ${k}`);
    for (const k of [d.nameKey, d.descKey, d.howKey, `skill.${d.skill}`]) assert.ok(k in en, `missing string ${k}`);
  }
  assert.ok(gymDrills().length >= 11, 'eleven gym drills + strobe mode = twelve entries');
  assert.equal(DRILLS.mot.priority, 'low');
});

test('every drill runs a trial cycle on a mock canvas', () => {
  for (const d of Object.values(DRILLS)) {
    if (d.id === 'depth') continue; // needs WebGL; covered by the browser test
    for (const level of [0, 10, 20]) {
      const api = mockApi();
      const inst = d.create(api, d.variants?.[0]);
      const params = d.ladder(level, { settings: api.settings, api });
      const trial = inst.nextTrial(params, level);
      assert.doesNotThrow(() => JSON.stringify(trial), `${d.id} trial is JSON`);
      inst.start(trial, 0);
      for (let ts = 0; ts < 4000; ts += 16.7) inst.frame?.(ts, ts + 16.7);
      const res = inst.score(trial, null);
      // Withholding is the right answer on a no-go trial; otherwise silence is a miss.
      assert.equal(res.correct, d.id === 'gonogo' && !trial.go, `${d.id}: scoring of no response`);
      inst.dispose?.();
    }
  }
});

test('ladders get harder: key parameters move monotonically with level', () => {
  const ctx = { settings: defaultSettings() };
  const L = (id, k, lv) => DRILLS[id].ladder(lv, ctx)[k];
  assert.ok(L('gonogo', 'windowMs', 20) < L('gonogo', 'windowMs', 0));
  assert.ok(L('dynamicAcuity', 'sizeDeg', 20) < L('dynamicAcuity', 'sizeDeg', 0));
  assert.ok(L('dynamicAcuity', 'speedDeg', 20) > L('dynamicAcuity', 'speedDeg', 0));
  assert.ok(L('contrast', 'contrast', 20) < L('contrast', 'contrast', 0));
  assert.ok(L('contrast', 'contrast', 20) >= 1 / 128, 'contrast floor respects 8-bit displays');
  assert.ok(L('anticipation', 'traverseMs', 20) < L('anticipation', 'traverseMs', 0));
  assert.ok(L('anticipation', 'occlude', 20) > L('anticipation', 'occlude', 0));
  assert.ok(L('visualSpan', 'exposureMs', 20) <= 51 && L('visualSpan', 'exposureMs', 0) >= 299, 'tachistoscope spans 50–300 ms');
  assert.ok(L('visualSpan', 'k', 20) > L('visualSpan', 'k', 0));
  assert.ok(L('saccadeSnap', 'windowMs', 20) < L('saccadeSnap', 'windowMs', 0));
  assert.ok(L('peripheral', 'eccDeg', 20) > L('peripheral', 'eccDeg', 0));
  assert.ok(L('visualSearch', 'n', 20) > L('visualSearch', 'n', 0));
  assert.ok(L('mot', 'targets', 20) > L('mot', 'targets', 0));
  assert.ok(L('pursuit', 'speedDeg', 20) > L('pursuit', 'speedDeg', 0));
  assert.ok(L('depth', 'arcsec', 20) < L('depth', 'arcsec', 0));
});

test('anticipation scoring uses signed timing error', () => {
  const inst = DRILLS.anticipation.create(mockApi());
  const tr = { tolMs: 30 };
  assert.equal(inst.score(tr, { errorMs: -20 }).correct, true);
  assert.equal(inst.score(tr, { errorMs: 45 }).correct, false);
});
