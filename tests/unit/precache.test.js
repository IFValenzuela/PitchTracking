import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPrecache } from '../../tools/gen-precache.mjs';

test('precache-list.js is up to date (run `npm run precache`)', async () => {
  const { body } = await buildPrecache();
  const current = await readFile(new URL('../../precache-list.js', import.meta.url), 'utf8');
  assert.equal(current, body);
});
