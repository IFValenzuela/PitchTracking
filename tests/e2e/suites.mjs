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

async function startMode(page, base, mode, setup) {
  await onboard(page, base);
  await page.evaluate(async (cfg) => { await window.__battersEye.repo.kvSet('labConfig', cfg); }, setup);
  await page.goto(`${base}#/lab`);
  await page.click(`[data-test="mode-${mode}"]`);
  await page.click('[data-test="lab-start"]');
  await page.waitForFunction(() => window.__pitchScene && window.__pitchScene.pitch, null, { timeout: 15000 });
}

async function waitInFlight(page, minT = 0.05) {
  await page.waitForFunction((m) => { const s = window.__pitchScene; return s && s.pitch && s.lastT > m && s.lastT < 0.3 && s.reviewT == null; }, minT, { timeout: 20000 });
}

async function finish(page) {
  await page.click('.stop-btn');
  await page.waitForSelector('[data-test="lab-done"]', { timeout: 5000 });
  await page.click('[data-test="lab-done"]');
  await page.waitForSelector('.train', { state: 'detached' });
  return page.evaluate(async () => (await window.__battersEye.repo.allTrials()));
}

suites.pitchlabModes = async ({ page, base, shot }) => {
  const types = ['FF', 'SL', 'CH'];
  // Pitch ID
  await startMode(page, base, 'pid', { mode: 'pid', types, hand: 'L', slot: 'side' });
  for (let i = 0; i < 2; i++) { await waitInFlight(page); await page.keyboard.press('1'); await page.waitForSelector('.center-msg .big'); await page.waitForFunction(() => !document.querySelector('.center-msg .big'), null, { timeout: 8000 }); }
  let trials = await finish(page);
  const pid = trials.filter((t) => t.mode === 'pid');
  assert(pid.length === 2 && pid[0].stairKey.startsWith('pl:pid:') && pid[0].stimulus.hand === 'L', 'pid trials logged with pair staircase');

  // Swing / Take with precisely scheduled key presses (tests the timing pipeline)
  await page.evaluate(() => window.__battersEye.repo.saveSettings({ prefs: { swingTimeMs: 150 } }));
  await page.goto(`${base}#/lab`);
  await page.click('[data-test="mode-swing"]');
  await page.evaluate(async () => { await window.__battersEye.repo.kvSet('labConfig', { mode: 'swing', types: ['FF'], hand: 'R', slot: 'threeQuarter' }); });
  await page.goto(`${base}#/home`); await page.goto(`${base}#/lab`);
  await page.click('[data-test="lab-start"]');
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => { const s = window.__pitchScene; return s && s.pitch && Number.isFinite(s.releaseAt) && performance.now() < s.releaseAt - 200; }, null, { timeout: 20000 });
    await page.evaluate(() => {
      const s = window.__pitchScene;
      const contact = s.pitch.traj && (() => { // time the ball reaches the contact plane (y = plate front + 0.6 ft)
        const d = s.pitch.traj.data; for (let k = 1; k < s.pitch.traj.n; k++) if (d[k * 7 + 2] < 1.417 + 0.6) return d[k * 7] * 1000; return 400; })();
      const fireAt = s.releaseAt + contact - 150;
      const spin = () => { if (performance.now() >= fireAt) window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); else setTimeout(spin, 0); };
      setTimeout(spin, Math.max(0, fireAt - performance.now() - 8));
    });
    await page.waitForSelector('.center-msg .big', { timeout: 8000 });
    await page.waitForFunction(() => !document.querySelector('.center-msg .big'), null, { timeout: 8000 });
  }
  trials = await finish(page);
  const sw = trials.filter((t) => t.mode === 'swing');
  const errs = sw.filter((t) => t.response.decision === 'swing').map((t) => t.response.timingErrMs);
  console.log('     scheduled-swing timing errors (ms):', errs.join(', '));
  assert(errs.length === 3 && errs.every((e) => Math.abs(e) < 12), 'swing timing pipeline accurate to <12 ms');

  // Location call
  await page.evaluate(async () => { await window.__battersEye.repo.kvSet('labConfig', { mode: 'location', types: ['FF', 'CU'], hand: 'R', slot: 'over' }); });
  await page.goto(`${base}#/home`); await page.goto(`${base}#/lab`);
  await page.click('[data-test="lab-start"]');
  for (let i = 0; i < 2; i++) {
    await page.waitForSelector('[data-test="zone-pick"]', { timeout: 20000 });
    if (i === 0) await shot('location-picker');
    const box = await page.locator('[data-test="zone-pick"]').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.55);
    await page.waitForSelector('.center-msg .big');
    await page.waitForFunction(() => !document.querySelector('.center-msg .big'), null, { timeout: 8000 });
  }
  trials = await finish(page);
  const loc = trials.filter((t) => t.mode === 'location');
  assert(loc.length === 2 && Number.isFinite(loc[0].response.errIn), 'location error logged');

  // Occlusion: ball must be hidden after the occlusion distance
  await page.evaluate(async () => { await window.__battersEye.repo.kvSet('labConfig', { mode: 'occlusion', types: ['FF', 'SL'], hand: 'R', slot: 'threeQuarter', occlTask: 'zone' }); });
  await page.goto(`${base}#/home`); await page.goto(`${base}#/lab`);
  await page.click('[data-test="lab-start"]');
  await page.waitForFunction(() => { const s = window.__pitchScene; if (!s || !s.pitch || !Number.isFinite(s.occlusionFt)) return false; const d = s.pitch.p0[1] - s.ball.mesh.position.z * -1; return s.lastT > 0 && d > s.occlusionFt + 2; }, null, { timeout: 20000 }).catch(() => {});
  const occl = await page.evaluate(() => { const s = window.__pitchScene; return { visible: s.ball.mesh.visible, lastVisible: s.lastVisible, occl: s.occlusionFt, t: s.lastT }; });
  await page.keyboard.press('j');
  await page.waitForSelector('.center-msg .big');
  trials = await finish(page);
  const oc = trials.filter((t) => t.mode === 'occlusion');
  assert(oc.length >= 1 && oc[0].stimulus.occlusionFt > 30, `occlusion distance logged (${oc[0]?.stimulus.occlusionFt})`);
  assert(occl.lastVisible === false, `ball hidden after occlusion point: ${JSON.stringify(occl)}`);

  // Tunnel trainer
  await page.evaluate(async () => { await window.__battersEye.repo.kvSet('labConfig', { mode: 'tunnel', types: ['FF'], pairs: [['FF', 'CH']], hand: 'R', slot: 'threeQuarter' }); });
  await page.goto(`${base}#/home`); await page.goto(`${base}#/lab`);
  await page.click('[data-test="lab-start"]');
  await page.waitForFunction(() => /Name the next|Watch/.test(document.querySelector('.center-msg')?.textContent || ''), null, { timeout: 20000 });
  await page.waitForFunction(() => /Name the next/.test(document.querySelector('.center-msg')?.textContent || ''), null, { timeout: 20000 });
  await waitInFlight(page);
  await page.keyboard.press('2');
  await page.waitForSelector('.center-msg .big');
  await page.click('[data-test="review-btn"]');
  await page.waitForSelector('[data-test="review-info"]');
  await page.click('[data-view="overhead"]');
  await page.waitForTimeout(500);
  await shot('tunnel-review');
  await page.click('[data-test="rev-close"]');
  trials = await finish(page);
  const tu = trials.filter((t) => t.mode === 'tunnel');
  assert(tu.length === 1 && tu[0].stimulus.firstType && Number.isFinite(tu[0].stimulus.divergenceToPlateFt), 'tunnel trial logged');
};

suites.stereo = async ({ page, base, shot }) => {
  await onboard(page, base);
  for (const mode of ['anaglyph', 'sbs']) {
    await page.evaluate((m) => window.__battersEye.repo.saveSettings({ prefs: { stereo: m } }), mode);
    await page.goto(`${base}#/lab`);
    await page.click('[data-test="lab-start"]');
    await page.waitForFunction(() => window.__pitchScene && window.__pitchScene.lastT > -1, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await shot(mode);
    await finish(page);
  }
};

// Generic auto-responder: presses enabled answer buttons or taps the stage.
export async function autoRespond(page, untilFn, { maxMs = 120000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await page.evaluate(untilFn)) return;
    const acted = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.train .rbtn')].filter((b) => !b.disabled && b.offsetParent);
      const done = document.querySelector('[data-test="drill-done"],[data-test="lab-done"]');
      if (done) { done.click(); return 'done'; }
      const pick = document.querySelector('[data-test="zone-pick"]');
      if (pick) { const r = pick.getBoundingClientRect(); pick.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true })); return 'pick'; }
      if (btns.length) { btns[Math.floor(Math.random() * btns.length)].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return 'btn'; }
      const tz = document.querySelector('.train .tapzone');
      if (tz) { tz.dispatchEvent(new PointerEvent('pointerdown', { clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true })); return 'tap'; }
      return null;
    });
    await sleep(acted ? 350 : 200);
  }
  throw new Error('autoRespond timed out');
}

suites.eyecheck = async ({ page, base, shot }) => {
  await onboard(page, base, { eyeCheck: true });
  await page.evaluate(() => { window.__battersEye.testTrialCap = 8; });
  await page.waitForSelector('[data-test="eye-start"]');
  await shot('intro');
  await page.click('[data-test="eye-start"]');
  for (let i = 0; i < 9; i++) {
    await page.waitForSelector('[data-test="eye-test-start"]', { timeout: 30000 });
    const title = await page.textContent('.onb h1');
    await page.click('[data-test="eye-test-start"]');
    await page.waitForSelector('.train', { timeout: 10000 });
    if (i === 2) { await sleep(2500); await shot(`test-${i}`); }
    await autoRespond(page, () => !document.querySelector('.train'), { maxMs: 90000 });
    console.log(`     eye test ${i + 1}: ${title}`);
  }
  await page.waitForSelector('[data-test="eye-composite"]', { timeout: 15000 });
  await shot('results');
  const comp = await page.textContent('[data-test="eye-composite"]');
  const a = await page.evaluate(async () => window.__battersEye.repo.listAssessments());
  assert(a.length === 1 && a[0].baseline, 'assessment saved as baseline');
  const skills = Object.keys(a[0].scores);
  console.log('     scored skills:', skills.join(', '), '| composite', comp);
  assert(skills.length >= 6, `most skills scored (${skills.length})`);
  assert(Object.values(a[0].scores).every((s) => s.score === 50), `first run = 50 everywhere: ${JSON.stringify(a[0].scores)} raw ${JSON.stringify(a[0].raw)}`);
};

suites.gym = async ({ page, base, shot }) => {
  await onboard(page, base);
  await page.evaluate(() => { window.__battersEye.testDrillSeconds = 5; });
  await page.goto(`${base}#/gym`);
  await page.waitForSelector('[data-test="drill-saccadeSnap"]');
  await shot('list');
  const ids = await page.$$eval('a[data-test^="drill-"]', (as) => as.map((a) => a.dataset.test.slice(6)).filter((x) => x !== 'strobe'));
  assert(ids.length === 11, `11 drills listed + strobe (${ids.length})`);
  for (const id of ids) {
    await page.goto(`${base}#/drill/${id}`);
    await page.waitForSelector('[data-test="drill-start"]');
    await page.click('[data-test="drill-start"]');
    await page.waitForSelector('.train');
    await sleep(1800);
    await shot(`run-${id}`);
    await autoRespond(page, () => !document.querySelector('.train'), { maxMs: 40000 });
    const n = await page.evaluate(async (d) => (await window.__battersEye.repo.allTrials()).filter((t) => t.drill === d).length, id);
    console.log(`     ${id}: ${n} trials`);
    assert(n >= 1, `${id} logged trials`);
  }
  // Strobe: enable through the warning, run one compatible drill, STOP ends it instantly.
  await page.goto(`${base}#/drill/strobe`);
  await page.click('[data-test="strobe-enable"]');
  await page.waitForSelector('.dialog');
  const warn = await page.textContent('.dialog');
  assert(/seizure/i.test(warn), 'photosensitivity warning shown');
  await page.click('.dialog button.primary');
  await page.waitForSelector('[data-test="strobe-pursuit"]');
  await page.click('[data-test="strobe-pursuit"]');
  await page.waitForSelector('.train .strobe');
  await sleep(1200);
  const ops = [];
  for (let i = 0; i < 12; i++) { ops.push(await page.$eval('.train .strobe', (e) => e.style.opacity)); await sleep(60); }
  assert(ops.includes('1') && ops.includes('0'), `strobe toggles (${ops.join('')})`);
  await page.click('.stop-btn');
  const after = await page.$eval('.train .strobe', (e) => e.style.opacity);
  assert(after === '0', 'stop clears strobe immediately');
  await page.waitForSelector('[data-test="drill-done"]');
  await page.click('[data-test="drill-done"]');
};

suites.planProgress = async ({ page, base, shot, out }) => {
  await onboard(page, base);
  // Seed a baseline Eye Check so the plan has weak areas to target.
  await page.evaluate(async () => {
    const app = window.__battersEye;
    await app.repo.saveSettings({ prefs: { blockSize: 10 } });
    app.testDrillSeconds = 4;
    await app.repo.saveAssessment({ id: 'a_seed', at: Date.now() - 86400000, raw: {
      pitchRecognition: { p: -0.4, se: 0.5, n: 16, display: { pct: 40 } }, zoneJudgment: { p: 1.6, se: 0.4, n: 16, display: { dprime: 1.6, pct: 78 } },
      pursuit: { p: 3, se: 1, n: 10 }, dynamicAcuity: { p: 12, se: 1, n: 18 }, anticipation: { p: 3, se: 0.1, n: 12, display: { ms: 45 } } },
    scores: {}, composite: 50, compositeSE: 4, baseline: true });
  });
  await page.goto(`${base}#/gym`);
  await page.goto(`${base}#/home`);
  await page.waitForSelector('[data-test="start-today"]');
  await shot('home');
  const plan = await page.evaluate(async () => window.__battersEye.repo.currentPlan());
  assert(plan.sessions.length === 3 && plan.basedOn === 'a_seed' && plan.weakSkills.includes('pitchRecognition'), `plan rebuilt from the Eye Check (${plan.weakSkills})`);
  await page.click('[data-test="start-today"]');
  for (let b = 0; b < 2; b++) {
    await page.waitForSelector('[data-test="session-go"]');
    await page.click('[data-test="session-go"]');
    await page.waitForSelector('.train');
    await autoRespond(page, () => !document.querySelector('.train'), { maxMs: 120000 });
  }
  await page.waitForSelector('[data-test="session-go"]');
  const p2 = await page.evaluate(async () => window.__battersEye.repo.currentPlan());
  assert(p2.sessions[0].blocks.filter((x) => x.doneAt).length === 2, 'two blocks marked done');
  await shot('session');

  // Progress dashboard with a couple of real results
  await page.goto(`${base}#/progress`);
  await page.waitForSelector('[data-test="rr-open"]');
  await page.click('[data-test="rr-open"]');
  await page.fill('[data-test="rr-pa"]', '4');
  await page.fill('[data-test="rr-k"]', '1');
  await page.fill('[data-test="rr-outsidePitches"]', '12');
  await page.fill('[data-test="rr-chases"]', '5');
  await page.click('[data-test="rr-save"]');
  await page.waitForSelector('[data-test="rr-verdict"]');
  const verdict = await page.textContent('[data-test="rr-verdict"]');
  assert(/Too little/.test(verdict), `honest verdict with thin data: ${verdict}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}planProgress-progress.png`, fullPage: true });

  // Export → wipe → import round trip through the real UI and IndexedDB
  const before = await page.evaluate(async () => { const { exportAll } = await import('./src/data/export.js'); return exportAll(window.__battersEye.repo.db); });
  const file = `${out}export.json`;
  (await import('node:fs')).writeFileSync(file, JSON.stringify(before));
  await page.evaluate(async () => { for (const s of ['sessions', 'trials', 'staircases', 'assessments', 'plans', 'realResults']) await window.__battersEye.repo.db.clear(s); });
  await page.goto(`${base}#/settings`);
  await page.setInputFiles('[data-test="import-file"]', file);
  await page.waitForSelector('.dialog');
  await page.click('.dialog button.primary');
  await page.waitForSelector('.toast:has-text("Imported")', { timeout: 10000 });
  console.log('     after import:', await page.evaluate(async () => { const db = window.__battersEye.repo.db; const o = {}; for (const s of ['sessions', 'trials', 'assessments', 'plans', 'realResults']) o[s] = await db.count(s); return JSON.stringify(o); }));
  await page.reload();
  await page.waitForSelector('nav.nav');
  const after = await page.evaluate(async () => { const { exportAll } = await import('./src/data/export.js'); return exportAll(window.__battersEye.repo.db); });
  for (const s of Object.keys(before.stores)) {
    if (s === 'kv') continue; // usage counters keep ticking during the test
    assert(JSON.stringify(after.stores[s]) === JSON.stringify(before.stores[s]), `store ${s} round-trips (${before.stores[s].length} rows)\n${JSON.stringify(before.stores[s]).slice(0, 600)}\n${JSON.stringify(after.stores[s]).slice(0, 600)}`);
  }
};

// Phone-sized layouts (landscape and portrait) with touch input.
suites.phone = async ({ page, context, base, shot }) => {
  await onboard(page, base);
  for (const [name, vp] of [['landscape', { width: 844, height: 390 }], ['portrait', { width: 390, height: 844 }]]) {
    await page.setViewportSize(vp);
    await page.goto(`${base}#/gym`); await page.goto(`${base}#/home`);
    await page.waitForSelector('nav.nav');
    await shot(`${name}-home`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 1, `no horizontal scroll on ${name} home (${overflow}px)`);
    await page.goto(`${base}#/lab`);
    await page.click('[data-test="lab-start"]');
    await page.waitForFunction(() => window.__pitchScene && window.__pitchScene.lastT > 0.1, null, { timeout: 20000 });
    await shot(`${name}-lab`);
    const r = await page.evaluate(() => { const b = document.querySelector('.stop-btn').getBoundingClientRect(); const btns = [...document.querySelectorAll('.rbtn')].map((x) => x.getBoundingClientRect()); return { stop: b, btns }; });
    assert(r.btns.every((b) => b.height >= 44 && b.width >= 44), 'answer buttons are at least 44 px');
    assert(r.stop.right <= vp.width && r.stop.top >= 0, 'STOP is on screen');
    await page.click('.stop-btn');
    await page.click('[data-test="lab-done"]');
    await page.waitForSelector('.train', { state: 'detached' });
    await page.waitForSelector('[data-test="lab-start"]:not([disabled])');
    await page.goto(`${base}#/drill/dynamicAcuity`);
    await page.click('[data-test="drill-start"]');
    await page.waitForSelector('.train');
    await sleep(1500);
    await shot(`${name}-drill`);
    await page.click('.stop-btn');
    await page.click('[data-test="drill-done"]');
    await page.waitForSelector('.train', { state: 'detached' });
  }
};

// After the first load: no requests to other origins ever, and training works offline.
suites.noNetwork = async ({ page, context, base }) => {
  const foreign = [];
  page.on('request', (req) => { if (!req.url().startsWith(base) && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) foreign.push(req.url()); });
  await onboard(page, base);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(async () => !!navigator.serviceWorker.controller && (await caches.keys()).length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(1500); // let precache finish
  await context.setOffline(true);
  const fails = [];
  page.on('requestfailed', (r) => fails.push(r.url()));
  await page.goto(`${base}#/gym`);
  await page.reload();
  await page.waitForSelector('nav.nav');
  await page.goto(`${base}#/lab`);
  await page.click('[data-test="lab-start"]');
  await page.waitForFunction(() => window.__pitchScene && window.__pitchScene.lastT > 0.1, null, { timeout: 20000 });
  await page.click('.stop-btn');
  await page.click('[data-test="lab-done"]');
  await context.setOffline(false);
  assert(!foreign.length, `requests to other origins: ${foreign.join(', ')}`);
  assert(!fails.length, `requests failed offline: ${fails.join(', ')}`);
};
