import { app } from '../../app.js';
import { t } from '../../i18n/i18n.js';
import { h } from '../dom.js';

export async function homeView() {
  const used = Math.round((await app.repo.usageToday()) / 60000);
  const el = h('div', null,
    h('div', { class: 'topbar' }, h('img', { class: 'logo', src: 'icons/icon.svg', alt: '' }), h('span', { class: 'title' }, t('app.name'))),
    h('h1', null, t('home.greeting')),
    h('p', { class: 'muted' }, t('home.minutesToday', { n: used, cap: app.repo.settings.safety.dailyCapMin })));
  return { el };
}
