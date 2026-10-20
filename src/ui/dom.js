// Minimal DOM helpers. h('div', {class:'x', on:{click}}, child, ...)

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(message, ms = 2600) {
  let host = document.querySelector('.toast-host');
  if (!host) { host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(host); }
  const el = h('div', { class: 'toast' }, message);
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

// Modal dialog that resolves with the id of the pressed button.
export function dialog({ title, body, buttons, dismissable = true }) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); resolve(v); };
    const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      title && h('h2', null, title),
      typeof body === 'string' ? h('p', null, body) : body,
      h('div', { class: 'dialog-buttons' },
        buttons.map((b) => h('button', { class: `btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}`, on: { click: () => close(b.id) } }, b.label))));
    const overlay = h('div', { class: 'dialog-overlay', on: { click: (e) => { if (dismissable && e.target === overlay) close(null); } } }, box);
    document.body.appendChild(overlay);
    box.querySelector('button.primary, button')?.focus();
  });
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint && h('span', { class: 'hint' }, hint));
}

export function select(value, options, onChange) {
  const el = h('select', { on: { change: () => onChange(el.value) } },
    options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value) }, label)));
  return el;
}

export function toggle(checked, onChange, label) {
  const input = h('input', { type: 'checkbox', checked, on: { change: () => onChange(input.checked) } });
  return h('label', { class: 'toggle' }, input, h('span', { class: 'toggle-track', 'aria-hidden': 'true' }), h('span', null, label));
}

export function segmented(value, options, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
  for (const [v, label] of options) {
    const b = h('button', { class: String(v) === String(value) ? 'on' : '', role: 'radio', 'aria-checked': String(String(v) === String(value)), type: 'button',
      on: { click: () => { for (const c of wrap.children) { c.classList.remove('on'); c.setAttribute('aria-checked', 'false'); } b.classList.add('on'); b.setAttribute('aria-checked', 'true'); onChange(v); } } }, label);
    wrap.appendChild(b);
  }
  return wrap;
}
