// Vision Gym: drill list, drill detail/start, and the Strobe Mode screen.
import { app } from '../../app.js';
import { t, fmtNum } from '../../i18n/i18n.js';
import { h, segmented, toggle, field } from '../dom.js';
import { gymDrills, strobeDrills, DRILLS } from '../../modules/gym/registry.js';
import { runDrill } from '../../modules/gym/runner.js';
import { requestMotionPermission } from '../../modules/gym/drills/anticipation.js';
import { thresholdEstimate } from '../../engine/staircase.js';
import { confirmStrobe, strobeActive, MAX_STROBE_HZ, MIN_STROBE_HZ, MIN_DUTY, MAX_DUTY } from '../safety.js';

async function levels() {
  const all = await app.repo.allStaircases();
  return Object.fromEntries(all.filter((s) => s.key.startsWith('gym:')).map((s) => [s.key.slice(4), thresholdEstimate(s.state)]));
}

export async function gymView() {
  const lv = await levels();
  const card = (d) => {
    const lvl = lv[d.id];
    return h('a', { class: 'card click', href: `#/drill/${d.id}`, style: { textDecoration: 'none', color: 'inherit', display: 'block' }, 'data-test': `drill-${d.id}` },
      h('div', { class: 'row between' }, h('span', { class: 'card-title' }, t(d.nameKey)), d.priority === 'low' ? h('span', { class: 'badge warn' }, t('common.lowPriority')) : h('span', { class: 'badge' }, t(`skill.${d.skill}`))),
      h('div', { class: 'card-sub' }, t(d.descKey)),
      lvl !== undefined ? h('span', { class: 'badge accent', style: { marginTop: '8px' } }, t('train.level', { n: fmtNum(lvl, 1) })) : null);
  };
  const drills = gymDrills();
  const el = h('div', null,
    h('h1', null, t('gym.title')),
    h('p', { class: 'muted' }, t('gym.intro')),
    h('div', { class: 'grid two' }, drills.filter((d) => d.priority !== 'low').map(card),
      h('a', { class: 'card click', href: '#/drill/strobe', style: { textDecoration: 'none', color: 'inherit', display: 'block' }, 'data-test': 'drill-strobe' },
        h('div', { class: 'row between' }, h('span', { class: 'card-title' }, t('gym.strobe.name')), h('span', { class: 'badge warn' }, t('gym.strobe.badge'))),
        h('div', { class: 'card-sub' }, t('gym.strobe.desc'))),
      drills.filter((d) => d.priority === 'low').map(card)),
    h('p', { class: 'hint', style: { marginTop: '14px' } }, t('gym.evidence')));
  return { el };
}

export async function drillView(route) {
  const id = route.params[0];
  if (id === 'strobe') return strobeView();
  const d = DRILLS[id];
  if (!d) { app.router.go('gym'); return { el: h('div') }; }
  const lv = await levels();
  const state = { seconds: d.defaultSeconds, variant: d.variants?.[0], strobe: false };
  const levelKey = state.variant && state.variant !== d.variants?.[0] ? `${id}:${state.variant}` : id;
  const lvl = lv[levelKey];
  const parts = [
    h('a', { href: '#/gym', class: 'btn ghost small' }, `← ${t('nav.gym')}`),
    h('h1', { style: { marginTop: '10px' } }, t(d.nameKey)),
    h('span', { class: 'badge' }, t(`skill.${d.skill}`)),
    d.priority === 'low' ? h('p', { class: 'notice' }, t('gym.motNote')) : null,
    h('p', null, t(d.howKey)),
    d.ladderText ? h('p', { class: 'hint' }, t('gym.currentDifficulty', { text: d.ladderText(lvl ?? d.stair?.start ?? 2, { settings: app.repo.settings }) })) : null,
    field(t('gym.duration'), segmented(String(state.seconds), [60, 90, 120, 180].map((s) => [String(s), t('common.seconds', { n: s })]), (v) => { state.seconds = Number(v); })),
  ];
  if (id === 'nearFar') parts.push(field(t('gym.variant'), segmented(state.variant, [['screen', t('drill.nearfar.screen')], ['guided', t('drill.nearfar.guided')]], (v) => { state.variant = v; })));
  if (id === 'anticipation') {
    parts.push(toggle(false, async (v) => {
      if (v && !(await requestMotionPermission())) { alertMotion.hidden = false; return; }
      state.variant = v ? 'motion' : undefined;
    }, t('drill.anticipation.motion')));
  }
  const alertMotion = h('p', { class: 'notice', hidden: true }, t('drill.anticipation.motionDenied'));
  parts.push(alertMotion);
  if (d.strobeOk && strobeActive()) parts.push(toggle(false, (v) => { state.strobe = v; }, t('lab.strobe')));
  const start = h('button', { class: 'btn primary big-start', 'data-test': 'drill-start', on: { click: async () => {
    start.disabled = true;
    await runDrill(d, { seconds: state.seconds, variant: state.variant, strobe: state.strobe && strobeActive() });
    start.disabled = false;
    app.router.go(`drill/${id}`);
  } } }, t('common.start'));
  parts.push(h('div', { style: { marginTop: '14px' } }, start));
  return { el: h('div', { class: 'stack' }, ...parts) };
}

async function strobeView() {
  const s = app.repo.settings.safety;
  const host = h('div', { class: 'stack' });
  const render = () => {
    const on = strobeActive();
    const parts = [
      h('a', { href: '#/gym', class: 'btn ghost small' }, `← ${t('nav.gym')}`),
      h('h1', { style: { marginTop: '10px' } }, t('gym.strobe.name')),
      h('p', null, t('gym.strobe.how')),
      h('p', { class: 'notice' }, t('gym.strobe.safety', { n: MAX_STROBE_HZ })),
    ];
    if (!on) {
      parts.push(h('button', { class: 'btn primary', 'data-test': 'strobe-enable', on: { click: async () => {
        if (await confirmStrobe()) { await app.repo.saveSettings({ safety: { strobeEnabled: true } }); render(); }
      } } }, t('gym.strobe.enable')));
    } else {
      const hz = h('input', { type: 'range', min: MIN_STROBE_HZ, max: MAX_STROBE_HZ, step: 0.5, value: s.strobeHz, on: { input: () => app.repo.saveSettings({ safety: { strobeHz: Number(hz.value) } }) } });
      const duty = h('input', { type: 'range', min: MIN_DUTY, max: MAX_DUTY, step: 0.05, value: s.strobeDuty, on: { input: () => app.repo.saveSettings({ safety: { strobeDuty: Number(duty.value) } }) } });
      parts.push(
        field(t('set.strobeHz'), hz, t('set.strobeMax', { n: MAX_STROBE_HZ })),
        field(t('set.strobeDuty'), duty),
        h('h3', { class: 'section' }, t('gym.strobe.pick')),
        h('div', { class: 'grid two' }, strobeDrills().map((d) => h('button', { class: 'card click', 'data-test': `strobe-${d.id}`, on: { click: () => runDrill(d, { seconds: 60, strobe: true }) } },
          h('div', { class: 'card-title' }, t(d.nameKey)), h('div', { class: 'card-sub' }, t(d.descKey)))),
        h('button', { class: 'card click', on: { click: async () => { const cfg = await app.repo.kvGet('labConfig', {}); await app.repo.kvSet('labConfig', { ...cfg, strobe: true }); app.router.go('lab'); } } },
          h('div', { class: 'card-title' }, t('nav.lab')), h('div', { class: 'card-sub' }, t('gym.strobe.lab')))),
        h('button', { class: 'btn small', on: { click: async () => { await app.repo.saveSettings({ safety: { strobeEnabled: false } }); render(); } } }, t('gym.strobe.disable')));
    }
    host.replaceChildren(...parts);
  };
  render();
  return { el: host };
}
