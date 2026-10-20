// Eye Check screens: intro → one card per test → results.
import { app } from '../../app.js';
import { t, fmtNum, fmtDate } from '../../i18n/i18n.js';
import { h, toggle } from '../dom.js';
import { EyeCheckRun, EYE_TESTS } from '../../modules/assessment/eyecheck.js';
import { SKILLS, compareScore } from '../../modules/assessment/metrics.js';
import { DRILLS } from '../../modules/gym/registry.js';
import { buildAndSavePlan } from '../../plan/planner-store.js';

// Human-readable raw result for a skill.
export function formatRaw(skill, raw) {
  if (!raw) return '–';
  const d = raw.display || {};
  const r0 = (v) => (Number.isFinite(v) ? Math.round(v) : '–');
  switch (skill) {
    case 'reaction': return t('eye.raw.ms', { n: r0(d.ms) });
    case 'inhibition': return t('eye.raw.inhibition', { ms: r0(d.ms), pct: r0(d.commissionPct) });
    case 'anticipation': return t('eye.raw.anticipation', { n: r0(d.ms) });
    case 'pitchRecognition': return t('eye.raw.pct', { n: r0(d.pct) });
    case 'zoneJudgment': return t('eye.raw.zone', { d: fmtNum(d.dprime, 2), pct: r0(d.pct) });
    default: {
      const drill = Object.values(DRILLS).find((x) => x.skill === skill && (x.gym === false || skill !== 'saccades'));
      const lvl = raw.p;
      const unit = drill?.ladderText ? drill.ladderText(lvl, { settings: app.repo.settings }) : '';
      return `${t('train.level', { n: fmtNum(lvl, 1) })}${unit ? ` · ${unit}` : ''}`;
    }
  }
}

export function verdictBadge(cmp) {
  if (!cmp) return null;
  const cls = cmp.verdict === 'up' ? 'good' : cmp.verdict === 'down' ? 'warn' : '';
  return h('span', { class: `badge ${cls}` }, `${cmp.delta >= 0 ? '+' : ''}${fmtNum(cmp.delta, 0)} · ${t(`eye.verdict.${cmp.verdict}`)}`);
}

export function resultsTable(record, prev) {
  return h('table', { class: 'data' },
    h('tr', null, h('th', null, t('eye.skill')), h('th', null, t('eye.result')), h('th', null, t('eye.score')), prev ? h('th', null, t('eye.change')) : null),
    Object.keys(SKILLS).filter((s) => record.scores[s]).map((s) => {
      const sc = record.scores[s];
      return h('tr', null,
        h('td', null, t(`skill.${s}`)),
        h('td', null, formatRaw(s, record.raw[s])),
        h('td', null, `${Math.round(sc.score)} `, h('small', null, `±${Math.round(1.96 * sc.sePts)}`)),
        prev ? h('td', null, verdictBadge(compareScore(prev.scores?.[s], sc)) || '–') : null);
    }));
}

export async function eyecheckView() {
  const root = h('div', { class: 'onb' });
  const prevAll = await app.repo.listAssessments();
  let includeDepth = false;
  let run = null;

  function intro() {
    const total = EYE_TESTS.filter((x) => !x.optional).reduce((a, x) => a + x.estSec, 0);
    root.replaceChildren(
      h('h1', null, t('eye.title')),
      h('p', null, t('eye.intro', { n: Math.round(total / 60) })),
      h('p', { class: 'notice info' }, t('eye.relative')),
      h('ol', null, EYE_TESTS.map((x) => h('li', null, t(`skill.${x.skill}`), x.optional ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, t('common.optional')) : null))),
      toggle(includeDepth, (v) => { includeDepth = v; }, t('eye.includeDepth')),
      h('p', { class: 'hint' }, t('eye.depthHint')),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn primary big-start', 'data-test': 'eye-start', on: { click: () => { run = new EyeCheckRun({ includeDepth }); card(); } } }, t('eye.start')),
        h('button', { class: 'btn ghost', on: { click: () => app.router.go('home') } }, t('common.back'))));
  }

  function card() {
    if (run.done) { finish(); return; }
    const test = run.current;
    const how = test.lab ? t(`eye.how.${test.skill}`) : t(DRILLS[test.drill].howKey);
    const first = run.index === 0;
    root.replaceChildren(
      h('div', { class: 'steps' }, run.tests.map((_, i) => h('span', { class: i <= run.index ? 'on' : '' }))),
      h('h3', null, t('eye.testN', { i: run.index + 1, n: run.tests.length })),
      h('h1', null, t(`skill.${test.skill}`)),
      h('p', null, how),
      test.skill === 'depth' ? h('p', { class: 'notice' }, t('eye.depthGlasses')) : null,
      h('p', { class: 'hint' }, t('eye.noFeedback')),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn primary big-start', 'data-test': 'eye-test-start', on: { click: async (e) => {
          e.target.disabled = true;
          const ok = await run.runCurrent({ first });
          if (!ok && run.current === test) { cardStopped(); return; }
          card();
        } } }, t('eye.startTest')),
        h('button', { class: 'btn ghost', 'data-test': 'eye-skip', on: { click: () => { run.skip(); card(); } } }, t('eye.skipTest'))));
  }

  function cardStopped() {
    root.replaceChildren(
      h('h1', null, t('train.stopped')),
      h('p', null, t('eye.stoppedBody')),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', on: { click: () => card() } }, t('eye.retryTest')),
        h('button', { class: 'btn', on: { click: () => { run.skip(); card(); } } }, t('eye.skipTest')),
        h('button', { class: 'btn ghost', on: { click: () => (Object.keys(run.results).length ? finish() : app.router.go('home')) } }, t('eye.finishNow'))));
  }

  async function finish() {
    const record = await run.finish();
    const prev = prevAll[prevAll.length - 1] || null;
    root.replaceChildren(
      h('h1', null, t('eye.resultsTitle')),
      h('div', { class: 'card', style: { margin: '12px 0' } },
        h('div', { class: 'kpi' }, h('span', { class: 'v', 'data-test': 'eye-composite' }, Math.round(record.composite)), h('span', { class: 'l' }, t('eye.composite', { se: Math.round(1.96 * record.compositeSE) })))),
      h('p', { class: 'notice info' }, record.baseline ? t('eye.firstRun') : t('eye.retestNote', { date: fmtDate(prev.at, { dateStyle: 'medium' }) })),
      resultsTable(record, prev),
      h('p', { class: 'hint' }, t('eye.noiseNote')),
      h('div', { class: 'row', style: { marginTop: '14px' } },
        h('button', { class: 'btn primary big-start', 'data-test': 'eye-plan', on: { click: async () => {
          await buildAndSavePlan();
          app.router.go('home');
        } } }, t('eye.buildPlan'))));
  }

  intro();
  return { el: root };
}
