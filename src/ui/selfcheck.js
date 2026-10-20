// Settings → Timing self-check: frame-rate test and tap-timing test.
import { app } from '../app.js';
import { t, fmtNum, fmtDate } from '../i18n/i18n.js';
import { h, toggle } from './dom.js';
import { frameStats, syncStats, eventTime, now, mean } from '../engine/timing.js';
import { openTraining } from './training.js';

// Runs rAF for `ms` while drawing a moving bar (light load). Resolves with stats.
export function measureFrames(ms = 3000, canvas = null) {
  return new Promise((resolve) => {
    const intervals = [];
    let last = 0;
    const t0 = now();
    const g = canvas?.getContext('2d');
    const loop = (ts) => {
      if (last) intervals.push(ts - last);
      last = ts;
      if (g) {
        const { width: w, height: hh } = canvas;
        g.fillStyle = '#0b0f14'; g.fillRect(0, 0, w, hh);
        g.fillStyle = '#46c2ff';
        const x = ((ts - t0) / 4) % w;
        g.fillRect(x, 0, 6, hh);
      }
      if (ts - t0 < ms) requestAnimationFrame(loop);
      else resolve(frameStats(intervals));
    };
    requestAnimationFrame(loop);
  });
}

// Tap-along test in the training shell. Resolves with sync stats + dispatch delay, or null.
export function tapSyncTest({ beats = 16, periodMs = 750, warmup = 3 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const shell = openTraining({ onStop: () => finish(true) });
    const sq = h('div', { style: { position: 'absolute', left: '50%', top: '50%', width: '34vmin', height: '34vmin', transform: 'translate(-50%,-50%)', background: '#fff', opacity: '0', borderRadius: '12px' } });
    const zone = h('div', { class: 'tapzone' });
    shell.root.append(sq, zone);
    shell.message(null, t('check.tapHere'));
    const flashes = []; // estimated present times
    const taps = [];
    const dispatch = [];
    let frame = 16.7, last = 0;
    const tStart = now() + 1200;
    let beat = 0;
    let raf;
    const loop = (ts) => {
      if (last) frame = frame * 0.9 + (ts - last) * 0.1;
      last = ts;
      const due = tStart + beat * periodMs;
      // Draw the flash on the frame closest to its scheduled time.
      if (ts + frame / 2 >= due && beat < beats) {
        sq.style.opacity = '1';
        flashes.push(ts + frame); // visible about one frame after rAF
        beat++;
        setTimeout(() => { sq.style.opacity = '0'; }, 90);
      }
      if (beat >= beats && ts > due + periodMs) { finish(false); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const ts = eventTime(e);
      taps.push(ts);
      dispatch.push(now() - ts);
    });
    async function finish(aborted) {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      await shell.close();
      if (aborted) { resolve(null); return; }
      // Pair each flash (after warm-up) with the nearest tap within half a period.
      const asyncs = [];
      flashes.slice(warmup).forEach((f) => {
        let best = null;
        for (const tp of taps) if (Math.abs(tp - f) < periodMs / 2 && (best === null || Math.abs(tp - f) < Math.abs(best - f))) best = tp;
        if (best !== null) asyncs.push(best - f);
      });
      if (asyncs.length < 6) { resolve({ notEnough: true }); return; }
      resolve({ ...syncStats(asyncs, frame), dispatchMs: mean(dispatch), frameMs: frame });
    }
  });
}

export function selfCheckWidget() {
  const repo = app.repo;
  const fpsOut = h('p', { class: 'muted', 'data-test': 'fps-out' });
  const tapOut = h('p', { class: 'muted', 'data-test': 'tap-out' });
  const canvas = h('canvas', { width: 320, height: 24, style: { width: '100%', height: '24px', borderRadius: '6px', display: 'block' } });
  const render = () => {
    const lc = repo.settings.timing.lastCheck;
    if (lc?.fps) {
      const f = lc.fps;
      fpsOut.textContent = `${t('check.fpsResult', { fps: fmtNum(f.fps, 0), med: fmtNum(f.medianMs, 1), p95: fmtNum(f.p95Ms, 1), late: fmtNum(f.latePct, 1) })} ${f.fps >= 55 && f.latePct < 5 ? t('check.fpsGood') : t('check.fpsWarn')}`;
    } else fpsOut.textContent = t('check.never');
    if (lc?.tap) {
      const s = lc.tap;
      tapOut.textContent = `${t('check.tapResult', { mean: fmtNum(s.meanMs, 0), sd: fmtNum(s.sdMs, 0), unc: fmtNum(s.uncertaintyMs, 0) })} · ${t('check.dispatch', { n: fmtNum(s.dispatchMs, 1) })}`;
    } else tapOut.textContent = '';
  };
  const save = (patch) => repo.saveSettings({ timing: { lastCheck: { ...(repo.settings.timing.lastCheck || {}), ...patch, at: Date.now() } } }).then(render);
  const fpsBtn = h('button', { class: 'btn', 'data-test': 'fps-run', on: { click: async () => {
    fpsBtn.disabled = true;
    const stats = await measureFrames(3000, canvas);
    fpsBtn.disabled = false;
    await save({ fps: stats });
  } } }, t('check.fpsRun'));
  const tapBtn = h('button', { class: 'btn', 'data-test': 'tap-run', on: { click: async () => {
    const r = await tapSyncTest();
    if (!r) return;
    if (r.notEnough) { tapOut.textContent = t('check.tapNotEnough'); return; }
    await repo.saveSettings({ timing: { inputOffsetMs: Math.round(r.meanMs) } });
    await save({ tap: r });
  } } }, t('check.tapRun'));
  const last = h('p', { class: 'hint' });
  const lc = repo.settings.timing.lastCheck;
  last.textContent = lc?.at ? t('check.lastRun', { date: fmtDate(lc.at, { dateStyle: 'medium' }) }) : '';
  render();
  return h('div', { class: 'stack' },
    h('p', null, t('check.body')),
    canvas,
    h('div', { class: 'row' }, fpsBtn), fpsOut,
    h('p', { class: 'hint' }, t('check.tapBody')),
    h('div', { class: 'row' }, tapBtn), tapOut,
    toggle(repo.settings.timing.applyOffset, (v) => repo.saveSettings({ timing: { applyOffset: v } }), t('check.applyOffset')),
    h('p', { class: 'hint' }, t('check.applyHint')),
    last);
}
