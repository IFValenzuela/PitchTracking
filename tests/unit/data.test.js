import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryAdapter, STORE_NAMES } from '../../src/data/db.js';
import { Repo } from '../../src/data/repo.js';
import { exportAll, importAll, validateExport, toCSV, parseCSV, flatten } from '../../src/data/export.js';
import { deepMerge, defaultSettings } from '../../src/data/defaults.js';

async function seeded() {
  const db = memoryAdapter();
  const repo = await new Repo(db).init();
  await repo.saveSettings({ profile: { bats: 'L' }, prefs: { theme: 'light' } });
  const s = await repo.saveSession({ kind: 'pitchlab', mode: 'zone', startedAt: 1000, summary: { acc: 0.8 } });
  await repo.saveTrials([
    { id: `${s.id}:0`, sessionId: s.id, module: 'pitchlab', t: 1001, stimulus: { type: 'FF', mph: 92.5, note: 'a,"b"' }, response: { call: 'strike' }, correct: true, rtMs: 412.3 },
    { id: `${s.id}:1`, sessionId: s.id, module: 'pitchlab', t: 1002, stimulus: { type: 'SL', mph: 84 }, response: { call: 'ball' }, correct: false, rtMs: 530 },
  ]);
  await repo.saveStaircase('zone', { level: 4.5, step: 1, reversals: [3, 5] });
  await repo.saveAssessment({ at: 5, scores: { reaction: 50 }, composite: 50 });
  await repo.saveRealResult({ date: '2026-10-01', pa: 12, k: 3, bb: 2 });
  await repo.addUsage(60000);
  return { db, repo };
}

test('settings merge with defaults and persist', async () => {
  const { db } = await seeded();
  const repo2 = await new Repo(db).init();
  assert.equal(repo2.settings.profile.bats, 'L');
  assert.equal(repo2.settings.prefs.theme, 'light');
  assert.equal(repo2.settings.prefs.sound, defaultSettings().prefs.sound);
});

test('deepMerge keeps nested defaults and replaces arrays', () => {
  const m = deepMerge({ a: { b: 1, c: 2 }, l: [1, 2] }, { a: { b: 5 }, l: [9] });
  assert.deepEqual(m, { a: { b: 5, c: 2 }, l: [9] });
});

test('export -> wipe -> import round-trips without loss', async () => {
  const { db } = await seeded();
  const before = await exportAll(db);
  assert.deepEqual(validateExport(before), []);
  const json = JSON.parse(JSON.stringify(before));
  const fresh = memoryAdapter();
  const counts = await importAll(fresh, json);
  assert.equal(counts.trials, 2);
  const after = await exportAll(fresh);
  for (const s of STORE_NAMES) assert.deepEqual(after.stores[s], before.stores[s], `store ${s}`);
});

test('import rejects malformed files', async () => {
  await assert.rejects(() => importAll(memoryAdapter(), { format: 'nope' }));
  assert.ok(validateExport({ format: 'battersEye.export', schemaVersion: 1, stores: { bogus: [] } }).length > 0);
});

test('CSV export escapes and round-trips through the parser', async () => {
  const { repo } = await seeded();
  const csv = toCSV(await repo.allTrials());
  const rows = parseCSV(csv);
  assert.equal(rows.length, 3);
  const header = rows[0];
  const iNote = header.indexOf('stimulus.note');
  assert.ok(iNote >= 0);
  assert.equal(rows[1][iNote], 'a,"b"');
  assert.equal(rows[1][header.indexOf('stimulus.mph')], '92.5');
  assert.deepEqual(flatten({ a: { b: { c: 1 } }, d: [1] }), { 'a.b.c': 1, d: [1] });
});

test('usage accumulates per local day', async () => {
  const { repo } = await seeded();
  await repo.addUsage(30000);
  assert.equal(await repo.usageToday(), 90000);
});
