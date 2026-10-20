// Drill runner: one engine for every Vision Gym drill and Eye Check test.
//
// A drill is a plain object (see registry.js) with:
//   id, skill, stair: {down, up, start, max}, ladder(level, ctx) → params,
//   create(api) → instance with
//     nextTrial(params) → trial (plain JSON stimulus description)
//     start(trial, now)             begin presenting
//     frame(ts, present)            draw on api.g (Canvas 2D) every frame
//     onPointer({x, y, ts}), onKey(e, ts), onButton(id, ts)   (optional)
//     score(trial, response) → { correct, rtMs?, errorMs?, ... }
//   and calls api.complete(response) when the trial resolves.
import { app } from '../../app.js';
import { t, fmtNum } from '../../i18n/i18n.js';
import { h } from '../../ui/dom.js';
import { openTraining } from '../../ui/training.js';
import { preTrainingCheck, reportDiscomfort } from '../../ui/safety.js';
import { feedback as fb, sound, haptic } from '../../ui/feedback.js';
import { FrameClock, eventTime, now, correctedTapTime, mean } from '../../engine/timing.js';
import { thresholdEstimate } from '../../engine/staircase.js';
import { pxPerDeg } from '../../engine/optics.js';
import { makeRng } from '../../engine/rng.js';
import { uid } from '../../data/repo.js';
import { StairBank } from '../stairs.js';

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : v);

function compact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue; // runtime-only fields
    out[k] = typeof v === 'number' ? Math.round(v * 1000) / 1000 : v && typeof v === 'object' ? compact(v) : v;
  }
  return out;
}

/**
 * opts: { seconds, trials, fixedLevel, persist (staircase), feedback, module ('gym'|'eyecheck'),
 *         strobe, assessmentId, variant, doneLabel, summaryPanel, bank }
 */
export async function runDrill(drill, opts = {}) {
  const o = { feedback: true, module: 'gym', persist: true, summaryPanel: true, ...opts };
  if (!o.skipChecks && !(await preTrainingCheck())) return null;
  const settings = app.repo.settings;
  const stairKey = o.stairKey || `${o.module === 'gym' ? 'gym' : 'eye'}:${drill.id}${o.variant ? `:${o.variant}` : ''}`;
  const bank = o.bank || new StairBank(drill.stair || { start: 2 }, { persist: o.persist });

  let stopped = false;
  let current = null;
  const waiters = new Set();
  const sleep = (ms) => new Promise((resolve) => {
    const id = setTimeout(done, ms);
    function done() { clearTimeout(id); waiters.delete(done); resolve(); }
    waiters.add(done);
  });
  const shell = openTraining({ onStop: () => { stopped = true; current?.resolve(null); for (const w of [...waiters]) w(); }, strobe: !!o.strobe });
  const canvas = h('canvas', { class: 'stage' });
  const tapzone = h('div', { class: 'tapzone' });
  const flash = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: 12, boxShadow: 'none', transition: 'box-shadow .12s' } });
  shell.root.prepend(canvas);
  shell.root.append(tapzone, flash);
  const g = canvas.getContext('2d');
  const clock = new FrameClock();
  const cal = settings.calibration;
  const rng = makeRng();
  let W = 0, H = 0;
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth || shell.root.clientWidth; H = canvas.clientHeight || shell.root.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const onResize = () => fitStage();
  window.addEventListener('resize', onResize);

  let resp = null;
  // Keep stimuli out from under the answer buttons: the canvas covers only the free area.
  function fitStage() {
    const box = { left: 0, right: 0, bottom: 0 };
    if (resp) {
      const cls = resp.el.className;
      if (cls.includes('right')) box.right = resp.el.offsetWidth + 20;
      else if (cls.includes('left')) box.left = resp.el.offsetWidth + 20;
      else if (cls.includes('bottom') || cls.includes('split')) box.bottom = resp.el.offsetHeight + 20;
    }
    for (const el of [canvas, tapzone]) Object.assign(el.style, { left: `${box.left}px`, right: `${box.right}px`, bottom: `${box.bottom}px`, top: '0px', width: 'auto', height: 'auto' });
    resize();
  }
  const api = {
    g, rng, settings, clock,
    get w() { return W; }, get h() { return H; },
    get cx() { return W / 2; }, get cy() { return H / 2; },
    ppd: pxPerDeg(cal.pxPerCm, cal.viewDistCm),
    deg(d) { return d * this.ppd; },
    // Visible field in degrees (for clamping eccentricities to the screen).
    get wDeg() { return W / this.ppd; }, get hDeg() { return H / this.ppd; },
    now,
    presentLead: () => clock.presentLead(),
    tapTime: (ts) => correctedTapTime(ts, settings.timing),
    complete(r) { current?.resolve(r ?? null); },
    message: (a, b, c, ms) => shell.message(a, b, c, ms),
    clearMessage: () => shell.clearMessage(),
    sound, haptic,
    setButtons(buttons, layout) {
      resp?.remove();
      resp = buttons?.length ? shell.responses(buttons, (id, ts) => inst.onButton?.(id, ts), { layout }) : null;
      fitStage();
      return resp;
    },
    enableButtons(v) { resp?.setEnabled(v); },
    bg: '#05070a',
    shell,
    opts: o,
  };
  const ctx = { settings, api };
  const inst = drill.create(api, o.variant);
  if (inst.buttons) api.setButtons(inst.buttons, inst.buttonLayout);

  tapzone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    inst.onPointer?.({ x: e.clientX - r.left, y: e.clientY - r.top, ts: eventTime(e), type: 'down', id: e.pointerId });
  });
  tapzone.addEventListener('pointermove', (e) => {
    if (!inst.onPointerMove) return;
    const r = canvas.getBoundingClientRect();
    inst.onPointerMove({ x: e.clientX - r.left, y: e.clientY - r.top, ts: eventTime(e), buttons: e.buttons });
  });
  const offKey = shell.onKey((e) => inst.onKey?.(e, eventTime(e)));

  let raf = 0;
  const loop = (ts) => {
    clock.tick(ts);
    g.fillStyle = inst.bg || api.bg;
    g.fillRect(0, 0, W, H);
    inst.frame?.(ts, ts + clock.presentLead());
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const sessionId = uid('s_');
  const startedAt = Date.now();
  const trials = [];
  if (o.strobe) shell.strobe.start();
  if (inst.intro) { shell.message(t(drill.nameKey), inst.intro()); await sleep(1600); shell.clearMessage(); }
  else await sleep(700);
  const t0 = now();
  const timeUp = () => (o.trials ? trials.length >= o.trials : (now() - t0) / 1000 >= (o.seconds || drill.defaultSeconds || 90));

  while (!stopped && !timeUp()) {
    if (shell.needsBreak()) { shell.strobe.stop(); await shell.breakPause(); if (o.strobe) shell.strobe.start(); }
    const stair = await bank.get(stairKey);
    const level = o.fixedLevel ?? stair.level;
    const params = drill.ladder(level, ctx);
    const trial = inst.nextTrial(params, level);
    shell.setHud([t(drill.nameKey), o.trials ? t('train.trial', { i: trials.length + 1, n: o.trials }) : t('train.timeLeft', { n: Math.max(0, Math.ceil((o.seconds || drill.defaultSeconds) - (now() - t0) / 1000)) }), o.fixedLevel === undefined ? t('train.level', { n: fmtNum(level, 1) }) : null]);
    const response = await new Promise((resolve) => {
      current = { resolve };
      inst.start(trial, now());
      if (trial._timeoutMs) sleep(trial._timeoutMs).then(() => resolve(null));
    });
    current = null;
    if (stopped && !response) break;
    const res = inst.score(trial, response);
    const rec = {
      id: `${sessionId}:${trials.length}`, sessionId, module: o.module, mode: drill.id, drill: drill.id, variant: o.variant, idx: trials.length, t: Date.now(),
      skill: drill.skill, level: r1(level), stairKey,
      stimulus: compact(trial), params: compact(params),
      response: compact({ ...(response || {}), ...res }),
      correct: !!res.correct, rtMs: r1(res.rtMs), errorMs: r1(res.errorMs),
      assessmentId: o.assessmentId,
    };
    trials.push(rec);
    await app.repo.addTrial(rec);
    if (o.fixedLevel === undefined && drill.adaptive !== false) await bank.update(stairKey, rec.correct);
    if (o.feedback && inst.feedback !== false) {
      fb(rec.correct);
      flash.style.boxShadow = `inset 0 0 0 10px ${rec.correct ? 'rgba(61,220,132,.85)' : 'rgba(255,93,93,.85)'}`;
      if (res.note) shell.message(null, res.note, '', 700);
      setTimeout(() => { flash.style.boxShadow = 'none'; }, 260);
    }
    await sleep(inst.iti ? inst.iti(res) : 450);
  }

  shell.strobe.stop();
  const stairState = bank.cache.get(stairKey);
  const summary = {
    n: trials.length,
    accuracy: trials.length ? trials.filter((x) => x.correct).length / trials.length : NaN,
    meanRt: mean(trials.filter((x) => Number.isFinite(x.rtMs) && x.correct).map((x) => x.rtMs)),
    threshold: stairState ? thresholdEstimate(stairState) : NaN,
    levelStart: bank.startLevel(stairKey),
    levelEnd: stairState?.level,
    ...(inst.summary?.(trials) || {}),
  };
  const session = {
    id: sessionId, kind: o.module === 'gym' ? 'gym' : 'eyecheck', module: o.module, mode: drill.id, drill: drill.id, variant: o.variant,
    startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt, stopped, summary: compact(summary), assessmentId: o.assessmentId,
    config: { seconds: o.seconds, trials: o.trials, strobe: !!o.strobe },
  };
  if (trials.length) await app.repo.saveSession(session);
  if (o.summaryPanel) {
    await new Promise((resolve) => {
      const done = () => { shell.clearPanel(); resolve(); };
      shell.panel([
        h('h2', null, stopped ? t('train.stopped') : t('train.complete')),
        h('div', { class: 'row', style: { gap: '22px' } },
          kpi(Number.isFinite(summary.accuracy) ? `${Math.round(summary.accuracy * 100)}%` : '–', t('gym.sum.accuracy', { n: summary.n })),
          Number.isFinite(summary.meanRt) ? kpi(`${Math.round(summary.meanRt)} ms`, t('gym.sum.rt')) : null,
          drill.adaptive !== false && o.fixedLevel === undefined ? kpi(`${fmtNum(summary.levelStart, 1)} → ${fmtNum(summary.levelEnd, 1)}`, t('gym.sum.level')) : null,
          summary.extraValue ? kpi(summary.extraValue, summary.extraLabel) : null),
        drill.ladderText ? h('p', { class: 'hint' }, drill.ladderText(summary.levelEnd ?? 0, ctx)) : null,
        h('div', { class: 'row', style: { marginTop: '10px' } },
          h('button', { class: 'btn primary', 'data-test': 'drill-done', on: { click: done } }, o.doneLabel || t('common.done')),
          h('button', { class: 'btn small', on: { click: async () => { await reportDiscomfort(); done(); } } }, t('train.discomfort'))),
      ]);
    });
  }
  cancelAnimationFrame(raf);
  offKey();
  window.removeEventListener('resize', onResize);
  inst.dispose?.();
  await shell.close();
  return { session, trials, summary, stair: stairState, stopped };
}

function kpi(v, l) { return h('div', { class: 'kpi' }, h('span', { class: 'v' }, v), h('span', { class: 'l' }, l)); }
