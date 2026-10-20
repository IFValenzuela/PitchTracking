// First-run setup (< 2 minutes): handedness, level, height, calibration, Eye Check prompt.
import { app } from '../../app.js';
import { t } from '../../i18n/i18n.js';
import { h, clear } from '../dom.js';
import { calibrationWidget } from '../calibration.js';

const LEVELS = ['youth', 'hs', 'college', 'pro'];

function choices(options, value, onPick) {
  const wrap = h('div', { class: 'choice-grid', role: 'radiogroup' });
  for (const o of options) {
    const b = h('button', { class: `choice ${o.value === value ? 'on' : ''}`, role: 'radio', 'aria-checked': String(o.value === value), type: 'button', dataset: { value: o.value },
      on: { click: () => { for (const c of wrap.children) { c.classList.remove('on'); c.setAttribute('aria-checked', 'false'); } b.classList.add('on'); b.setAttribute('aria-checked', 'true'); onPick(o.value); } } },
    h('b', null, o.label), o.sub && h('span', null, o.sub));
    wrap.appendChild(b);
  }
  return wrap;
}

export async function onboardingView() {
  const repo = app.repo;
  const draft = {
    profile: { ...repo.settings.profile },
    calibration: { ...repo.settings.calibration },
  };
  let step = 0;
  const body = h('div');
  const steps = h('div', { class: 'steps', 'aria-hidden': 'true' });
  const N = 4;

  const nav = (canBack, nextLabel, onNext) => h('div', { class: 'row between', style: { marginTop: '20px' } },
    canBack ? h('button', { class: 'btn ghost', on: { click: () => { step--; render(); } } }, t('common.back')) : h('span'),
    h('button', { class: 'btn primary', 'data-test': 'onb-next', on: { click: onNext } }, nextLabel));

  async function finish(eyeCheck) {
    await repo.saveSettings({ ...draft, onboarded: true });
    app.router.go(eyeCheck ? 'eyecheck' : 'home');
  }

  function render() {
    clear(steps);
    for (let i = 0; i < N; i++) steps.appendChild(h('span', { class: i <= step ? 'on' : '' }));
    clear(body);
    if (step === 0) {
      body.append(
        h('h1', null, t('onb.title')),
        h('p', null, t('onb.intro')),
        h('p', { class: 'notice info' }, t('onb.disclaimer')),
        h('h3', { class: 'section' }, t('onb.bats')),
        choices([{ value: 'R', label: t('onb.batsR') }, { value: 'L', label: t('onb.batsL') }, { value: 'S', label: t('onb.batsS') }], draft.profile.bats, (v) => { draft.profile.bats = v; }),
        nav(false, t('common.next'), () => { step++; render(); }));
    } else if (step === 1) {
      const hIn = h('input', { type: 'number', min: 48, max: 84, value: draft.profile.heightIn, inputmode: 'numeric', on: { change: () => { draft.profile.heightIn = Math.min(84, Math.max(48, Number(hIn.value) || 72)); } } });
      body.append(
        h('h1', null, t('onb.level')),
        choices(LEVELS.map((l) => ({ value: l, label: t(`onb.level.${l}`), sub: t(`onb.level.${l}Sub`) })), draft.profile.level, (v) => { draft.profile.level = v; }),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('onb.height')), hIn),
        nav(true, t('common.next'), () => { step++; render(); }));
    } else if (step === 2) {
      const cal = calibrationWidget(draft.calibration, (c) => { draft.calibration = c; });
      body.append(
        h('h1', null, t('onb.calTitle')),
        cal.el,
        h('p', { class: 'hint' }, t('onb.noCard')),
        nav(true, t('common.next'), () => { step++; render(); }));
    } else {
      body.append(
        h('h1', null, t('onb.eyeTitle')),
        h('p', null, t('onb.eyeBody')),
        h('div', { class: 'stack' },
          h('button', { class: 'btn primary block big-start', 'data-test': 'onb-eyecheck', on: { click: () => finish(true) } }, t('onb.eyeNow')),
          h('button', { class: 'btn block', 'data-test': 'onb-later', on: { click: () => finish(false) } }, t('onb.eyeLater'))),
        h('div', { class: 'row', style: { marginTop: '16px' } }, h('button', { class: 'btn ghost', on: { click: () => { step--; render(); } } }, t('common.back'))));
    }
  }
  render();
  return { el: h('div', { class: 'onb' }, steps, body) };
}
