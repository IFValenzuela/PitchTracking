// Review mode: replay a pitch forward/backward, in slow motion, from any camera,
// with the release point, path, tunnel/divergence point, strike zone and true spin.
import * as THREE from 'three';
import { t, fmtNum } from '../../i18n/i18n.js';
import { h } from '../../ui/dom.js';
import { stateAt, crossingAt } from '../../engine/physics.js';
import { toThree } from '../../render/pitcher.js';
import { BALL_RADIUS } from '../../engine/units.js';

const VIEWS = ['batter', 'catcher', 'side', 'overhead', 'orbit'];

export function pitchInfoLines(p, stim) {
  const lines = [
    `<b>${t(`pitch.${p.type}`)}</b> · ${p.hand === 'L' ? t('lab.lhp') : t('lab.rhp')}`,
    t('lab.rev.speed', { rel: fmtNum(p.mph, 1), plate: fmtNum(p.plateMph, 1) }),
    t('lab.rev.spin', { rpm: Math.round(p.rpm), eff: Math.round(p.eff * 100), clock: p.clock }),
    t('lab.rev.break', { ivb: fmtNum(p.ivbIn, 1), hb: fmtNum(Math.abs(p.armSideBreakIn), 1), side: t(p.armSideBreakIn >= 0 ? 'lab.armSide' : 'lab.gloveSide') }),
    t('lab.rev.flight', { ms: Math.round(p.flightMs) }),
  ];
  if (stim) lines.push(t(stim.isStrike ? 'lab.edgeInside' : 'lab.edgeOutside', { n: Math.abs(stim.edgeIn).toFixed(1) }));
  return lines;
}

export function openReview({ shell, scene, trial, zone, stop }) {
  return new Promise((resolve) => {
    const pitches = trial.pitches;
    const main = pitches[pitches.length - 1];
    const first = pitches.length > 1 ? pitches[0] : null;
    const tEnd = main.plate.t + 0.04;
    let tCur = 0, speed = 0.25, dir = 0, raf = 0, last = 0;
    const prevView = scene.view;
    const prevOccl = scene.occlusionFt;
    scene.occlusionFt = Infinity;
    scene.setPitch(main, { releaseAt: Infinity, occlusionFt: Infinity, cue: 0 });
    scene.setReviewTime(0);
    scene.showZone(true);
    scene.clearOverlays();
    const opts = { path: true, zone: true, release: true, cue: false };
    const overlays = () => {
      scene.clearOverlays();
      if (opts.path) {
        scene.addTrajectory(main, 0xffd34d);
        if (first) scene.addTrajectory(first, 0x46c2ff, { dashed: true });
      }
      if (opts.release) scene.addMarker(main.p0, 0xff5d5d, 0.35);
      if (trial.tunnelPoint) scene.addTunnelWindow(trial.tunnelPoint, 0.6, 0x3ddc84);
      if (trial.divergence && first) {
        const c = crossingAt(main.traj, trial.divergence.y);
        if (c) scene.addMarker([c.x, c.y, c.z], 0xffffff, 0.3);
      }
      scene.addGhost([main.plate.x, main.plate.y ?? 1.417, main.plate.z], 0xffd34d, 0.45);
      scene.showZone(opts.zone);
      scene.ball.setCue(opts.cue ? 1 : 0);
    };
    overlays();
    // a ghost ball for the first pitch of a tunnel pair, moving in sync
    let ghost = null;
    if (first) {
      ghost = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 16, 10), new THREE.MeshBasicMaterial({ color: 0x46c2ff, transparent: true, opacity: 0.6 }));
      scene.scene.add(ghost);
    }

    const info = h('div', { class: 'review-info', 'data-test': 'review-info' });
    const lines = pitchInfoLines(main, trial.stim);
    if (first) {
      lines.push(t('lab.rev.first', { type: t(`pitch.${first.type}`) }));
      lines.push(t('lab.divergedAt', { n: fmtNum(trial.divergence.toPlate, 0) }));
    }
    if (trial.occlusionFt && Number.isFinite(trial.occlusionFt)) lines.push(t('lab.occludedAt', { n: fmtNum(trial.occlusionFt, 0) }));
    info.innerHTML = lines.join('<br>');
    const timeLabel = h('span', { class: 'badge' });
    const scrub = h('input', { type: 'range', min: -0.3, max: tEnd, step: 0.001, value: 0, 'aria-label': t('lab.rev.time'),
      on: { input: () => { dir = 0; setT(Number(scrub.value)); } } });
    const setT = (v) => {
      tCur = Math.max(-0.3, Math.min(tEnd, v));
      scrub.value = tCur;
      scene.setReviewTime(tCur);
      const s = stateAt(main.traj, Math.max(0, tCur));
      timeLabel.textContent = `${Math.round(tCur * 1000)} ms · ${fmtNum(Math.max(0, s.y - 1.417), 1)} ft`;
      if (ghost) {
        const g = stateAt(first.traj, Math.max(0, tCur));
        ghost.visible = tCur >= 0 && tCur <= first.plate.t + 0.04;
        ghost.position.copy(toThree([g.x, g.y, g.z]));
      }
    };
    const tick = (ts) => {
      if (last && dir) {
        const dt = Math.min(0.05, (ts - last) / 1000);
        setT(tCur + dir * dt * speed);
        if ((dir > 0 && tCur >= tEnd) || (dir < 0 && tCur <= -0.3)) dir = 0;
      }
      last = ts;
      if (stop()) { close(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const btn = (label, fn, extra = {}) => h('button', { class: 'btn small', on: { click: fn }, ...extra }, label);
    const speedBtns = [1, 0.25, 0.1].map((s) => {
      const b = btn(`${s}×`, () => { speed = s; for (const x of speedBtns) x.classList.toggle('on', x === b); });
      if (s === speed) b.classList.add('on');
      return b;
    });
    const viewBtns = VIEWS.map((v) => {
      const b = btn(t(`lab.view.${v}`), () => { scene.setView(v); for (const x of viewBtns) x.classList.toggle('on', x === b); }, { dataset: { view: v } });
      return b;
    });
    const toggleBtn = (key, label) => {
      const b = btn(label, () => { opts[key] = !opts[key]; b.classList.toggle('on', opts[key]); overlays(); });
      b.classList.toggle('on', opts[key]);
      return b;
    };
    const bar = h('div', { class: 'review-bar', 'data-test': 'review-bar' },
      h('div', { class: 'row' },
        btn('⏮', () => { dir = 0; setT(-0.3); }, { 'aria-label': t('lab.rev.start') }),
        btn('◀', () => { dir = -1; }, { 'aria-label': t('lab.rev.back') }),
        btn('❚❚', () => { dir = 0; }, { 'aria-label': t('lab.rev.pause') }),
        btn('▶', () => { if (tCur >= tEnd) setT(-0.3); dir = 1; }, { 'aria-label': t('lab.rev.play'), 'data-test': 'rev-play' }),
        btn('⏭', () => { dir = 0; setT(tEnd); }, { 'aria-label': t('lab.rev.end') }),
        btn('−10 ms', () => { dir = 0; setT(tCur - 0.01); }),
        btn('+10 ms', () => { dir = 0; setT(tCur + 0.01); }),
        ...speedBtns, timeLabel),
      scrub,
      h('div', { class: 'row' }, ...viewBtns, toggleBtn('zone', t('lab.rev.zone')), toggleBtn('path', t('lab.rev.path')), toggleBtn('release', t('lab.rev.release')), toggleBtn('cue', t('lab.rev.spinCue')),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small primary', 'data-test': 'rev-close', on: { click: () => close() } }, t('common.close'))));
    shell.root.append(info, bar);
    shell.clearMessage();

    // Orbit dragging on the stage
    let drag = null;
    const canvas = scene.renderer.domElement;
    const down = (e) => { if (scene.view !== 'orbit') return; drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId); };
    const move = (e) => { if (!drag) return; scene.orbitBy(e.clientX - drag.x, e.clientY - drag.y); drag = { x: e.clientX, y: e.clientY }; };
    const up = () => { drag = null; };
    const wheel = (e) => { if (scene.view === 'orbit') { e.preventDefault(); scene.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); } };
    canvas.style.pointerEvents = 'auto';
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    setT(0);
    dir = 1;

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('wheel', wheel);
      info.remove(); bar.remove();
      if (ghost) { scene.scene.remove(ghost); ghost.geometry.dispose(); ghost.material.dispose(); }
      scene.clearOverlays();
      scene.showZone(false);
      scene.setReviewTime(null);
      scene.occlusionFt = prevOccl;
      scene.setView(prevView);
      scene.setPitch(null);
      resolve();
    }
  });
}
