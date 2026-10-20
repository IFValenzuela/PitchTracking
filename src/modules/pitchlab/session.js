// Pitch Lab session controller: runs a block of pitches in one mode, collects
// precisely timed responses, scores them, adapts difficulty and logs every trial.
import { app } from '../../app.js';
import { t, fmtNum, has } from '../../i18n/i18n.js';
import { h } from '../../ui/dom.js';
import { openTraining } from '../../ui/training.js';
import { preTrainingCheck, reportDiscomfort } from '../../ui/safety.js';
import { feedback as fb, mittPop, sound } from '../../ui/feedback.js';
import { PitchScene } from '../../render/scene3d.js';
import { WINDUP_S } from '../../render/pitcher.js';
import { xrSupported } from '../../render/stereo.js';
import { makeRng } from '../../engine/rng.js';
import { strikeZone } from '../../engine/zone.js';
import { correctedTapTime, now } from '../../engine/timing.js';
import { uid } from '../../data/repo.js';
import { StairBank } from '../stairs.js';
import { MODES, describePitch } from './modes.js';
import { summarizeLab } from './stats.js';
import { resultPlot, locationPicker } from './zoneplot.js';
import { openReview } from './review.js';

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : v);

export class PitchLabSession {
  /**
   * cfg: { mode, types, hand, slot, count, strobe, occlTask, pairs }
   * opts: { fixedLevel, feedback (bool), sessionKind, doneLabel, title, assessmentId }
   */
  constructor(cfg, opts = {}) {
    this.cfg = { types: ['FF', 'SL', 'CH'], hand: 'R', slot: 'threeQuarter', count: app.repo.settings.prefs.blockSize, ...cfg };
    this.opts = { feedback: true, sessionKind: 'pitchlab', ...opts };
    this.mode = MODES[this.cfg.mode];
    this.settings = app.repo.settings;
    this.zone = strikeZone(this.settings.profile.heightIn);
    this.rng = makeRng();
    this.ctx = { cfg: this.cfg, settings: this.settings, zone: this.zone, rng: this.rng };
    this.bank = new StairBank({ start: 2 });
    this.sessionId = uid('s_');
    this.trials = [];
    this.stopped = false;
    this.pending = null;
    this.waiters = new Set();
  }

  // ---- small async helpers that end early when stopped ----
  sleep(ms) {
    return new Promise((resolve) => {
      const id = setTimeout(done, ms);
      const self = this;
      function done() { clearTimeout(id); self.waiters.delete(done); resolve(); }
      this.waiters.add(done);
    });
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.pending?.resolve(null);
    for (const w of [...this.waiters]) w();
  }

  async run() {
    if (!this.opts.skipChecks && !(await preTrainingCheck())) return null;
    const startedAt = Date.now();
    const shell = openTraining({ onStop: () => this.stop(), strobe: !!this.cfg.strobe });
    this.shell = shell;
    const stage = h('div', { style: { position: 'absolute', inset: '0' } });
    shell.root.prepend(stage);
    let scene;
    try {
      scene = new PitchScene(stage, this.settings);
    } catch (err) {
      console.error(err);
      shell.message(t('lab.noWebGL'), err.message, 'bad');
      await this.sleep(4000);
      await shell.close();
      return null;
    }
    this.scene = scene;
    scene.setZone(this.zone);
    if (this.cfg.zoneAssist) scene.showZone(true); // assist mode: translucent zone during play
    window.__pitchScene = scene; // e2e hook
    if (scene.fovInfo.scale < 0.95 && this.settings.prefs.view === 'batter') {
      shell.message(null, t('lab.fovScaled', { n: Math.round(scene.fovInfo.scale * 100) }), '', 2500);
    }
    if (innerHeight > innerWidth && innerWidth < 700) shell.message(null, t('train.landscape'), '', 2500);
    this.#maybeXR();
    if (this.cfg.strobe) shell.strobe.start();

    await this.sleep(900);
    for (let i = 0; i < this.cfg.count && !this.stopped; i++) {
      if (shell.needsBreak()) { shell.strobe.stop(); await shell.breakPause(); if (this.cfg.strobe) shell.strobe.start(); }
      await this.#trial(i);
    }
    shell.strobe.stop();
    const summary = summarizeLab(this.trials);
    const levels = {};
    for (const [k, s] of this.bank.cache) levels[k] = { start: this.bank.startLevel(k), end: s.level };
    const session = {
      id: this.sessionId, kind: this.opts.sessionKind, module: this.opts.module || 'pitchlab', mode: this.cfg.mode,
      startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt,
      config: { ...this.cfg }, stopped: this.stopped,
      summary: compactSummary(summary, levels),
      assessmentId: this.opts.assessmentId,
    };
    if (this.trials.length) await app.repo.saveSession(session);
    const result = { session, summary, trials: this.trials, stopped: this.stopped };
    if (this.opts.summaryPanel !== false) await this.#endPanel(summary, levels);
    scene.dispose();
    window.__pitchScene = null;
    await shell.close();
    return result;
  }

  async #maybeXR() {
    if (!(await xrSupported())) return;
    const btn = h('button', { class: 'btn small vr-btn', on: { click: async () => {
      try {
        await this.scene.enterXR((which, ts) => {
          const ids = this.currentButtons?.map((b) => b.id) || [];
          const id = which === 'primary' ? ids[ids.length - 1] : ids[0];
          if (id) this.#onPress(id, ts);
        });
        btn.remove();
      } catch (e) { console.warn(e); }
    } } }, t('lab.enterVR'));
    this.shell.root.appendChild(btn);
  }

  #onPress(id, ts) {
    const p = this.pending;
    if (!p || p.kind !== 'buttons') return;
    if (ts < p.releaseAt) return; // ignore presses before the ball is released
    const rt = correctedTapTime(ts, this.settings.timing) - p.releaseAt;
    p.resolve({ id, rtMs: rt, ts });
  }

  #hud(i, level) {
    const done = this.trials.length, ok = this.trials.filter((x) => x.correct).length;
    this.shell.setHud([t(`lab.mode.${this.cfg.mode}`), t('train.trial', { i: i + 1, n: this.cfg.count }), this.opts.fixedLevel === undefined ? t('train.level', { n: fmtNum(level, 1) }) : null, done ? `${ok}/${done} ✓` : null]);
  }

  // Throws one pitch. If `respond`, resolves with the response (or null).
  async #throw(pitch, trial, { respond }) {
    const releaseAt = now() + WINDUP_S * 1000 + 350;
    const plateAt = releaseAt + pitch.flightMs;
    this.scene.setPitcher(pitch.pitcher);
    this.scene.setPitch(pitch, { releaseAt, occlusionFt: trial.occlusionFt ?? Infinity, cue: trial.cue ?? 0 });
    const popTimer = setTimeout(() => { if (!this.stopped) mittPop(); }, plateAt - now());
    if (!respond) {
      await this.sleep(plateAt - now() + 600);
      clearTimeout(popTimer);
      return null;
    }
    const deadline = plateAt + trial.deadlineAfterPlateMs;
    let resp;
    if (this.mode.respondAfterPitch) {
      await this.sleep(plateAt - now() + 250);
      if (this.stopped) return null;
      resp = await new Promise((resolve) => {
        const shownAt = now();
        const picker = locationPicker(this.shell.root, this.zone, (loc, e) => { picker.remove(); resolve({ loc, rtMs: e.timeStamp - shownAt }); });
        this.pending = { kind: 'picker', resolve: (v) => { picker.remove(); resolve(v); } };
        this.sleep(deadline - now()).then(() => { if (picker.isConnected) { picker.remove(); resolve(null); } });
      });
    } else {
      this.resp.setEnabled(true);
      resp = await new Promise((resolve) => {
        this.pending = { kind: 'buttons', releaseAt, resolve };
        this.sleep(deadline - now()).then(() => resolve(null));
      });
      this.resp.setEnabled(false);
    }
    this.pending = null;
    clearTimeout(popTimer);
    if (now() < plateAt) setTimeout(() => { if (!this.stopped) mittPop(); }, plateAt - now());
    // Let the pitch finish before feedback in swing mode (the outcome depends on it).
    if (this.cfg.mode === 'swing') await this.sleep(Math.max(0, plateAt - now() + 120));
    return resp;
  }

  async #trial(i) {
    const mode = this.mode;
    const ctx = this.ctx;
    const pre = mode.preTrial?.(ctx) || {};
    const key = mode.stairKey(pre, ctx);
    const stair = await this.bank.get(key);
    const level = this.opts.fixedLevel ?? stair.level;
    const trial = mode.makeTrial(ctx, level, pre);
    this.#hud(i, level);
    const buttons = mode.buttons(ctx, trial);
    if (!this.resp || mode.id === 'tunnel') {
      this.resp?.remove();
      this.resp = this.shell.responses(buttons, (id, ts) => this.#onPress(id, ts), { layout: this.settings.prefs.stereo === 'sbs' ? 'sbs' : undefined });
      this.currentButtons = buttons;
    }
    this.resp.setEnabled(false);
    this.shell.clearMessage();

    // Lead-in pitches (Tunnel Trainer shows the first pitch of the pair).
    for (const lead of trial.pitches.slice(0, -1)) {
      this.shell.message(null, t('lab.watchFirst', { type: t(`pitch.${lead.type}`) }));
      await this.#throw(lead, trial, { respond: false });
      if (this.stopped) return;
      this.shell.message(null, t('lab.nameSecond'), '', 1600);
    }
    const pitch = trial.pitches[trial.pitches.length - 1];
    const resp = await this.#throw(pitch, trial, { respond: true });
    if (this.stopped && !resp) return;

    const res = mode.evaluate(trial, resp, ctx);
    trial.stim = { ...describePitch(pitch, this.zone), occlusionFt: trial.occlusionFt, firstType: trial.firstType, pair: trial.pair, tunnelToPlateFt: trial.params.tunnelToPlateFt, divergenceToPlateFt: r1(trial.divergence?.toPlate), cue: r1(trial.cue) };
    const record = {
      id: `${this.sessionId}:${i}`, sessionId: this.sessionId, module: this.opts.module || 'pitchlab', mode: mode.id, idx: i, t: Date.now(),
      skill: mode.skill, level: r1(level), stairKey: key,
      stimulus: trial.stim,
      params: Object.fromEntries(Object.entries(trial.params).map(([k, v]) => [k, r1(v)])),
      response: { id: resp?.id ?? null, call: res.call ?? null, rtMs: r1(resp?.rtMs), decision: res.decision, decisionCorrect: res.decisionCorrect, timingErrMs: r1(res.timingErrMs), errIn: r1(res.errIn), loc: resp?.loc, timeout: !!res.timeout },
      correct: !!res.correct,
      rtMs: r1(resp?.rtMs),
      assessmentId: this.opts.assessmentId,
    };
    this.trials.push(record);
    await app.repo.addTrial(record);
    if (this.opts.fixedLevel === undefined) await this.bank.update(key, record.correct);

    if (this.opts.feedback) {
      fb(record.correct);
      const f = mode.feedback(trial, res);
      this.shell.message(f.big, f.sub, record.correct ? 'good' : 'bad');
      const plot = resultPlot(this.zone, { x: pitch.plate.x, z: pitch.plate.z }, { correct: record.correct, guess: res.loc });
      this.shell.root.appendChild(plot);
      const reviewBtn = h('button', { class: 'btn small', 'data-test': 'review-btn', style: { position: 'absolute', left: '12px', top: '222px', zIndex: 26 } }, t('lab.review'));
      let reviewing = null;
      reviewBtn.addEventListener('click', () => { plot.remove(); reviewBtn.remove(); reviewing = this.#review(trial); });
      this.shell.root.appendChild(reviewBtn);
      await this.sleep(1300);
      reviewBtn.remove();
      if (reviewing) await reviewing;
      plot.remove();
      this.shell.clearMessage();
    } else {
      sound('tick');
      await this.sleep(500);
    }
  }

  async #review(trial) {
    this.reviewing = true;
    this.resp?.el && (this.resp.el.style.visibility = 'hidden');
    await openReview({ shell: this.shell, scene: this.scene, trial, zone: this.zone, stop: () => this.stopped });
    this.resp?.el && (this.resp.el.style.visibility = '');
    if (this.cfg.zoneAssist) this.scene.showZone(true);
    this.reviewing = false;
  }

  #endPanel(summary, levels) {
    return new Promise((resolve) => {
      const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '–');
      const rows = [];
      rows.push(h('div', { class: 'row', style: { gap: '22px' } },
        kpi(pct(summary.accuracy), t('lab.sum.accuracy', { n: summary.n })),
        Number.isFinite(summary.meanRt) ? kpi(`${Math.round(summary.meanRt)} ms`, t('lab.sum.rt')) : null,
        ...Object.entries(levels).slice(0, 3).map(([k, v]) => kpi(`${fmtNum(v.start, 1)} → ${fmtNum(v.end, 1)}`, t('lab.sum.level', { key: stairLabel(k) })))));
      const sd = summary.sdt;
      if (sd && sd.n) rows.push(h('p', null, biasText(sd)));
      if (summary.timing) rows.push(h('p', null, t('lab.sum.timing', { abs: Math.round(summary.timing.meanAbsErr), early: Math.round(summary.timing.earlyPct), late: Math.round(summary.timing.latePct) })));
      if (summary.decisions) rows.push(h('p', null, t('lab.sum.decisions', { ok: Math.round(summary.decisions.correctPct), chase: fmtNum(summary.decisions.chasePct, 0) })));
      if (Number.isFinite(summary.locErrIn)) rows.push(h('p', null, t('lab.sum.locErr', { n: summary.locErrIn.toFixed(1) })));
      if (summary.byType.length > 1) {
        rows.push(h('table', { class: 'data' }, h('tr', null, h('th', null, t('lab.sum.type')), h('th', null, t('lab.sum.acc')), h('th', null, 'n')),
          summary.byType.map((g) => h('tr', null, h('td', null, t(`pitch.${g.key}`)), h('td', null, pct(g.accuracy)), h('td', null, g.n)))));
      }
      const done = () => { this.shell.clearPanel(); resolve(); };
      this.shell.panel([
        h('h2', null, this.stopped ? t('train.stopped') : t('train.complete')),
        ...rows,
        h('div', { class: 'row', style: { marginTop: '10px' } },
          h('button', { class: 'btn primary', 'data-test': 'lab-done', on: { click: done } }, this.opts.doneLabel || t('common.done')),
          h('button', { class: 'btn small', on: { click: async () => { await reportDiscomfort(); done(); } } }, t('train.discomfort'))),
      ]);
    });
  }
}

function kpi(v, l) { return h('div', { class: 'kpi' }, h('span', { class: 'v' }, v), h('span', { class: 'l' }, l)); }

export function stairLabel(key) {
  const [, kind, ...rest] = key.split(':');
  const base = t(`lab.mode.${kind === 'loc' ? 'location' : kind === 'occl' ? 'occlusion' : kind}`);
  return rest.length ? `${base} ${rest.join(' ').split('|').map((k) => (has(`pitch.${k}`) ? t(`pitch.${k}`) : has(`lab.mode.${k}`) ? t(`lab.mode.${k}`) : k)).join('/')}` : base;
}

export function biasText(sd) {
  if (sd.bias === 'thin') return t('lab.bias.thin', { n: sd.n });
  const vals = { fa: Math.round((sd.faRate || 0) * 100), miss: Math.round((1 - (sd.hitRate || 0)) * 100) };
  return `${t('lab.bias.rates', vals)} ${t(`lab.bias.${sd.bias}`)}`;
}

function compactSummary(s, levels) {
  return {
    n: s.n, correct: s.correct, accuracy: s.accuracy, meanRt: s.meanRt,
    sdt: s.sdt && { hits: s.sdt.hits, misses: s.sdt.misses, fas: s.sdt.fas, crs: s.sdt.crs, dprime: s.sdt.dprime, c: s.sdt.c, bias: s.sdt.bias },
    timing: s.timing, decisions: s.decisions, locErrIn: s.locErrIn,
    byType: s.byType.map(({ key, n, correct }) => ({ key, n, correct })),
    levels,
  };
}

// Convenience used by views and the plan player.
export async function runPitchLab(cfg, opts) { return new PitchLabSession(cfg, opts).run(); }
