// Export / import of all app data, and CSV export of sessions and trials.
import { STORE_NAMES, DB_VERSION } from './db.js';

export const EXPORT_FORMAT = 'battersEye.export';

export async function exportAll(adapter) {
  const stores = {};
  for (const s of STORE_NAMES) stores[s] = await adapter.getAll(s);
  return { format: EXPORT_FORMAT, schemaVersion: DB_VERSION, exportedAt: new Date().toISOString(), stores };
}

export function validateExport(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') errors.push('not an object');
  else {
    if (obj.format !== EXPORT_FORMAT) errors.push('wrong format marker');
    if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion > DB_VERSION) errors.push('unsupported schema version');
    if (!obj.stores || typeof obj.stores !== 'object') errors.push('missing stores');
    else {
      for (const [k, v] of Object.entries(obj.stores)) {
        if (!STORE_NAMES.includes(k)) errors.push(`unknown store ${k}`);
        else if (!Array.isArray(v)) errors.push(`store ${k} is not an array`);
      }
    }
  }
  return errors;
}

// mode "replace" wipes existing data first; "merge" overwrites records with equal keys.
export async function importAll(adapter, obj, { mode = 'replace' } = {}) {
  const errors = validateExport(obj);
  if (errors.length) throw new Error(`Invalid export file: ${errors.join(', ')}`);
  const rows = Object.fromEntries(STORE_NAMES.map((s) => [s, obj.stores[s] || []]));
  await adapter.bulkWrite(rows, { clear: mode === 'replace' });
  const counts = {};
  for (const s of STORE_NAMES) counts[s] = obj.stores[s]?.length || 0;
  return counts;
}

// ---- CSV ---------------------------------------------------------------

export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Flattens nested objects into dotted column names. Arrays are kept as JSON.
export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

export function toCSV(rows) {
  const flat = rows.map((r) => flatten(r));
  const cols = [];
  const seen = new Set();
  for (const r of flat) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  const lines = [cols.map(csvEscape).join(',')];
  for (const r of flat) lines.push(cols.map((c) => csvEscape(r[c])).join(','));
  return lines.join('\r\n');
}

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Browser helper: offer a string as a file download (no network involved).
export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
