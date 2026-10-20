// Loads Playwright from a local install or the global npm root (no repo dependency).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);

export function loadPlaywright() {
  try { return require('playwright'); } catch { /* fall through */ }
  const root = execSync('npm root -g').toString().trim();
  return require(require.resolve('playwright', { paths: [root] }));
}

export async function launch() {
  const { chromium } = loadPlaywright();
  const opts = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] };
  try { return await chromium.launch(opts); } catch {
    return chromium.launch({ ...opts, executablePath: '/opt/pw-browsers/chromium' });
  }
}
