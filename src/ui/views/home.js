// Home: one big "Start today's session" button, this week's plan, quick starts.
import { app } from '../../app.js';
import { t, fmtNum } from '../../i18n/i18n.js';
import { h } from '../dom.js';
import { ensurePlan } from '../../plan/planner-store.js';
import { nextSession, RETEST_DAYS } from '../../plan/planner.js';
import { streakDays } from '../../modules/progress/realresults.js';
import { rescoreAll } from '../../modules/assessment/eyecheck.js';
import { DRILLS } from '../../modules/gym/registry.js';

export function blockLabel(b) {
  return b.kind === 'lab' ? `${t('nav.lab')}: ${t(`lab.mode.${b.mode}`)}` : `${t('nav.gym')}: ${t(DRILLS[b.drill].nameKey)}`;
}

export async function homeView() {
  const repo = app.repo;
  const [plan, assessments, usage] = await Promise.all([ensurePlan(), repo.listAssessments(), repo.usageByDay()]);
  const scored = rescoreAll(assessments);
  const latest = scored[scored.length - 1];
  const used = Math.round((await repo.usageToday()) / 60000);
  const cap = repo.settings.safety.dailyCapMin;
  const next = nextSession(plan);
  const daysSince = latest ? Math.floor((Date.now() - latest.at) / 86400000) : null;

  const startBtn = next
    ? h('a', { class: 'btn primary big-start', href: '#/session', 'data-test': 'start-today' }, t('home.startToday'),
      h('small', null, t('home.startSub', { i: next.n, n: plan.sessions.length, min: Math.round(next.minutes) })))
    : h('a', { class: 'btn big-start', href: '#/lab' }, t('home.allDone'), h('small', null, t('home.allDoneSub')));

  const week = h('div', { class: 'card stack' },
    h('div', { class: 'row between' }, h('h2', null, t('home.thisWeek')), h('span', { class: 'badge' }, plan.weekStart)),
    plan.weakSkills?.length ? h('p', { class: 'hint' }, t('home.focus', { list: plan.weakSkills.map((s) => t(`skill.${s}`)).join(', ') })) : null,
    h('div', { class: 'row', style: { gap: '8px' } }, plan.sessions.map((s) => h('span', { class: `badge ${s.completedAt ? 'good' : s === next ? 'accent' : ''}` },
      `${t('home.sessionN', { n: s.n })}${s.completedAt ? ' ✓' : ''}`))),
    next ? h('div', null, next.blocks.map((b) => h('div', { class: 'plan-block' },
      h('span', { class: 'min' }, t('common.minutes', { n: Math.round(b.minutes) })),
      h('span', { class: b.doneAt ? 'done' : '' }, blockLabel(b), b.doneAt ? ` · ${t('home.blockDone')}` : '')))) : null);

  const tiles = h('div', { class: 'stat-tiles' },
    h('div', { class: 'stat-tile' }, h('div', { class: 'l' }, t('home.today')), h('div', { class: 'v' }, `${used}`), h('div', { class: 'd' }, t('home.minutesToday', { n: used, cap }))),
    h('div', { class: 'stat-tile' }, h('div', { class: 'l' }, t('home.streak')), h('div', { class: 'v' }, String(streakDays(usage))), h('div', { class: 'd' }, t('home.streakUnit'))),
    latest ? h('a', { class: 'stat-tile', href: '#/progress', style: { textDecoration: 'none', color: 'inherit' } }, h('div', { class: 'l' }, t('home.composite')), h('div', { class: 'v' }, fmtNum(latest.composite, 0)), h('div', { class: 'd' }, t('home.compositeSub'))) : null);

  const el = h('div', { class: 'stack' },
    h('div', { class: 'topbar' }, h('img', { class: 'logo', src: 'icons/icon.svg', alt: '' }), h('span', { class: 'title' }, t('app.name'))),
    !latest ? h('a', { class: 'btn primary big-start', href: '#/eyecheck', 'data-test': 'home-eyecheck' }, t('home.needEyeCheck'), h('small', null, t('home.needEyeCheckSub'))) : null,
    latest && daysSince >= RETEST_DAYS ? h('div', { class: 'notice' }, t('home.retestDue', { n: daysSince }), ' ', h('a', { href: '#/eyecheck' }, t('home.quickEye'))) : null,
    startBtn,
    tiles,
    week,
    h('div', { class: 'card' }, h('h3', null, t('home.quick')),
      h('div', { class: 'row' },
        h('a', { class: 'btn', href: '#/lab' }, t('home.quickLab')),
        h('a', { class: 'btn', href: '#/gym' }, t('home.quickGym')),
        h('a', { class: 'btn', href: '#/eyecheck' }, t('home.quickEye')))));
  return { el };
}
