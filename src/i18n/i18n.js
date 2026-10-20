// Tiny i18n layer. Every user-facing string lives in a locale table (en.js).
// To add Spanish: create es.js with the same keys and register it below.
import en from './en.js';

const tables = { en };
let current = en;
let currentLocale = 'en';

export const LOCALES = Object.keys(tables);

export function setLocale(locale) {
  currentLocale = tables[locale] ? locale : 'en';
  current = tables[currentLocale];
  if (globalThis.document) document.documentElement.lang = currentLocale;
}

export function locale() { return currentLocale; }

export function has(key) { return key in current || key in en; }

export function t(key, vars) {
  let s = current[key] ?? en[key];
  if (s === undefined) {
    console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}

export function fmtNum(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return Number(n).toLocaleString(currentLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtDate(ts, opts = { month: 'short', day: 'numeric' }) {
  return new Date(ts).toLocaleDateString(currentLocale, opts);
}
