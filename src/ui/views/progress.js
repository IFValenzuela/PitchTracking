// Progress & honesty dashboard.
import { app } from '../../app.js';
import { t, fmtNum, fmtDate } from '../../i18n/i18n.js';
import { h } from '../dom.js';
import { lineChart, barChart, zoneHeat, legend } from '../charts.js';
import { rescoreAll } from '../../modules/assessment/eyecheck.js';
import { SKILLS, compareScore } from '../../modules/assessment/metrics.js';
import { summarizeLab, strikeCallSDT } from '../../modules/pitchlab/stats.js';
import { biasText, stairLabel } from '../../modules/pitchlab/session.js';
import { thresholdEstimate } from '../../engine/staircase.js';
import { DRILLS } from '../../modules/gym/registry.js';
import { MODES } from '../../modules/pitchlab/modes.js';
import { weeklyMinutes } from '../../modules/progress/realresults.js';
import { toCSV, downloadText } from '../../data/export.js';
import { formatRaw, verdictBadge } from './eyecheck.js';
import { realResultsSection } from './results-log.js';

const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '–');
const card = (title, ...kids) => h('section', { class: 'card stack', style: { marginBottom: '14px' } }, h('h2', null, title), ...kids);
const tableView = (headers, rows) => h('details', { class: 'table-view' }, h('summary', null, t('prog.tableView')),
  h('table', { class: 'data' }, h('tr', null, headers.map((x) => h('th', null, x))), rows.map((r) => h('tr', null, r.map((c) => h('td', null, c))))));

export async function progressView() {
  const repo = app.repo;
  const [assessmentsRaw, sessions, labTrials, stairs, usage] = await Promise.all([
    repo.listAssessments(), repo.listSessions(), repo.trialsForModule('pitchlab'), repo.allStaircases(), repo.usageByDay()]);
  const assessments = rescoreAll(assessmentsRaw);
  const latest = assessments[assessments.length - 1], first = assessments[0], prev = assessments[assessments.length - 2];
  const parts = [h('h1', null, t('nav.progress')), h('p', { class: 'notice info' }, t('prog.honesty'))];

  // --- headline tiles ---
  const weekMin = weeklyMinutes(usage);
  const thisWeek = weekMin[weekMin.length - 1]?.min || 0;
  const totalMin = Object.values(usage).reduce((a, b) => a + b, 0) / 60000;
  const labN = labTrials.length;
  parts.push(h('div', { class: 'stat-tiles', style: { marginBottom: '14px' } },
    tile(t('prog.composite'), latest ? fmtNum(latest.composite, 0) : '–', latest && prev ? verdictBadge(compareScore({ score: prev.composite, sePts: prev.compositeSE }, { score: latest.composite, sePts: latest.compositeSE })) : t('prog.compositeNone')),
    tile(t('prog.weekMinutes'), fmtNum(thisWeek, 0), t('prog.totalMinutes', { n: fmtNum(totalMin, 0) })),
    tile(t('prog.pitchesSeen'), fmtNum(labN, 0), t('prog.sessionsN', { n: sessions.length }))));

  // --- in-app improvement: Eye Check ---
  parts.push(h('h2', { class: 'section' }, t('prog.nearTitle')), h('p', { class: 'hint' }, t('prog.nearBody')));
  if (assessments.length) {
    const skills = Object.keys(SKILLS).filter((s) => latest.scores[s]);
    parts.push(card(t('prog.eyeTitle'),
      lineChart({ series: [{ name: t('prog.composite'), points: assessments.map((a) => ({ x: a.at, y: a.composite })) }], refY: 50, yDomain: [30, 70], yFormat: (v) => fmtNum(v, 0) }),
      h('p', { class: 'hint' }, t('prog.eyeRef')),
      h('table', { class: 'data' },
        h('tr', null, h('th', null, t('eye.skill')), h('th', null, t('prog.latestResult')), h('th', null, t('eye.score')), h('th', null, t('prog.vsFirst')), assessments.length > 1 ? h('th', null, t('prog.vsPrev')) : null),
        skills.map((s) => h('tr', null, h('td', null, t(`skill.${s}`)), h('td', null, formatRaw(s, latest.raw[s])), h('td', null, fmtNum(latest.scores[s].score, 0)),
          h('td', null, first !== latest ? verdictBadge(compareScore(first.scores[s], latest.scores[s])) || '–' : t('prog.baseline')),
          assessments.length > 1 ? h('td', null, verdictBadge(compareScore(prev?.scores[s], latest.scores[s])) || '–') : null))),
      h('a', { class: 'btn small', href: '#/eyecheck' }, t('home.quickEye'))));
  } else parts.push(card(t('prog.eyeTitle'), h('p', { class: 'muted' }, t('prog.noEye')), h('a', { class: 'btn primary', href: '#/eyecheck' }, t('eye.start'))));

  // --- Pitch Lab ---
  if (labTrials.length) {
    const sum = summarizeLab(labTrials);
    const typeItems = sum.byType.filter((g) => g.n).sort((a, b) => b.n - a.n).map((g) => ({ label: t(`pitch.${g.key}`), value: g.accuracy, n: g.n }));
    const veloItems = sum.byVelo.sort((a, b) => a.key - b.key).map((g) => ({ label: `${g.key}–${+g.key + 4} mph`, value: g.accuracy, n: g.n }));
    const occItems = sum.byOcclusion.sort((a, b) => b.key - a.key).map((g) => ({ label: t('prog.hiddenAfter', { n: g.key }), value: g.accuracy, n: g.n }));
    const labSessions = sessions.filter((s) => s.module === 'pitchlab' && s.summary?.n);
    const zoneLike = labSessions.filter((s) => s.summary.sdt && (s.summary.sdt.hits + s.summary.sdt.misses + s.summary.sdt.fas + s.summary.sdt.crs) >= 8);
    const swingS = labSessions.filter((s) => s.mode === 'swing' && s.summary.decisions);
    const recent = labTrials.slice(-150);
    parts.push(card(t('prog.labTitle'),
      h('div', { class: 'stat-tiles' },
        tile(t('prog.labAcc'), pct(sum.accuracy), t('prog.ofN', { n: sum.n })),
        tile(t('prog.labRt'), Number.isFinite(sum.meanRt) ? `${Math.round(sum.meanRt)} ms` : '–', t('prog.labRtSub')),
        sum.timing ? tile(t('prog.timing'), `${Math.round(sum.timing.meanAbsErr)} ms`, t('prog.timingSub', { e: Math.round(sum.timing.earlyPct), l: Math.round(sum.timing.latePct) })) : null),
      h('h3', null, t('prog.bias')), h('p', null, biasText(strikeCallSDT(recent))),
      h('h3', null, t('prog.byType')), barChart({ items: typeItems, max: 1, format: pct }), tableView([t('lab.sum.type'), t('lab.sum.acc'), 'n'], typeItems.map((i) => [i.label, pct(i.value), i.n])),
      h('h3', null, t('prog.byZone')), h('p', { class: 'hint' }, t('prog.byZoneHint')), zoneHeat(sum.byRegion),
      veloItems.length ? [h('h3', null, t('prog.byVelo')), barChart({ items: veloItems, max: 1, format: pct, slot: 0 })] : null,
      occItems.length ? [h('h3', null, t('prog.byOcclusion')), barChart({ items: occItems, max: 1, format: pct, slot: 0 })] : null,
      zoneLike.length >= 2 ? [h('h3', null, t('prog.biasTrend')), h('p', { class: 'hint' }, t('prog.biasTrendHint')),
        lineChart({ series: [{ name: t('prog.criterion'), points: zoneLike.map((s) => ({ x: s.startedAt, y: s.summary.sdt.c })) }], refY: 0, yFormat: (v) => fmtNum(v, 1) })] : null,
      swingS.length >= 2 ? [h('h3', null, t('prog.decisionTrend')),
        lineChart({ series: [{ name: t('prog.goodDecisions'), points: swingS.map((s) => ({ x: s.startedAt, y: s.summary.decisions.correctPct })) }, { name: t('prog.chaseRate'), points: swingS.map((s) => ({ x: s.startedAt, y: s.summary.decisions.chasePct })) }], yDomain: [0, 100], yFormat: (v) => `${Math.round(v)}%` }),
        legend([t('prog.goodDecisions'), t('prog.chaseRate')])] : null,
      levelsChart(labSessions)));
  } else parts.push(card(t('prog.labTitle'), h('p', { class: 'muted' }, t('prog.noLab'))));

  // --- Levels and personal bests ---
  parts.push(card(t('prog.bestsTitle'), bests(stairs, sessions)));

  // --- Training volume ---
  parts.push(card(t('prog.volumeTitle'),
    barChart({ items: weekMin.slice(-10).map((w) => ({ label: fmtDate(`${w.week}T12:00:00`), value: w.min })), format: (v) => t('common.minutes', { n: Math.round(v) }), emptyText: t('common.none') })));

  // --- Real results (far transfer) ---
  parts.push(h('h2', { class: 'section' }, t('prog.farTitle')), await realResultsSection(sessions, weekMin));

  // --- History ---
  parts.push(card(t('prog.history'),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', on: { click: () => downloadText(`battersEye-sessions-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(sessions), 'text/csv') } }, t('set.exportSessions')),
      h('button', { class: 'btn small', on: { click: async () => downloadText(`battersEye-trials-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(await repo.allTrials()), 'text/csv') } }, t('set.exportTrials'))),
    sessions.length ? h('table', { class: 'data' }, h('tr', null, h('th', null, t('prog.date')), h('th', null, t('prog.activity')), h('th', null, 'n'), h('th', null, t('lab.sum.acc')), h('th', null, t('prog.duration'))),
      sessions.slice(-25).reverse().map((s) => h('tr', null,
        h('td', null, fmtDate(s.startedAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
        h('td', null, activityName(s)),
        h('td', null, s.summary?.n ?? '–'),
        h('td', null, pct(s.summary?.accuracy)),
        h('td', null, t('common.minutes', { n: fmtNum((s.durationMs || 0) / 60000, 1) }))))) : h('p', { class: 'muted' }, t('common.none'))));
  return { el: h('div', null, ...parts) };
}

function tile(l, v, d) { return h('div', { class: 'stat-tile' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d)); }

function activityName(s) {
  if (s.kind === 'eyecheck') return `${t('eye.title')} · ${s.module === 'pitchlab' || MODES[s.mode] ? t(`lab.mode.${s.mode}`) : t(DRILLS[s.drill]?.nameKey || 'eye.title')}`;
  if (s.module === 'pitchlab') return `${t('nav.lab')} · ${t(`lab.mode.${s.mode}`)}`;
  return `${t('nav.gym')} · ${DRILLS[s.drill] ? t(DRILLS[s.drill].nameKey) : s.drill}`;
}

// Level reached per Pitch Lab mode across sessions (end-of-block staircase level).
function levelsChart(labSessions) {
  const byMode = {};
  for (const s of labSessions) {
    for (const [key, v] of Object.entries(s.summary.levels || {})) {
      const mode = key.split(':')[1];
      (byMode[mode] ||= []).push({ x: s.startedAt, y: v.end, label: stairLabel(key) });
    }
  }
  const modes = Object.keys(byMode).filter((m) => byMode[m].length >= 2).slice(0, 4);
  if (!modes.length) return null;
  const names = modes.map((m) => t(`lab.mode.${m === 'loc' ? 'location' : m === 'occl' ? 'occlusion' : m}`));
  return [h('h3', null, t('prog.levelTrend')), lineChart({ series: modes.map((m, i) => ({ name: names[i], points: byMode[m] })), yDomain: [0, 20], yFormat: (v) => fmtNum(v, 0) }), legend(names)];
}

function bests(stairs, sessions) {
  const rows = [];
  for (const s of stairs) {
    const best = Math.max(...(s.state.history?.length ? s.state.history : [s.state.level]));
    const thr = thresholdEstimate(s.state);
    let label, detail = '';
    if (s.key.startsWith('gym:')) {
      const d = DRILLS[s.key.split(':')[1]];
      if (!d) continue;
      label = `${t('nav.gym')} · ${t(d.nameKey)}`;
      if (d.ladderText) detail = d.ladderText(best, { settings: app.repo.settings });
    } else if (s.key.startsWith('pl:')) {
      label = `${t('nav.lab')} · ${stairLabel(s.key)}`;
      if (s.key.startsWith('pl:occl')) detail = t('lab.occludedAt', { n: Math.round(MODES.occlusion.ladder(best, { settings: app.repo.settings }).occlusionFt) });
    } else continue;
    rows.push({ label, thr, best, detail });
  }
  const blocks = sessions.filter((s) => s.module === 'pitchlab' && (s.summary?.n || 0) >= 10);
  const bestBlock = blocks.reduce((b, s) => (!b || s.summary.accuracy > b.summary.accuracy ? s : b), null);
  if (!rows.length) return h('p', { class: 'muted' }, t('common.none'));
  rows.sort((a, b) => b.best - a.best);
  return h('div', null,
    bestBlock ? h('p', null, t('prog.bestBlock', { pct: pct(bestBlock.summary.accuracy), mode: t(`lab.mode.${bestBlock.mode}`), date: fmtDate(bestBlock.startedAt) })) : null,
    barChart({ items: rows.map((r) => ({ label: r.label, value: r.thr, note: `${t('prog.bestLevel', { n: fmtNum(r.best, 1) })}${r.detail ? ` · ${r.detail}` : ''}` })), max: 20, format: (v) => t('train.level', { n: fmtNum(v, 1) }) }),
    tableView([t('prog.activity'), t('prog.currentLevel'), t('prog.bestLevelH')], rows.map((r) => [r.label, fmtNum(r.thr, 1), `${fmtNum(r.best, 1)}${r.detail ? ` (${r.detail})` : ''}`])));
}
