// 2D catcher's-view strike-zone graphics: the small result plot and the
// full-size location picker used by Location Call.
import { PLATE_HALF_WIDTH, BALL_RADIUS } from '../../engine/units.js';
import { h } from '../../ui/dom.js';

const VIEW = { x0: -2.2, x1: 2.2, z0: 0.2, z1: 5.0 };

function mapper(w, hh, pad = 8) {
  const sx = (w - 2 * pad) / (VIEW.x1 - VIEW.x0), sz = (hh - 2 * pad) / (VIEW.z1 - VIEW.z0);
  const s = Math.min(sx, sz);
  const ox = (w - s * (VIEW.x1 - VIEW.x0)) / 2, oz = (hh - s * (VIEW.z1 - VIEW.z0)) / 2;
  return {
    s,
    px: (x) => ox + (x - VIEW.x0) * s,
    pz: (z) => hh - (oz + (z - VIEW.z0) * s),
    inv: (px, py) => ({ x: VIEW.x0 + (px - ox) / s, z: VIEW.z0 + (hh - py - oz) / s }),
  };
}

function drawZone(g, m, zone, { grid = true } = {}) {
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  g.strokeRect(m.px(zone.left), m.pz(zone.top), m.px(zone.right) - m.px(zone.left), m.pz(zone.bottom) - m.pz(zone.top));
  if (grid) {
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const x = zone.left + ((zone.right - zone.left) * i) / 3, z = zone.bottom + ((zone.top - zone.bottom) * i) / 3;
      g.beginPath(); g.moveTo(m.px(x), m.pz(zone.top)); g.lineTo(m.px(x), m.pz(zone.bottom)); g.stroke();
      g.beginPath(); g.moveTo(m.px(zone.left), m.pz(z)); g.lineTo(m.px(zone.right), m.pz(z)); g.stroke();
    }
  }
  // plate outline at the bottom for reference
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(m.px(-PLATE_HALF_WIDTH), m.pz(VIEW.z0 + 0.05), m.px(PLATE_HALF_WIDTH) - m.px(-PLATE_HALF_WIDTH), 4);
}

function dot(g, m, x, z, color, ring = false) {
  g.beginPath();
  g.arc(m.px(x), m.pz(z), Math.max(4, BALL_RADIUS * m.s), 0, Math.PI * 2);
  if (ring) { g.strokeStyle = color; g.lineWidth = 2.5; g.stroke(); } else { g.fillStyle = color; g.fill(); }
}

// Small result plot: actual location (filled) and optional guess (ring).
export function resultPlot(zone, actual, { correct, guess } = {}) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = 130, H = 150;
  const cv = h('canvas', { width: W * dpr, height: H * dpr, style: { position: 'absolute', left: '12px', top: '64px', width: `${W}px`, height: `${H}px`, background: 'rgba(10,14,20,.7)', borderRadius: '12px', zIndex: 25, pointerEvents: 'none' }, 'aria-hidden': 'true' });
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const m = mapper(W, H);
  drawZone(g, m, zone);
  if (guess) dot(g, m, guess.x, guess.z, '#ffd34d', true);
  dot(g, m, actual.x, actual.z, correct ? '#3ddc84' : '#ff6b6b');
  return cv;
}

// Location picker: resolves with {x, z} in feet (catcher's view) or null on cancel.
export function locationPicker(host, zone, onPick) {
  const W = Math.min(innerWidth * 0.62, (innerHeight - 84) * (4.4 / 4.8)), H = W * (4.8 / 4.4);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cv = h('canvas', { class: 'zone-pick', width: Math.round(W * dpr), height: Math.round(H * dpr), 'data-test': 'zone-pick',
    style: { left: `${(innerWidth - W) / 2}px`, top: `${Math.max(64, (innerHeight - H) / 2)}px`, width: `${W}px`, height: `${H}px`, background: 'rgba(8,12,18,.82)', borderRadius: '14px', border: '1px solid #2a3442' } });
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const m = mapper(W, H, 12);
  drawZone(g, m, zone);
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const loc = m.inv(e.clientX - r.left, e.clientY - r.top);
    onPick(loc, e);
  });
  host.appendChild(cv);
  return cv;
}
