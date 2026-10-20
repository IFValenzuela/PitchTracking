// Fullscreen training shell shared by Pitch Lab, Gym drills and the Eye Check.
// Provides the always-visible STOP control, HUD, response buttons with precise
// pointer timestamps, the strobe overlay, usage tracking and break reminders.
import { app } from '../app.js';
import { t } from '../i18n/i18n.js';
import { h, clear } from './dom.js';
import { eventTime, now } from '../engine/timing.js';
import { clampStrobe, strobeActive } from './safety.js';
import { unlockAudio } from './feedback.js';

let sinceBreakMs = 0; // continuous training time since the last break (this page load)

export function openTraining({ onStop, strobe: wantStrobe = false } = {}) {
  unlockAudio();
  const prefs = app.repo.settings.prefs;
  const started = now();
  let closed = false;
  let stopped = false;
  const keyHandlers = new Set();

  const hud = h('div', { class: 'hud', 'aria-live': 'off' });
  const strobeEl = h('div', { class: 'strobe', 'aria-hidden': 'true' });
  const stopBtn = h('button', { class: 'stop-btn', 'aria-label': t('train.stopLabel'), title: t('train.stopLabel') }, t('train.stop'));
  const root = h('div', { class: `train ${prefs.reduceMotion ? 'reduce-motion' : ''}`, role: 'application' }, hud, strobeEl, stopBtn);
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  const doStop = () => {
    if (stopped || closed) return;
    stopped = true;
    strobeCtl.stop();
    onStop?.();
  };
  // pointerdown, not click: the stop must act instantly.
  stopBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); doStop(); });
  stopBtn.addEventListener('click', (e) => { e.preventDefault(); doStop(); });

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); doStop(); return; }
    if (e.repeat) return;
    for (const fn of keyHandlers) fn(e);
  };
  window.addEventListener('keydown', onKey);

  // Best effort fullscreen + landscape; both may be refused, which is fine.
  try {
    if (!document.fullscreenElement && root.requestFullscreen && !navigator.webdriver) {
      root.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    }
  } catch { /* ignore */ }

  // ---- strobe overlay -------------------------------------------------
  let strobeRaf = 0;
  const strobeCtl = {
    active: false,
    start() {
      if (!wantStrobe || !strobeActive()) return false;
      const { hz, duty } = clampStrobe({ hz: app.repo.settings.safety.strobeHz, duty: app.repo.settings.safety.strobeDuty });
      const dim = app.repo.settings.safety.strobeDim;
      const period = 1000 / hz;
      const t0 = now();
      strobeEl.style.background = dim ? '#1a1d22' : '#000';
      this.active = true;
      const loop = (ts) => {
        if (!this.active) return;
        const phase = ((ts - t0) % period) / period;
        strobeEl.style.opacity = phase < duty ? '0' : '1';
        strobeRaf = requestAnimationFrame(loop);
      };
      strobeRaf = requestAnimationFrame(loop);
      return true;
    },
    stop() {
      this.active = false;
      cancelAnimationFrame(strobeRaf);
      strobeEl.style.opacity = '0';
    },
  };

  const shell = {
    root,
    get stopped() { return stopped; },
    strobe: strobeCtl,
    stop: doStop,

    setHud(parts) {
      clear(hud);
      for (const p of parts.filter(Boolean)) hud.appendChild(h('span', { class: 'pill' }, p));
    },

    message(big, sub, cls = '', ms = 0) {
      root.querySelector('.center-msg')?.remove();
      const el = h('div', { class: `center-msg ${cls}`, role: 'status' }, big && h('div', { class: 'big' }, big), sub && h('div', { class: 'sub' }, sub));
      root.appendChild(el);
      if (ms) setTimeout(() => el.remove(), ms);
      return el;
    },

    clearMessage() { root.querySelector('.center-msg')?.remove(); },

    // buttons: [{id, label, sub, key:['f','ArrowLeft'], cls}]
    // onPress(id, timestampMs, event). Returns {el, setEnabled(bool), remove()}.
    responses(buttons, onPress, { layout } = {}) {
      const landscape = innerWidth > innerHeight;
      const side = layout || (landscape ? prefs.buttonSide : 'bottom');
      const bar = h('div', { class: `resp ${side}` });
      let enabled = true;
      const fire = (b, ts, e) => {
        if (!enabled || stopped) return;
        onPress(b.id, ts, e);
      };
      for (const b of buttons) {
        const el = h('button', { class: `rbtn ${b.cls || ''}`, dataset: { id: b.id }, 'aria-label': b.aria || b.label },
          b.label, b.key?.length ? h('span', { class: 'k', 'aria-hidden': 'true' }, b.keyLabel || b.key[0].replace('Arrow', '').toUpperCase()) : null);
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('pressed'); setTimeout(() => el.classList.remove('pressed'), 120); fire(b, eventTime(e), e); });
        el.addEventListener('click', (e) => { if (e.detail === 0) fire(b, now(), e); }); // keyboard activation of the button
        bar.appendChild(el);
      }
      const keyFn = (e) => {
        const b = buttons.find((x) => x.key?.some((k) => k.toLowerCase() === e.key.toLowerCase()));
        if (b) { e.preventDefault(); fire(b, eventTime(e), e); }
      };
      keyHandlers.add(keyFn);
      root.appendChild(bar);
      return {
        el: bar,
        setEnabled(v) { enabled = v; for (const c of bar.children) c.disabled = !v; },
        remove() { keyHandlers.delete(keyFn); bar.remove(); },
      };
    },

    onKey(fn) { keyHandlers.add(fn); return () => keyHandlers.delete(fn); },

    panel(content, { centered = true } = {}) {
      root.querySelector('.panel')?.remove();
      const el = h('div', { class: `panel ${centered ? 'centered' : ''}` }, content);
      root.appendChild(el);
      return el;
    },

    clearPanel() { root.querySelector('.panel')?.remove(); },

    elapsedMs() { return now() - started; },

    needsBreak() {
      const every = app.repo.settings.safety.breakEveryMin;
      return every > 0 && sinceBreakMs + (now() - started) > every * 60000;
    },

    // Shows the break reminder with a 20 s countdown. Resolves when dismissed.
    breakPause() {
      return new Promise((resolve) => {
        const mins = Math.round((sinceBreakMs + (now() - started)) / 60000);
        let left = 20;
        const count = h('div', { class: 'kpi' }, h('span', { class: 'v' }, String(left)));
        const btn = h('button', { class: 'btn primary', on: { click: () => done() } }, t('common.continue'));
        const timer = setInterval(() => { left -= 1; count.firstChild.textContent = String(Math.max(0, left)); if (left <= 0) clearInterval(timer); }, 1000);
        const done = () => { clearInterval(timer); sinceBreakMs = -(now() - started); shell.clearPanel(); resolve(); };
        shell.panel([h('h2', null, t('train.breakTitle')), h('p', null, t('train.breakBody', { n: mins })), count, btn]);
      });
    },

    async close() {
      if (closed) return;
      closed = true;
      strobeCtl.stop();
      window.removeEventListener('keydown', onKey);
      const elapsed = now() - started;
      sinceBreakMs += elapsed;
      root.remove();
      document.body.style.overflow = '';
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
      try { screen.orientation?.unlock?.(); } catch { /* ignore */ }
      await app.repo.addUsage(elapsed);
    },
  };
  return shell;
}
