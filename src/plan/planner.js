// Weekly plan generator. Pure functions (unit-tested).
//
// Rules:
//  • 3 sessions per week, ~15 minutes each.
//  • Pitch Lab is at least half of every session (4 blocks ≈ 8 min).
//  • Gym drills (3 × 2 min) target the weakest skills, with variety across sessions.
//  • Every session has a decision mode (Zone Call / Swing-Take) and a recognition
//    mode (Pitch ID / Occlusion / Tunnel). Recognition progresses toward occlusion
//    and tunnelling as Pitch ID levels rise.
//  • Multiple-object tracking is never a priority pick (weak transfer evidence).

export const LAB_BLOCK_MIN = 2; // 20 pitches ≈ 2 minutes
export const DRILL_SECONDS = 120;
export const SESSIONS_PER_WEEK = 3;
export const RETEST_DAYS = 21;

// Which Gym drills support each skill. First entry is preferred.
export const SKILL_DRILLS = {
  anticipation: ['anticipation'],
  inhibition: ['gonogo'],
  zoneJudgment: ['gonogo'],
  reaction: ['gonogo', 'saccadeSnap'],
  saccades: ['saccadeSnap'],
  pursuit: ['pursuit'],
  dynamicAcuity: ['dynamicAcuity'],
  contrast: ['contrast'],
  pitchRecognition: ['visualSpan', 'dynamicAcuity'],
  peripheral: ['peripheral'],
  focusShift: ['nearFar'],
  visualSpan: ['visualSpan'],
  visualSearch: ['visualSearch'],
  depth: ['nearFar'],
};

// Variety pool for the third drill slot (MOT deliberately excluded).
const VARIETY = ['anticipation', 'peripheral', 'saccadeSnap', 'pursuit', 'visualSearch', 'nearFar', 'visualSpan', 'gonogo', 'dynamicAcuity'];

// Heuristic 0–1 proficiency from an Eye Check raw result. Used ONLY to rank which
// skills to train first (scores themselves are relative to the user's own baseline).
export function proficiency(skill, raw) {
  if (!raw || !Number.isFinite(raw.p)) return null;
  const c = (v) => Math.max(0, Math.min(1, v));
  const d = raw.display || {};
  switch (skill) {
    case 'reaction': return c((450 - (d.ms ?? 450)) / 250);
    case 'inhibition': return c(1 - (d.commissionPct ?? 50) / 60);
    case 'anticipation': return c((110 - (d.ms ?? 110)) / 95);
    case 'pitchRecognition': return c(((d.pct ?? 25) / 100 - 0.25) / 0.7);
    case 'zoneJudgment': return c((d.dprime ?? 0) / 3);
    default: return c(raw.p / 20); // staircase levels 0–20
  }
}

// Ranks skills from weakest to strongest using the latest Eye Check, the trend
// since the previous one, and Gym staircase levels for skills not in the Eye Check.
export function rankWeakSkills({ latest, previous, gymLevels = {} }) {
  const out = [];
  for (const [skill, raw] of Object.entries(latest?.raw || {})) {
    const p = proficiency(skill, raw);
    if (p === null) continue;
    let w = 1 - p;
    const prev = previous?.scores?.[skill]?.score, cur = latest?.scores?.[skill]?.score;
    if (Number.isFinite(prev) && Number.isFinite(cur) && cur < prev - 3) w += 0.15; // slipping
    if (skill === 'anticipation' || skill === 'zoneJudgment' || skill === 'pitchRecognition') w += 0.05; // closest to hitting
    out.push({ skill, weakness: +w.toFixed(3) });
  }
  const gymSkill = { peripheral: 'peripheral', nearFar: 'focusShift', visualSpan: 'visualSpan', visualSearch: 'visualSearch' };
  for (const [drill, skill] of Object.entries(gymSkill)) {
    if (out.some((x) => x.skill === skill)) continue;
    const lvl = gymLevels[drill];
    if (Number.isFinite(lvl)) out.push({ skill, weakness: +(1 - lvl / 20).toFixed(3) * 0.9 });
  }
  return out.sort((a, b) => b.weakness - a.weakness);
}

// Chooses Pitch Lab modes for a session.
export function labBlocksFor(sessionIdx, { weak = [], labLevels = {} }) {
  const recog = ['pid', 'occlusion', 'tunnel'];
  const decision = ['zone', 'swing'];
  const pidLvl = labLevels.pid ?? 0;
  // Progression: once Pitch ID is solid, lean on occlusion (the main progression) and tunnels.
  const recogOrder = pidLvl >= 12 ? ['occlusion', 'tunnel', 'occlusion'] : pidLvl >= 6 ? ['pid', 'occlusion', 'tunnel'] : ['pid', 'pid', 'occlusion'];
  const recogWeak = weak.findIndex((w) => w.skill === 'pitchRecognition');
  const zoneWeak = weak.findIndex((w) => w.skill === 'zoneJudgment' || w.skill === 'inhibition');
  const moreRecog = recogWeak !== -1 && (zoneWeak === -1 || recogWeak < zoneWeak);
  const blocks = [
    decision[sessionIdx % 2],
    recogOrder[sessionIdx % recogOrder.length],
    moreRecog ? recogOrder[(sessionIdx + 1) % recogOrder.length] : decision[(sessionIdx + 1) % 2],
    sessionIdx % 3 === 2 ? 'location' : moreRecog ? decision[(sessionIdx + 1) % 2] : recogOrder[(sessionIdx + 1) % recogOrder.length],
  ];
  return blocks.map((mode) => ({ kind: 'lab', mode, minutes: LAB_BLOCK_MIN, cfg: labCfg(mode) }));
}

function labCfg(mode) {
  const base = { mode, hand: 'mix', slot: 'mix', types: ['FF', 'SL', 'CH'] };
  if (mode === 'pid') return { ...base, types: ['FF', 'SL', 'CH', 'CU'] };
  if (mode === 'occlusion') return { ...base, occlTask: 'pid', types: ['FF', 'SL', 'CH'] };
  if (mode === 'tunnel') return { ...base, hand: 'R', slot: 'threeQuarter', pairs: [['FF', 'CH'], ['FF', 'SL'], ['FF', 'CU']] };
  if (mode === 'swing') return { ...base, types: ['FF', 'SL', 'CH', 'CU'] };
  return base;
}

// Chooses 3 Gym drills per session: two from the weakest skills, one for variety.
export function drillBlocksFor(sessionIdx, weak) {
  const ranked = [];
  // one drill per weak skill (its first unused option), so slots rotate across skills
  for (const w of weak) { const d = (SKILL_DRILLS[w.skill] || []).find((x) => !ranked.includes(x)); if (d) ranked.push(d); }
  if (!ranked.length) ranked.push('anticipation', 'gonogo', 'saccadeSnap', 'pursuit');
  const picks = [];
  const take = (d) => { if (d && !picks.includes(d)) picks.push(d); };
  take(ranked[0]); // the weakest area appears in every session
  take(ranked[1 + (sessionIdx % Math.max(1, Math.min(3, ranked.length - 1)))] ?? ranked[1]);
  for (let k = 0; picks.length < 3 && k < VARIETY.length * 2; k++) take(VARIETY[(sessionIdx * 3 + k) % VARIETY.length]);
  return picks.slice(0, 3).map((drill) => ({ kind: 'drill', drill, seconds: DRILL_SECONDS, minutes: DRILL_SECONDS / 60 }));
}

export function weekStartISO(ts) {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Builds the plan for the week containing `now`.
 * input: { now, latest, previous (assessments), gymLevels {drillId: level}, labLevels {mode: level}, keepCompleted (sessions already done this week) }
 */
export function buildWeeklyPlan({ now = Date.now(), latest = null, previous = null, gymLevels = {}, labLevels = {}, keepCompleted = [] } = {}) {
  const weak = rankWeakSkills({ latest, previous, gymLevels });
  const sessions = [];
  for (let i = 0; i < SESSIONS_PER_WEEK; i++) {
    const done = keepCompleted.find((s) => s.n === i + 1 && s.completedAt);
    if (done) { sessions.push(done); continue; }
    const lab = labBlocksFor(i, { weak, labLevels });
    const gym = drillBlocksFor(i, weak);
    // Interleave so the session alternates hitting-specific and supporting work.
    const blocks = [lab[0], gym[0], lab[1], gym[1], lab[2], gym[2], lab[3]].map((b, k) => ({ ...b, id: `${i + 1}.${k + 1}`, doneAt: null }));
    sessions.push({ n: i + 1, blocks, minutes: blocks.reduce((a, b) => a + b.minutes, 0), completedAt: null });
  }
  const lastAt = latest?.at ?? null;
  return {
    id: `plan_${weekStartISO(now)}`,
    weekStart: weekStartISO(now),
    createdAt: now,
    basedOn: latest?.id ?? null,
    weakSkills: weak.slice(0, 4).map((w) => w.skill),
    sessions,
    retestDue: !lastAt || now - lastAt > RETEST_DAYS * 86400000,
  };
}

export function labShare(session) {
  const lab = session.blocks.filter((b) => b.kind === 'lab').reduce((a, b) => a + b.minutes, 0);
  return lab / session.blocks.reduce((a, b) => a + b.minutes, 0);
}

export function nextSession(plan) { return plan?.sessions.find((s) => !s.completedAt) || null; }
