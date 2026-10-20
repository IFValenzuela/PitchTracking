// Hash router: #/home, #/lab, #/gym/saccade ... Views are async functions that
// return { el, destroy? }.
import { clear } from './dom.js';

export class Router {
  constructor(outlet, routes, { fallback = 'home', guard, onChange } = {}) {
    this.outlet = outlet;
    this.routes = routes;
    this.fallback = fallback;
    this.guard = guard;
    this.onChange = onChange;
    this.current = null;
    this.seq = 0;
    window.addEventListener('hashchange', () => this.render());
  }

  parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    const [name, ...params] = path.split('/').filter(Boolean);
    return { name: name || this.fallback, params, query: Object.fromEntries(new URLSearchParams(query)) };
  }

  go(path) {
    const target = `#/${path.replace(/^#?\/?/, '')}`;
    if (location.hash === target) this.render();
    else location.hash = target;
  }

  async render() {
    const seq = ++this.seq;
    let route = this.parse();
    if (this.guard) {
      const redirect = this.guard(route);
      if (redirect && redirect !== route.name) { this.go(redirect); return; }
    }
    const view = this.routes[route.name] || this.routes[this.fallback];
    try { this.current?.destroy?.(); } catch (e) { console.error(e); }
    this.current = null;
    const result = await view(route);
    if (seq !== this.seq) { result?.destroy?.(); return; }
    clear(this.outlet);
    if (result?.el) this.outlet.appendChild(result.el);
    this.current = result;
    this.onChange?.(route);
    window.scrollTo(0, 0);
  }
}
