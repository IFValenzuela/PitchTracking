// Small SVG chart kit: line (with crosshair tooltip), horizontal bars, zone heat map.
// Colours come from CSS custom properties (css/app.css → --series-N, --seq-N),
// assigned in fixed order. One y-axis per chart; never dual axes.
import { h, svg } from './dom.js';

const PAD = { l: 40, r: 14, t: 12, b: 26 };

function niceTicks(lo, hi, n = 4) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) { lo = (lo || 0) - 1; hi = (hi || 0) + 1; }
  const span = hi - lo, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

// Mounts a chart that re-renders at the container's real width.
function mount(draw, height) {
  const host = h('div', { class: 'viz', style: { position: 'relative', width: '100%' } });
  const tip = h('div', { class: 'viz-tip', role: 'status', style: { display: 'none' } });
  let lastW = 0;
  const render = () => {
    const w = Math.max(240, Math.round(host.clientWidth || 600));
    if (w === lastW) return;
    lastW = w;
    host.replaceChildren(draw(w, height, tip), tip);
  };
  const ro = new ResizeObserver(render);
  ro.observe(host);
  queueMicrotask(render);
  return host;
}

function showTip(tip, host, x, y, html) {
  tip.innerHTML = html;
  tip.style.display = 'block';
  const w = host.clientWidth;
  tip.style.left = `${Math.min(Math.max(0, x + 12), w - 180)}px`;
  tip.style.top = `${Math.max(0, y - 10)}px`;
}

/**
 * lineChart({ series: [{ name, points: [{x, y, label?}] }], yFormat, xFormat, yDomain, refY, height, emptyText })
 */
export function lineChart({ series, yFormat = (v) => String(v), xFormat = (v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), yDomain, refY, height = 200, emptyText = '' }) {
  const all = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.y));
  if (!all.length) return h('p', { class: 'muted' }, emptyText);
  return mount((W, H, tip) => {
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    let [y0, y1] = yDomain || [Math.min(...ys), Math.max(...ys)];
    if (refY !== undefined) { y0 = Math.min(y0, refY); y1 = Math.max(y1, refY); }
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const ticks = niceTicks(y0, y1);
    y0 = Math.min(y0, ticks[0]); y1 = Math.max(y1, ticks[ticks.length - 1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    if (x0 === x1) { x0 -= 86400000; x1 += 86400000; }
    const sx = (x) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
    const sy = (y) => H - PAD.b - ((y - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
    const g = svg('svg', { width: W, height: H, class: 'chart', role: 'img' });
    for (const tk of ticks) {
      g.appendChild(svg('line', { x1: PAD.l, x2: W - PAD.r, y1: sy(tk), y2: sy(tk), class: 'grid-line' }));
      g.appendChild(svg('text', { x: PAD.l - 6, y: sy(tk) + 4, 'text-anchor': 'end' }, yFormat(tk)));
    }
    if (refY !== undefined) g.appendChild(svg('line', { x1: PAD.l, x2: W - PAD.r, y1: sy(refY), y2: sy(refY), class: 'ref-line' }));
    g.appendChild(svg('text', { x: PAD.l, y: H - 6 }, xFormat(x0)));
    g.appendChild(svg('text', { x: W - PAD.r, y: H - 6, 'text-anchor': 'end' }, xFormat(x1)));
    series.forEach((s, i) => {
      const pts = s.points.filter((p) => Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
      if (!pts.length) return;
      const cls = `s${(s.slot ?? i) % 4 + 1}`;
      if (pts.length > 1) g.appendChild(svg('path', { d: pts.map((p, k) => `${k ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(''), class: `series-line ${cls}` }));
      const last = pts[pts.length - 1];
      g.appendChild(svg('circle', { cx: sx(last.x), cy: sy(last.y), r: 4.5, class: `series-dot ${cls}` }));
      if (pts.length <= 12) for (const p of pts.slice(0, -1)) g.appendChild(svg('circle', { cx: sx(p.x), cy: sy(p.y), r: 3, class: `series-dot small ${cls}` }));
    });
    // crosshair + tooltip
    const cross = svg('line', { y1: PAD.t, y2: H - PAD.b, class: 'crosshair', visibility: 'hidden' });
    g.appendChild(cross);
    const hit = svg('rect', { x: PAD.l, y: 0, width: W - PAD.l - PAD.r, height: H, fill: 'transparent' });
    const uniqX = [...new Set(xs)].sort((a, b) => a - b);
    hit.addEventListener('pointermove', (e) => {
      const r = g.getBoundingClientRect();
      const mx = e.clientX - r.left;
      let best = uniqX[0];
      for (const x of uniqX) if (Math.abs(sx(x) - mx) < Math.abs(sx(best) - mx)) best = x;
      cross.setAttribute('x1', sx(best)); cross.setAttribute('x2', sx(best)); cross.setAttribute('visibility', 'visible');
      const rows = series.map((s, i) => { const p = s.points.find((q) => q.x === best); return p && Number.isFinite(p.y) ? `<div><i class="key s${(s.slot ?? i) % 4 + 1}"></i>${s.name}: <b>${yFormat(p.y)}</b>${p.label ? ` <small>${p.label}</small>` : ''}</div>` : ''; }).join('');
      showTip(tip, g.parentNode, sx(best), e.clientY - r.top, `<div class="tip-h">${xFormat(best)}</div>${rows}`);
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; });
    g.appendChild(hit);
    return g;
  }, height);
}

/**
 * barChart({ items: [{ label, value, n?, note? }], max, format, slot })
 * Horizontal bars ≤ 22 px thick, 4 px rounded data end, value at the tip.
 */
export function barChart({ items, max, format = (v) => String(v), slot = 0, emptyText = '' }) {
  if (!items.length) return h('p', { class: 'muted' }, emptyText);
  const rowH = 30, H = items.length * rowH + 8;
  return mount((W, _h, tip) => {
    const labelW = Math.min(150, W * 0.36), valW = 64;
    const m = max ?? Math.max(...items.map((i) => i.value), 1e-9);
    const sx = (v) => Math.max(0, (v / m) * (W - labelW - valW));
    const g = svg('svg', { width: W, height: H, class: 'chart', role: 'img' });
    items.forEach((it, k) => {
      const y = 4 + k * rowH, bh = 18, len = sx(it.value);
      g.appendChild(svg('text', { x: labelW - 8, y: y + bh / 2 + 4, 'text-anchor': 'end' }, it.label));
      g.appendChild(svg('rect', { x: labelW, y, width: W - labelW - valW, height: bh, rx: 4, class: 'bar-track' }));
      if (len > 0) g.appendChild(svg('path', { d: `M${labelW},${y}h${Math.max(0, len - 4)}a4,4 0 0 1 4,4v${bh - 8}a4,4 0 0 1 -4,4h${-Math.max(0, len - 4)}z`, class: `bar s${slot % 4 + 1}` }));
      g.appendChild(svg('text', { x: labelW + len + 6, y: y + bh / 2 + 4, class: 'val' }, format(it.value)));
      const hit = svg('rect', { x: 0, y, width: W, height: rowH, fill: 'transparent' });
      hit.addEventListener('pointerenter', () => showTip(tip, g.parentNode, labelW + len, y, `<b>${it.label}</b>: ${format(it.value)}${it.n !== undefined ? ` <small>(n = ${it.n})</small>` : ''}${it.note ? `<br><small>${it.note}</small>` : ''}`));
      hit.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
      g.appendChild(hit);
    });
    return g;
  }, H);
}

// Zone heat map (catcher's view): 3×3 inner grid + 4 outside corners, sequential blue
// by accuracy; each cell shows % and n. Cells with no data are blank.
export function zoneHeat(regions, { format = (v) => `${Math.round(v * 100)}%` } = {}) {
  const get = (k) => regions.find((r) => String(r.key) === String(k));
  const cell = (k) => {
    const r = get(k);
    if (!r || !r.n) return h('div', { class: 'heat-cell empty' }, '·');
    const step = Math.min(6, Math.max(0, Math.round(r.accuracy * 6)));
    return h('div', { class: `heat-cell seq${step}`, title: `${format(r.accuracy)} (n = ${r.n})` }, h('b', null, format(r.accuracy)), h('small', null, `n ${r.n}`));
  };
  return h('div', { class: 'zoneheat' },
    h('div', { class: 'zh-row' }, cell(11), h('div', { class: 'zh-gap' }), cell(12)),
    h('div', { class: 'zh-grid' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(cell)),
    h('div', { class: 'zh-row' }, cell(13), h('div', { class: 'zh-gap' }), cell(14)));
}

export function legend(names) {
  return h('div', { class: 'legend' }, names.map((n, i) => h('span', null, h('i', { class: `key s${i % 4 + 1}` }), n)));
}
