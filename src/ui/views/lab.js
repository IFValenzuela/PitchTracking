// Pitch Lab setup screen.
import { app } from '../../app.js';
import { t, fmtNum } from '../../i18n/i18n.js';
import { h, segmented, toast, toggle } from '../dom.js';
import { MODE_IDS, TUNNEL_PAIRS } from '../../modules/pitchlab/modes.js';
import { PITCH_KEYS } from '../../engine/pitches.js';
import { runPitchLab } from '../../modules/pitchlab/session.js';
import { thresholdEstimate } from '../../engine/staircase.js';
import { strobeActive } from '../safety.js';

export const DEFAULT_LAB = { mode: 'zone', types: ['FF', 'SL', 'CH'], hand: 'R', slot: 'threeQuarter', occlTask: 'zone', pairs: [['FF', 'CH']], strobe: false };

function chips(all, selected, { min = 1, max = 8, label = (k) => k, onChange }) {
  const wrap = h('div', { class: 'chips' });
  const sel = new Set(selected);
  for (const k of all) {
    const id = Array.isArray(k) ? k.join('|') : k;
    const b = h('button', { class: `chip ${sel.has(id) ? 'on' : ''}`, type: 'button', 'aria-pressed': String(sel.has(id)), dataset: { key: id },
      on: { click: () => {
        if (sel.has(id)) { if (sel.size <= min) { toast(t('lab.minTypes', { n: min })); return; } sel.delete(id); }
        else { if (sel.size >= max) { toast(t('lab.maxTypes', { n: max })); return; } sel.add(id); }
        b.classList.toggle('on', sel.has(id)); b.setAttribute('aria-pressed', String(sel.has(id)));
        onChange([...sel]);
      } } }, label(k));
    wrap.appendChild(b);
  }
  return wrap;
}

export async function labView() {
  const repo = app.repo;
  const cfg = { ...DEFAULT_LAB, ...(await repo.kvGet('labConfig', {})) };
  const stairs = await repo.allStaircases();
  const levelOf = (prefix) => {
    const xs = stairs.filter((s) => s.key.startsWith(prefix)).map((s) => thresholdEstimate(s.state));
    return xs.length ? Math.max(...xs) : null;
  };
  const save = () => repo.kvSet('labConfig', cfg);
  const optionsHost = h('div', { class: 'stack' });

  const modeCards = h('div', { class: 'grid two', role: 'radiogroup' });
  const renderModes = () => {
    modeCards.replaceChildren(...MODE_IDS.map((m) => {
      const pref = { zone: 'pl:zone', pid: 'pl:pid', swing: 'pl:swing', location: 'pl:loc', occlusion: 'pl:occl', tunnel: 'pl:tunnel' }[m];
      const lvl = levelOf(pref);
      return h('button', { class: `card click choice ${cfg.mode === m ? 'on' : ''}`, role: 'radio', 'aria-checked': String(cfg.mode === m), 'data-test': `mode-${m}`,
        on: { click: () => { cfg.mode = m; save(); renderModes(); renderOptions(); } } },
      h('div', { class: 'card-title' }, t(`lab.mode.${m}`)),
      h('div', { class: 'card-sub' }, t(`lab.modeDesc.${m}`)),
      lvl !== null ? h('span', { class: 'badge accent', style: { marginTop: '8px' } }, t('train.level', { n: fmtNum(lvl, 1) })) : null);
    }));
  };

  function renderOptions() {
    const isPid = cfg.mode === 'pid' || (cfg.mode === 'occlusion' && cfg.occlTask === 'pid');
    if (isPid && cfg.types.length > 4) cfg.types = cfg.types.slice(0, 4);
    if (isPid && cfg.types.length < 2) cfg.types = ['FF', 'SL'];
    const parts = [];
    if (cfg.mode === 'occlusion') {
      parts.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('lab.occlTask')),
        segmented(cfg.occlTask, [['zone', t('lab.mode.zone')], ['pid', t('lab.mode.pid')]], (v) => { cfg.occlTask = v; save(); renderOptions(); })));
    }
    if (cfg.mode === 'tunnel') {
      parts.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('lab.pairs')),
        chips(TUNNEL_PAIRS, cfg.pairs.map((p) => p.join('|')), { min: 1, label: (p) => p.map((k) => t(`pitch.${k}`)).join(' / '), onChange: (v) => { cfg.pairs = v.map((s) => s.split('|')); save(); } })));
    } else {
      parts.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, isPid ? t('lab.typesPid') : t('lab.types')),
        chips(PITCH_KEYS, cfg.types, { min: isPid ? 2 : 1, max: isPid ? 4 : 8, label: (k) => t(`pitch.${k}`), onChange: (v) => { cfg.types = v; save(); } })));
    }
    parts.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('lab.pitcher')),
      segmented(cfg.hand, [['R', t('lab.rhp')], ['L', t('lab.lhp')], ['mix', t('lab.mix')]], (v) => { cfg.hand = v; save(); })));
    parts.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('lab.slot')),
      segmented(cfg.slot, [['over', t('lab.slot.over')], ['threeQuarter', t('lab.slot.threeQuarter')], ['low', t('lab.slot.low')], ['side', t('lab.slot.side')], ['mix', t('lab.mix')]], (v) => { cfg.slot = v; save(); })));
    if (strobeActive()) parts.push(toggle(cfg.strobe, (v) => { cfg.strobe = v; save(); }, t('lab.strobe')));
    parts.push(h('p', { class: 'hint' }, t(`lab.modeHow.${cfg.mode}`)));
    optionsHost.replaceChildren(...parts);
  }
  renderModes();
  renderOptions();

  const start = h('button', { class: 'btn primary big-start', 'data-test': 'lab-start', on: { click: async () => {
    start.disabled = true;
    await runPitchLab({ ...cfg, strobe: cfg.strobe && strobeActive() });
    start.disabled = false;
    app.router.go('lab');
  } } }, t('lab.start'), h('small', null, t('lab.startSub', { n: repo.settings.prefs.blockSize })));

  const el = h('div', null,
    h('h1', null, t('nav.lab')),
    h('p', { class: 'muted' }, t('lab.intro')),
    modeCards,
    h('section', { class: 'card stack', style: { marginTop: '14px' } }, optionsHost),
    h('div', { style: { marginTop: '14px' } }, start));
  return { el };
}
