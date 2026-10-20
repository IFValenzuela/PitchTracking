// Browser end-to-end checks in headless Chromium (Playwright).
// Usage: node tests/e2e/run.mjs [suiteName ...]
import { mkdir } from 'node:fs/promises';
import { startServer } from '../../tools/serve.mjs';
import { launch } from './pw.mjs';
import { suites } from './suites.mjs';

const OUT = new URL('./out/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const server = await startServer(0);
const port = server.address().port;
const base = `http://localhost:${port}/`;
const browser = await launch();
const wanted = process.argv.slice(2);
let failed = 0;

for (const [name, fn] of Object.entries(suites)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const context = await browser.newContext({ viewport: { width: 900, height: 600 }, hasTouch: false });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const t0 = Date.now();
  try {
    await fn({ page, context, base, out: OUT, shot: (n) => page.screenshot({ path: `${OUT}${name}-${n}.png` }) });
    const real = errors.filter((e) => !/favicon|ERR_INTERNET_DISCONNECTED/.test(e));
    if (real.length) throw new Error(`browser errors:\n  ${real.join('\n  ')}`);
    console.log(`ok   ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}: ${err.stack || err.message}`);
    await page.screenshot({ path: `${OUT}${name}-FAIL.png` }).catch(() => {});
  }
  await context.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
