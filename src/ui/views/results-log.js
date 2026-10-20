// Real Results Log: what happened in actual batting practice and games.
import { app } from '../../app.js';
import { t, fmtNum, fmtDate } from '../../i18n/i18n.js';
import { h, dialog } from '../dom.js';
import { lineChart, barChart, legend } from '../charts.js';
import { analyzeRealResults, REAL_METRICS, rate } from '../../modules/progress/realresults.js';

const FIELDS = [
  ['pa', 'rr.pa'], ['k', 'rr.k'], ['bb', 'rr.bb'],
  ['outsidePitches', 'rr.outsidePitches'], ['chases', 'rr.chases'],
  ['decisions', 'rr.decisions'], ['goodDecisions', 'rr.goodDecisions'],
  ['bip', 'rr.bip'], ['hardHit', 'rr.hardHit'],
];

function form(onSave) {
  const inputs = {};
  const date = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10), 'data-test': 'rr-date' });
  const type = h('select', null, ['game', 'bp', 'live'].map((v) => h('option', { value: v }, t(`rr.type.${v}`))));
  const notes = h('input', { type: 'text', placeholder: t('rr.notes') });
  const grid = h('div', { class: 'grid three' }, FIELDS.map(([k, label]) => {
    inputs[k] = h('input', { type: 'number', min: 0, step: 1, inputmode: 'numeric', 'data-test': `rr-${k}` });
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, t(label)), inputs[k]);
  }));
  const err = h('p', { class: 'notice bad', hidden: true });
  const save = h('button', { class: 'btn primary', 'data-test': 'rr-save', on: { click: async () => {
    const e = { date: date.value, type: type.value, notes: notes.value.trim() };
    for (const [k] of FIELDS) e[k] = inputs[k].value === '' ? 0 : Math.max(0, Math.round(Number(inputs[k].value)));
    const problems = [];
    if (!e.date) problems.push(t('rr.errDate'));
    if (e.chases > e.outsidePitches) problems.push(t('rr.errChase'));
    if (e.goodDecisions > e.decisions) problems.push(t('rr.errDecisions'));
    if (e.hardHit > e.bip) problems.push(t('rr.errHard'));
    if (e.k + e.bb > e.pa) problems.push(t('rr.errPa'));
    if (!FIELDS.some(([k]) => e[k] > 0)) problems.push(t('rr.errEmpty'));
    if (problems.length) { err.textContent = problems.join(' '); err.hidden = false; return; }
    await app.repo.saveRealResult(e);
    onSave();
  } } }, t('rr.add'));
  return h('details', { class: 'card', open: false }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 }, 'data-test': 'rr-open' }, t('rr.addTitle')),
    h('div', { class: 'grid two' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('rr.date')), date), h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('rr.type')), type)),
    grid, h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('rr.notes')), notes), h('p', { class: 'hint' }, t('rr.fieldsHint')), err, save);
}

const VERDICT_CLASS = { better: 'good', worse: 'warn', noChange: '', thin: '', none: '' };

export async function realResultsSection(sessions, weekMin) {
  const host = h('div');
  const render = async () => {
    const entries = await app.repo.listRealResults();
    const firstTraining = sessions.length ? new Date(sessions[0].startedAt).toISOString().slice(0, 10) : null;
    const an = analyzeRealResults(entries, firstTraining);
    const parts = [h('p', { class: 'hint' }, t('rr.intro')), form(render)];
    if (entries.length) {
      const msg = { thin: 'rr.overall.thin', noChange: 'rr.overall.noChange', someBetter: 'rr.overall.someBetter', someWorse: 'rr.overall.someWorse' }[an.overall];
      parts.push(h('div', { class: `notice ${an.overall === 'someBetter' ? 'info' : ''}`, 'data-test': 'rr-verdict' }, h('b', null, t(msg)), ' ', t('rr.caveat')));
      parts.push(h('p', { class: 'hint' }, an.split === 'training' ? t('rr.splitTraining', { a: an.before, b: an.after, d: firstTraining }) : t('rr.splitHalves', { a: an.before, b: an.after })));
      parts.push(h('table', { class: 'data' }, h('tr', null, h('th', null, t('rr.metric')), h('th', null, t('rr.before')), h('th', null, t('rr.recent')), h('th', null, t('rr.verdict'))),
        Object.entries(an.metrics).filter(([, m]) => m.verdict !== 'none').map(([k, m]) => h('tr', null,
          h('td', null, t(`rr.m.${k}`)),
          h('td', null, `${fmtNum(m.before * 100, 0)}% `, h('small', null, `(${m.n1})`)),
          h('td', null, `${fmtNum(m.after * 100, 0)}% `, h('small', null, `(${m.n2})`)),
          h('td', null, h('span', { class: `badge ${VERDICT_CLASS[m.verdict]}` }, t(`rr.v.${m.verdict}`)))))));
      // Small multiples: each rate over time on its own axis, then training volume below (never a dual axis).
      const keys = Object.keys(REAL_METRICS).filter((k) => an.metrics[k].verdict !== 'none').slice(0, 4);
      const pts = (k) => entries.map((e) => ({ x: Date.parse(`${e.date}T12:00:00`), y: rate([e], k) * 100 })).filter((p) => Number.isFinite(p.y));
      if (keys.length) {
        parts.push(h('h3', null, t('rr.chartTitle')),
          lineChart({ series: keys.map((k) => ({ name: t(`rr.m.${k}`), points: pts(k) })), yDomain: [0, 100], yFormat: (v) => `${Math.round(v)}%` }),
          legend(keys.map((k) => t(`rr.m.${k}`))));
      }
      parts.push(h('h3', null, t('rr.volumeTitle')), barChart({ items: weekMin.slice(-10).map((w) => ({ label: fmtDate(`${w.week}T12:00:00`), value: w.min })), format: (v) => t('common.minutes', { n: Math.round(v) }), emptyText: t('common.none') }));
      parts.push(h('h3', null, t('rr.entries')), h('table', { class: 'data' },
        h('tr', null, h('th', null, t('rr.date')), h('th', null, t('rr.type')), h('th', null, t('rr.pa')), h('th', null, 'K'), h('th', null, 'BB'), h('th', null, t('rr.m.chase')), h('th', null, '')),
        [...entries].reverse().map((e) => h('tr', null, h('td', null, fmtDate(`${e.date}T12:00:00`)), h('td', null, t(`rr.type.${e.type}`)), h('td', null, e.pa), h('td', null, e.k), h('td', null, e.bb),
          h('td', null, e.outsidePitches ? `${e.chases}/${e.outsidePitches}` : '–'),
          h('td', null, h('button', { class: 'btn small ghost', 'aria-label': t('common.delete'), on: { click: async () => {
            if ((await dialog({ title: t('common.delete'), body: t('rr.deleteConfirm'), buttons: [{ id: 'no', label: t('common.cancel'), primary: true }, { id: 'yes', label: t('common.delete'), danger: true }] })) === 'yes') { await app.repo.deleteRealResult(e.id); render(); }
          } } }, '✕'))))));
    } else parts.push(h('p', { class: 'muted' }, t('rr.none')));
    host.replaceChildren(h('section', { class: 'card stack' }, h('h2', null, t('rr.title')), ...parts));
  };
  await render();
  return host;
}
