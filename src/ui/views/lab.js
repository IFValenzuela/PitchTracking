import { t } from '../../i18n/i18n.js';
import { h } from '../dom.js';

export async function labView() {
  return { el: h('div', null, h('h1', null, t('nav.lab')), h('p', { class: 'muted' }, t('common.loading'))) };
}
