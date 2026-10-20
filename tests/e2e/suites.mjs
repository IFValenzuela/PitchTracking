// E2E suites. Each receives { page, context, base, shot }.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function onboard(page, base, { eyeCheck = false } = {}) {
  await page.goto(base);
  await page.waitForSelector('.onb');
  for (let i = 0; i < 3; i++) await page.click('[data-test="onb-next"]');
  await page.click(eyeCheck ? '[data-test="onb-eyecheck"]' : '[data-test="onb-later"]');
  await page.waitForFunction((h) => location.hash === h, eyeCheck ? '#/eyecheck' : '#/home');
  if (!eyeCheck) await page.waitForSelector('nav.nav');
}

export function assert(cond, msg) { if (!cond) throw new Error(msg); }

export const suites = {
  async shell({ page, base, shot }) {
    await onboard(page, base);
    await page.waitForSelector('nav.nav');
    await shot('home');
    for (const tab of ['lab', 'gym', 'progress', 'settings', 'home']) {
      await page.click(`nav a[data-tab="${tab}"]`);
      await page.waitForFunction((t) => location.hash === `#/${t}`, tab);
    }
    // settings persist across reloads
    await page.click('nav a[data-tab="settings"]');
    await page.waitForSelector('text=Light');
    await page.click('button[role="radio"]:has-text("Light")');
    await sleep(100);
    await page.reload();
    await page.waitForSelector('nav.nav');
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    assert(theme === 'light', `theme persisted (${theme})`);
    await shot('settings-light');
  },

  async selfcheck({ page, base }) {
    await onboard(page, base);
    await page.goto(`${base}#/settings`);
    await page.click('[data-test="fps-run"]');
    await page.waitForFunction(() => /fps/.test(document.querySelector('[data-test="fps-out"]').textContent), null, { timeout: 8000 });
    await page.click('[data-test="tap-run"]');
    await page.waitForSelector('.train .tapzone');
    // Tap 16 times on the beat (750 ms period, first flash 1200 ms after start).
    const start = Date.now();
    for (let i = 0; i < 16; i++) {
      const due = start + 1200 + i * 750 + 10;
      await sleep(Math.max(0, due - Date.now()));
      await page.mouse.click(450, 300);
    }
    await page.waitForSelector('.train', { state: 'detached', timeout: 5000 });
    const txt = await page.textContent('[data-test="tap-out"]');
    assert(/uncertainty/.test(txt), `tap result shown: ${txt}`);
    const s = await page.evaluate(() => window.__battersEye.repo.settings.timing.lastCheck);
    assert(s.fps.fps > 10 && Number.isFinite(s.tap.sdMs), 'stats stored');
  },

  async offline({ page, context, base }) {
    await onboard(page, base);
    await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // now controlled
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    // let the precache finish
    await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('battersEye-')), null, { timeout: 15000 });
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('nav.nav', { timeout: 10000 });
    await context.setOffline(false);
  },
};

suites.pitchlabZone = async ({ page, base, shot }) => {
  await onboard(page, base);
  await page.goto(`${base}#/lab`);
  await page.click('[data-test="mode-zone"]');
  await page.click('[data-test="lab-start"]');
  await page.waitForSelector('.train canvas.stage', { timeout: 10000 });
  await page.waitForFunction(() => window.__pitchScene && window.__pitchScene.pitch, null, { timeout: 15000 });
  // wait until the ball is in flight, then screenshot
  await page.waitForFunction(() => window.__pitchScene.lastT > 0.15, null, { timeout: 10000 });
  await shot('flight');
  const fps = await page.evaluate(() => window.__pitchScene.clock.stats());
  console.log('     headless fps', fps.fps.toFixed(1), 'p95', fps.p95Ms.toFixed(1));
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => { const s = window.__pitchScene; return s.pitch && s.lastT > 0.05 && s.reviewT == null; }, null, { timeout: 15000 });
    await page.click('.train .rbtn[data-id="strike"]');
    await page.waitForSelector('.center-msg .big', { timeout: 5000 });
    if (i === 0) {
      await shot('feedback');
      await page.click('[data-test="review-btn"]');
      await page.waitForSelector('[data-test="review-bar"]');
      await page.waitForTimeout(600);
      await page.click('[data-view="side"]');
      await page.waitForTimeout(400);
      await shot('review-side');
      await page.click('[data-view="orbit"]');
      await page.mouse.move(400, 250); await page.mouse.down(); await page.mouse.move(300, 220, { steps: 5 }); await page.mouse.up();
      await shot('review-orbit');
      await page.click('[data-test="rev-close"]');
    }
    await page.waitForFunction(() => !document.querySelector('.center-msg .big'), null, { timeout: 8000 });
  }
  await page.click('.stop-btn');
  await page.waitForSelector('[data-test="lab-done"]', { timeout: 5000 });
  await shot('summary');
  await page.click('[data-test="lab-done"]');
  await page.waitForSelector('.train', { state: 'detached' });
  const n = await page.evaluate(async () => (await window.__battersEye.repo.allTrials()).length);
  assert(n >= 3, `trials logged: ${n}`);
  const st = await page.evaluate(async () => window.__battersEye.repo.getStaircase('pl:zone'));
  assert(st && st.trials >= 3, 'staircase stored');
};
