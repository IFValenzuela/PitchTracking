// "Today's session": runs the next plan session block by block.
import { app } from '../../app.js';
import { t } from '../../i18n/i18n.js';
import { h } from '../dom.js';
import { ensurePlan, markBlockDone } from '../../plan/planner-store.js';
import { nextSession } from '../../plan/planner.js';
import { runPitchLab } from '../../modules/pitchlab/session.js';
import { runDrill } from '../../modules/gym/runner.js';
import { DRILLS } from '../../modules/gym/registry.js';
import { preTrainingCheck } from '../safety.js';
import { blockLabel } from './home.js';

export async function sessionView() {
  let plan = await ensurePlan();
  const root = h('div', { class: 'onb stack' });
  let checked = false;

  async function runBlock(session, block) {
    if (!checked) { if (!(await preTrainingCheck())) return false; checked = true; }
    const opts = { skipChecks: true, doneLabel: t('session.next') };
    const res = block.kind === 'lab' ? await runPitchLab({ ...block.cfg, count: app.repo.settings.prefs.blockSize }, opts)
      : await runDrill(DRILLS[block.drill], { seconds: block.seconds, ...opts });
    if (!res || res.stopped) return false;
    plan = await markBlockDone(plan, session.n, block.id);
    return true;
  }

  function render() {
    const s = nextSession(plan);
    if (!s) {
      root.replaceChildren(h('h1', null, t('session.doneTitle')), h('p', null, t('session.doneBody')),
        h('a', { class: 'btn primary', href: '#/progress' }, t('nav.progress')), h('a', { class: 'btn', href: '#/home' }, t('nav.home')));
      return;
    }
    const pending = s.blocks.find((b) => !b.doneAt);
    const doneN = s.blocks.filter((b) => b.doneAt).length;
    root.replaceChildren(
      h('h1', null, t('home.sessionN', { n: s.n })),
      h('div', { class: 'progress', 'aria-label': t('session.progress', { i: doneN, n: s.blocks.length }) }, h('div', { style: { width: `${(100 * doneN) / s.blocks.length}%` } })),
      h('p', { class: 'muted' }, t('session.progress', { i: doneN, n: s.blocks.length })),
      h('div', null, s.blocks.map((b) => h('div', { class: 'plan-block' },
        h('span', { class: 'min' }, t('common.minutes', { n: Math.round(b.minutes) })),
        h('span', { class: b.doneAt ? 'done' : b === pending ? '' : 'muted' }, blockLabel(b), b.doneAt ? ' ✓' : '')))),
      h('div', { class: 'card' }, h('h2', null, blockLabel(pending)),
        h('p', null, pending.kind === 'lab' ? t(`lab.modeHow.${pending.mode}`) : t(DRILLS[pending.drill].howKey)),
        h('button', { class: 'btn primary big-start', 'data-test': 'session-go', on: { click: async (e) => {
          e.target.disabled = true;
          await runBlock(s, pending);
          render();
        } } }, doneN ? t('session.continue') : t('session.begin'))),
      h('a', { class: 'btn ghost', href: '#/home' }, t('session.later')));
  }
  render();
  return { el: root };
}
