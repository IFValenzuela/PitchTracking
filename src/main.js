// Boot: open storage, load settings, build the shell, start the router, register the SW.
import { app } from './app.js';
import { t, setLocale } from './i18n/i18n.js';
import { openBestAdapter } from './data/db.js';
import { Repo } from './data/repo.js';
import { Router } from './ui/router.js';
import { h, toast } from './ui/dom.js';
import { applyTheme } from './ui/theme.js';
import { routes } from './ui/views/index.js';

const ICONS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  lab: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-5 4c2.5 2 2.5 8 0 10m10-10c-2.5 2-2.5 8 0 10',
  gym: 'M12 5c-5 0-9 7-9 7s4 7 9 7 9-7 9-7-4-7-9-7zm0 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
  progress: 'M4 20V10m6 10V4m6 16v-7m6 7H2',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

function navIcon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name]);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.8');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  s.appendChild(p);
  return s;
}

function buildShell() {
  const tabs = ['home', 'lab', 'gym', 'progress', 'settings'];
  const nav = h('nav', { class: 'nav', 'aria-label': t('app.name') },
    tabs.map((n) => h('a', { href: `#/${n}`, dataset: { tab: n } }, navIcon(n), h('span', null, t(`nav.${n}`)))));
  const outlet = h('main', { class: 'main', id: 'main' });
  const shell = h('div', { class: 'shell' }, nav, outlet);
  document.getElementById('app').replaceChildren(shell);
  return { nav, outlet };
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed') toast(navigator.serviceWorker.controller ? t('common.updateReady') : t('common.offlineReady'), 4000);
      });
    });
  }).catch((e) => console.warn('SW registration failed', e));
}

async function boot() {
  const adapter = await openBestAdapter();
  app.repo = await new Repo(adapter).init();
  const s = app.repo.settings;
  setLocale(s.prefs.locale);
  document.title = t('app.name');
  applyTheme(s.prefs.theme);
  document.documentElement.classList.toggle('reduce-motion', !!s.prefs.reduceMotion);

  const { nav, outlet } = buildShell();
  app.router = new Router(outlet, routes, {
    fallback: 'home',
    guard: (route) => (!app.repo.settings.onboarded && route.name !== 'onboarding' ? 'onboarding' : null),
    onChange: (route) => {
      nav.style.display = route.name === 'onboarding' ? 'none' : '';
      for (const a of nav.children) a.classList.toggle('active', a.dataset.tab === route.name || (route.name === 'drill' && a.dataset.tab === 'gym'));
    },
  });
  await app.router.render();
  registerSW();
  window.__battersEye = app; // handy for debugging and the e2e tests
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('app').textContent = `Startup error: ${err.message}`;
});
