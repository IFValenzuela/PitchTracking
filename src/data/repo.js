// Repository: the app's only gateway to persistent data.
import { defaultSettings, deepMerge } from './defaults.js';

export function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${r}`;
}

export function localDateKey(ts = Date.now()) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export class Repo {
  constructor(adapter) {
    this.db = adapter;
    this.settings = defaultSettings();
    this.listeners = new Set();
  }

  async init() {
    const row = await this.db.get('kv', 'settings');
    this.settings = deepMerge(defaultSettings(), row?.value);
    return this;
  }

  onSettings(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  async saveSettings(patch) {
    this.settings = deepMerge(this.settings, patch);
    await this.db.put('kv', { key: 'settings', value: this.settings });
    for (const fn of this.listeners) fn(this.settings);
    return this.settings;
  }

  async kvGet(key, fallback = null) {
    const row = await this.db.get('kv', key);
    return row ? row.value : fallback;
  }

  kvSet(key, value) { return this.db.put('kv', { key, value }); }

  // --- sessions & trials -------------------------------------------------
  async saveSession(session) {
    const s = { id: session.id || uid('s_'), ...session };
    await this.db.put('sessions', s);
    return s;
  }

  async saveTrials(trials) { if (trials.length) await this.db.putMany('trials', trials); }

  async addTrial(trial) { await this.db.put('trials', trial); }

  async listSessions() {
    const all = await this.db.getAll('sessions');
    return all.sort((a, b) => a.startedAt - b.startedAt);
  }

  trialsForSession(sessionId) { return this.db.getAllByIndex('trials', 'sessionId', sessionId); }

  async trialsForModule(module) {
    const all = await this.db.getAllByIndex('trials', 'module', module);
    return all.sort((a, b) => a.t - b.t);
  }

  async allTrials() {
    const all = await this.db.getAll('trials');
    return all.sort((a, b) => a.t - b.t);
  }

  // --- staircases ---------------------------------------------------------
  async getStaircase(key) { return (await this.db.get('staircases', key))?.state || null; }

  saveStaircase(key, state) { return this.db.put('staircases', { key, state, updatedAt: Date.now() }); }

  async allStaircases() { return this.db.getAll('staircases'); }

  // --- assessments, plans, real results -----------------------------------
  async saveAssessment(a) { const v = { id: a.id || uid('a_'), ...a }; await this.db.put('assessments', v); return v; }

  async listAssessments() { return (await this.db.getAll('assessments')).sort((a, b) => a.at - b.at); }

  async savePlan(p) { await this.db.put('plans', p); return p; }

  async listPlans() { return (await this.db.getAll('plans')).sort((a, b) => a.createdAt - b.createdAt); }

  async currentPlan() { const ps = await this.listPlans(); return ps[ps.length - 1] || null; }

  async saveRealResult(r) { const v = { id: r.id || uid('r_'), ...r }; await this.db.put('realResults', v); return v; }

  deleteRealResult(id) { return this.db.delete('realResults', id); }

  async listRealResults() { return (await this.db.getAll('realResults')).sort((a, b) => (a.date < b.date ? -1 : 1)); }

  // --- daily usage (eye-strain cap) ---------------------------------------
  async usageToday() {
    const usage = await this.kvGet('usage', {});
    return usage[localDateKey()] || 0;
  }

  async addUsage(ms) {
    const usage = await this.kvGet('usage', {});
    const k = localDateKey();
    usage[k] = (usage[k] || 0) + ms;
    await this.kvSet('usage', usage);
    return usage[k];
  }

  async usageByDay() { return this.kvGet('usage', {}); }

  async wipeAll() {
    for (const s of ['kv', 'sessions', 'trials', 'staircases', 'assessments', 'plans', 'realResults']) await this.db.clear(s);
    this.settings = defaultSettings();
  }
}
