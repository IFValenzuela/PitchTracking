// Canvas 2D drawing helpers shared by the drills.

// Landolt C: outer diameter `d` px, stroke and gap = d/5. dir: 0 right, 1 up, 2 left, 3 down.
export function landolt(g, x, y, d, dir, color = '#fff') {
  const r = d / 2, w = d / 5;
  const gapHalf = Math.asin(Math.min(1, w / 2 / (r - w / 2)));
  const base = [0, -Math.PI / 2, Math.PI, Math.PI / 2][dir];
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'butt';
  g.beginPath();
  g.arc(x, y, r - w / 2, base + gapHalf, base - gapHalf + Math.PI * 2);
  g.stroke();
}

export function disc(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

export function ring(g, x, y, r, color, w = 2) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
}

// A small baseball glyph (white disc with two red seam arcs).
export function baseball(g, x, y, r, { seamColor = '#d6332f', fill = '#f4f1ea', mark = null } = {}) {
  disc(g, x, y, r, fill);
  g.strokeStyle = seamColor;
  g.lineWidth = Math.max(1, r * 0.12);
  g.beginPath(); g.arc(x - r * 1.35, y, r * 1.0, -0.75, 0.75); g.stroke();
  g.beginPath(); g.arc(x + r * 1.35, y, r * 1.0, Math.PI - 0.75, Math.PI + 0.75); g.stroke();
  if (mark === 'dot') disc(g, x, y, r * 0.32, '#d6332f');
  if (mark === 'stripe') { g.lineWidth = r * 0.3; g.beginPath(); g.moveTo(x - r * 0.85, y); g.lineTo(x + r * 0.85, y); g.stroke(); }
}

export function crosshair(g, x, y, s, color = '#fff') {
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke();
}

export function text(g, str, x, y, { size = 20, color = '#fff', align = 'center', weight = 700, base = 'middle' } = {}) {
  g.fillStyle = color;
  g.font = `${weight} ${size}px system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = base;
  g.fillText(str, x, y);
}

export const DIRS = ['right', 'up', 'left', 'down'];
