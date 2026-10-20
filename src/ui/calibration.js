// Screen-size calibration (card matching) and viewing-distance picker.
import { t, fmtNum } from '../i18n/i18n.js';
import { h, segmented, field } from './dom.js';
import { CARD_WIDTH_CM, CARD_HEIGHT_CM, screenFov, ballAngularDeg, degToPx } from '../engine/optics.js';

export const DISTANCE_PRESETS = [
  ['phone', 40], ['tablet', 50], ['laptop', 60], ['tv', 120],
];

// Returns {el}. Calls onChange({pxPerCm, viewDistCm, calibrated}) on every change.
export function calibrationWidget(cal, onChange) {
  let pxPerCm = cal.pxPerCm;
  let viewDistCm = cal.viewDistCm;
  let calibrated = cal.calibrated;
  const box = h('div', { class: 'card-cal', 'aria-hidden': 'true' });
  const info = h('p', { class: 'muted' });
  const maxW = Math.min(innerWidth - 40, 700);
  const slider = h('input', {
    type: 'range', min: 120, max: Math.max(200, maxW), step: 1, value: Math.min(Math.round(pxPerCm * CARD_WIDTH_CM), maxW),
    'aria-label': t('onb.calSlider'),
    on: { input: () => { pxPerCm = Number(slider.value) / CARD_WIDTH_CM; calibrated = true; update(); } },
  });
  const distInput = h('input', { type: 'number', min: 20, max: 400, step: 1, value: Math.round(viewDistCm), inputmode: 'numeric',
    on: { change: () => { viewDistCm = Math.min(400, Math.max(20, Number(distInput.value) || 50)); update(); } } });
  const preset = DISTANCE_PRESETS.find(([, d]) => d === Math.round(viewDistCm));
  const presets = segmented(preset ? preset[1] : '', DISTANCE_PRESETS.map(([k, d]) => [d, t(`onb.dist${k === 'tv' ? 'TV' : k[0].toUpperCase() + k.slice(1)}`)]), (d) => {
    viewDistCm = Number(d); distInput.value = d; update();
  });

  function update() {
    const w = pxPerCm * CARD_WIDTH_CM;
    box.style.width = `${w}px`;
    box.style.height = `${pxPerCm * CARD_HEIGHT_CM}px`;
    const c = { pxPerCm, viewDistCm };
    const fov = screenFov(innerWidth, innerHeight, c);
    const ballPx = degToPx(ballAngularDeg(2.9 / 12, 54), c);
    info.textContent = `${t('cal.pxPerCm', { n: fmtNum(pxPerCm, 1) })} · ${t('cal.fov', { h: fmtNum(fov.hDeg, 0), v: fmtNum(fov.vDeg, 0) })} ${t('cal.ballSize', { n: fmtNum(ballPx, 1) })}`;
    onChange({ pxPerCm, viewDistCm, calibrated });
  }
  const el = h('div', { class: 'calibration' },
    h('p', null, t('onb.calBody')),
    box,
    field(t('onb.calSlider'), slider),
    h('h3', { class: 'section' }, t('onb.distTitle')),
    presets,
    field(t('onb.distCustom'), distInput),
    info);
  queueMicrotask(update);
  return { el };
}
