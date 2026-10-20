import { app, VERSION } from '../../app.js';
import { t, fmtNum, LOCALES } from '../../i18n/i18n.js';
import { h, field, select, toggle, segmented, dialog, toast } from '../dom.js';
import { calibrationWidget } from '../calibration.js';
import { selfCheckWidget } from '../selfcheck.js';
import { confirmStrobe, MAX_STROBE_HZ, MIN_STROBE_HZ, MIN_DUTY, MAX_DUTY } from '../safety.js';
import { exportAll, importAll, toCSV, downloadText } from '../../data/export.js';
import { applyTheme } from '../theme.js';

function section(title, ...children) {
  return h('section', { class: 'card stack', style: { marginBottom: '14px' } }, h('h2', null, title), ...children);
}

function numberInput(value, { min, max, step = 1 }, onChange) {
  const el = h('input', { type: 'number', value, min, max, step, inputmode: 'numeric',
    on: { change: () => { const v = Math.min(max, Math.max(min, Number(el.value) || min)); el.value = v; onChange(v); } } });
  return el;
}

function rangeInput(value, { min, max, step }, fmt, onChange) {
  const out = h('span', { class: 'badge' }, fmt(value));
  const el = h('input', { type: 'range', value, min, max, step, on: { input: () => { out.textContent = fmt(Number(el.value)); onChange(Number(el.value)); } } });
  return h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, el), out);
}

export async function settingsView() {
  const repo = app.repo;
  const s = repo.settings;
  const save = (patch) => repo.saveSettings(patch);
  const prefs = (patch) => save({ prefs: patch });
  const safety = (patch) => save({ safety: patch });

  const profile = section(t('set.profile'),
    field(t('set.bats'), segmented(s.profile.bats, [['R', t('onb.batsR')], ['L', t('onb.batsL')], ['S', t('onb.batsS')]], (v) => save({ profile: { bats: v } }))),
    field(t('set.level'), select(s.profile.level, ['youth', 'hs', 'college', 'pro'].map((l) => [l, t(`onb.level.${l}`)]), (v) => save({ profile: { level: v } }))),
    field(t('set.heightIn'), numberInput(s.profile.heightIn, { min: 48, max: 84 }, (v) => save({ profile: { heightIn: v } }))));

  let calHost = h('div');
  const calBtn = h('button', { class: 'btn', on: { click: () => {
    calHost.replaceChildren(calibrationWidget(repo.settings.calibration, (c) => save({ calibration: c })).el);
    calBtn.remove();
  } } }, t('set.calibrate'));

  const display = section(t('set.display'),
    h('div', { class: 'row' }, calBtn), calHost,
    field(t('set.viewDist'), numberInput(Math.round(s.calibration.viewDistCm), { min: 20, max: 400 }, (v) => save({ calibration: { viewDistCm: v } }))),
    field(t('set.theme'), segmented(s.prefs.theme, [['dark', t('set.themeDark')], ['light', t('set.themeLight')]], (v) => { prefs({ theme: v }); applyTheme(v); })),
    field(t('set.quality'), segmented(s.prefs.quality, [['auto', t('set.qAuto')], ['low', t('set.qLow')], ['medium', t('set.qMed')], ['high', t('set.qHigh')]], (v) => prefs({ quality: v })), t('set.qualityHint')),
    field(t('set.view'), segmented(s.prefs.view, [['batter', t('set.viewBatter')], ['centered', t('set.viewCentered')]], (v) => prefs({ view: v }))),
    field(t('set.fovScale'), segmented(String(s.prefs.fovScale), [['1', t('set.fovTrue')], ['1.5', t('set.fovWide', { n: 1.5 })], ['2', t('set.fovWide', { n: 2 })]], (v) => prefs({ fovScale: Number(v) })), t('set.fovHint')),
    toggle(s.prefs.headSway, (v) => prefs({ headSway: v }), t('set.headSway')),
    toggle(s.prefs.reduceMotion, (v) => { prefs({ reduceMotion: v }); document.documentElement.classList.toggle('reduce-motion', v); }, t('set.reduceMotion')),
    h('p', { class: 'hint' }, t('set.reduceMotionHint')),
    LOCALES.length > 1 ? field(t('set.language'), select(s.prefs.locale, LOCALES.map((l) => [l, l]), (v) => prefs({ locale: v }))) : null);

  const xrNote = h('p', { class: 'hint' }, t('set.xrUnavailable'));
  navigator.xr?.isSessionSupported?.('immersive-vr').then((ok) => { if (ok) xrNote.textContent = t('set.xrAvailable'); }).catch(() => {});
  const stereo = section(t('set.stereo'),
    segmented(s.prefs.stereo, [['off', t('set.stereoOff')], ['anaglyph', t('set.stereoAnaglyph')], ['sbs', t('set.stereoSbs')]], (v) => prefs({ stereo: v })),
    field(t('set.eyeSep'), numberInput(s.prefs.eyeSepCm, { min: 5, max: 7.5, step: 0.1 }, (v) => prefs({ eyeSepCm: v }))),
    h('p', { class: 'hint' }, t('set.stereoHint')), xrNote);

  const feedback = section(t('set.feedback'),
    toggle(s.prefs.sound, (v) => prefs({ sound: v }), t('set.sound')),
    toggle(s.prefs.haptics, (v) => prefs({ haptics: v }), t('set.haptics')),
    field(t('set.buttonSide'), segmented(s.prefs.buttonSide, [['right', t('set.sideRight')], ['left', t('set.sideLeft')], ['split', t('set.sideSplit')]], (v) => prefs({ buttonSide: v }))));

  const training = section(t('set.training'),
    field(t('set.cueAssist'), segmented(s.prefs.cueAssist, [['auto', t('set.cueAuto')], ['on', t('set.cueOn')], ['off', t('set.cueOff')]], (v) => prefs({ cueAssist: v })), t('set.cueHint')),
    field(t('set.swingTime'), numberInput(s.prefs.swingTimeMs, { min: 100, max: 250, step: 5 }, (v) => prefs({ swingTimeMs: v })), t('set.swingTimeHint')),
    field(t('set.blockSize'), segmented(String(s.prefs.blockSize), [['10', '10'], ['20', '20'], ['30', '30']], (v) => prefs({ blockSize: Number(v) }))));

  // Strobe: the warning is shown every time it is switched on.
  const strobeToggle = toggle(s.safety.strobeEnabled, async (v) => {
    const input = strobeToggle.querySelector('input');
    if (v) {
      const ok = await confirmStrobe();
      if (!ok) { input.checked = false; return; }
    }
    safety({ strobeEnabled: v });
  }, t('set.strobe'));
  const safetySec = section(t('set.safety'),
    strobeToggle,
    h('p', { class: 'hint' }, t('set.strobeMax', { n: MAX_STROBE_HZ })),
    field(t('set.strobeHz'), rangeInput(s.safety.strobeHz, { min: MIN_STROBE_HZ, max: MAX_STROBE_HZ, step: 0.5 }, (v) => `${fmtNum(v, 1)} Hz`, (v) => safety({ strobeHz: v }))),
    field(t('set.strobeDuty'), rangeInput(s.safety.strobeDuty, { min: MIN_DUTY, max: MAX_DUTY, step: 0.05 }, (v) => `${Math.round(v * 100)}%`, (v) => safety({ strobeDuty: v }))),
    toggle(s.safety.strobeDim, (v) => safety({ strobeDim: v }), t('set.strobeDim')),
    field(t('set.dailyCap'), numberInput(s.safety.dailyCapMin, { min: 10, max: 120, step: 5 }, (v) => safety({ dailyCapMin: v }))),
    field(t('set.breakEvery'), numberInput(s.safety.breakEveryMin, { min: 5, max: 60, step: 5 }, (v) => safety({ breakEveryMin: v }))),
    s.safety.restUntil > Date.now() ? h('button', { class: 'btn small', on: { click: (e) => { safety({ restUntil: 0 }); e.target.remove(); } } }, t('set.clearRest')) : null);

  const check = section(t('check.title'), selfCheckWidget());

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', 'data-test': 'import-file',
    on: { change: async () => {
      const f = fileInput.files[0];
      if (!f) return;
      const ok = await dialog({ title: t('set.importJson'), body: t('set.importConfirm'), buttons: [{ id: 'no', label: t('common.cancel') }, { id: 'yes', label: t('common.continue'), primary: true, danger: true }] });
      if (ok !== 'yes') { fileInput.value = ''; return; }
      try {
        const counts = await importAll(repo.db, JSON.parse(await f.text()));
        await repo.init();
        toast(t('set.importDone', counts));
        app.router.go('settings');
      } catch (err) { toast(t('set.importFail', { msg: err.message }), 5000); }
      fileInput.value = '';
    } } });
  const stamp = () => new Date().toISOString().slice(0, 10);
  const data = section(t('set.data'),
    h('p', null, t('set.dataHint')),
    h('div', { class: 'row' },
      h('button', { class: 'btn', 'data-test': 'export-json', on: { click: async () => downloadText(`battersEye-${stamp()}.json`, JSON.stringify(await exportAll(repo.db), null, 1)) } }, t('set.exportJson')),
      h('button', { class: 'btn', on: { click: () => fileInput.click() } }, t('set.importJson')), fileInput),
    h('div', { class: 'row' },
      h('button', { class: 'btn', on: { click: async () => downloadText(`battersEye-sessions-${stamp()}.csv`, toCSV(await repo.listSessions()), 'text/csv') } }, t('set.exportSessions')),
      h('button', { class: 'btn', on: { click: async () => downloadText(`battersEye-trials-${stamp()}.csv`, toCSV(await repo.allTrials()), 'text/csv') } }, t('set.exportTrials'))),
    h('p', { class: 'hint' }, t('set.storage', { kind: repo.db.kind })),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', on: { click: async () => { await save({ onboarded: false }); app.router.go('onboarding'); } } }, t('set.rerunOnboarding')),
      h('button', { class: 'btn small danger', on: { click: async () => {
        const r = await dialog({ title: t('set.wipe'), body: t('set.wipeConfirm'), buttons: [{ id: 'no', label: t('common.cancel'), primary: true }, { id: 'yes', label: t('common.delete'), danger: true }] });
        if (r === 'yes') { await repo.wipeAll(); location.hash = '#/onboarding'; location.reload(); }
      } } }, t('set.wipe'))));

  const about = section(t('set.about'),
    h('p', { class: 'notice info' }, t('set.aboutBody')),
    h('p', null, t('set.aboutData')),
    h('p', { class: 'hint' }, t('set.aboutLicense')),
    h('p', { class: 'hint' }, t('set.version', { v: VERSION })));

  const el = h('div', null, h('h1', null, t('set.title')), profile, display, stereo, feedback, training, safetySec, check, data, about);
  return { el };
}
