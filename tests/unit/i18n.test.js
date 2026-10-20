// Every t('key') used in the source must exist in the English table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import en from '../../src/i18n/en.js';

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

test('all literal i18n keys exist', async () => {
  const root = new URL('../../src', import.meta.url).pathname;
  const missing = [];
  for (const f of await walk(root)) {
    const src = await readFile(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!(m[1] in en)) missing.push(`${m[1]} (${f.replace(root, 'src')})`);
  }
  assert.deepEqual(missing, []);
});

test('no inflated marketing language in strings', () => {
  const banned = /\b(10x|guarantee|superhuman|supercharge|revolutionary|elite vision in)\b/i;
  const bad = Object.entries(en).filter(([, v]) => banned.test(v));
  assert.deepEqual(bad, []);
});
