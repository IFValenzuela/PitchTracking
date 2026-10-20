// Connects the pure planner to stored data.
import { app } from '../app.js';
import { thresholdEstimate } from '../engine/staircase.js';
import { buildWeeklyPlan, weekStartISO } from './planner.js';
import { rescoreAll } from '../modules/assessment/eyecheck.js';

async function inputs() {
  const assessments = rescoreAll(await app.repo.listAssessments());
  const stairs = await app.repo.allStaircases();
  const gymLevels = {}, labLevels = {};
  for (const s of stairs) {
    const lvl = thresholdEstimate(s.state);
    if (s.key.startsWith('gym:')) gymLevels[s.key.split(':')[1]] = lvl;
    if (s.key.startsWith('pl:')) {
      const mode = s.key.split(':')[1];
      labLevels[mode] = Math.max(labLevels[mode] ?? 0, lvl);
    }
  }
  return { latest: assessments[assessments.length - 1] || null, previous: assessments[assessments.length - 2] || null, gymLevels, labLevels };
}

export async function buildAndSavePlan({ keep = true } = {}) {
  const cur = await app.repo.currentPlan();
  const sameWeek = cur && cur.weekStart === weekStartISO(Date.now());
  const plan = buildWeeklyPlan({ now: Date.now(), ...(await inputs()), keepCompleted: keep && sameWeek ? cur.sessions : [] });
  if (sameWeek) {
    // keep progress on the session in progress
    for (const s of plan.sessions) {
      const old = cur.sessions.find((x) => x.n === s.n);
      if (old && !s.completedAt && old.blocks.some((b) => b.doneAt)) Object.assign(s, old);
    }
  }
  await app.repo.savePlan(plan);
  return plan;
}

// Returns this week's plan, building one if needed.
export async function ensurePlan() {
  const cur = await app.repo.currentPlan();
  if (cur && cur.weekStart === weekStartISO(Date.now())) {
    // A newer Eye Check than the one this plan was built from → re-plan, keeping finished sessions.
    const as = await app.repo.listAssessments();
    const latestId = as[as.length - 1]?.id ?? null;
    if (latestId === cur.basedOn) return cur;
    return buildAndSavePlan();
  }
  return buildAndSavePlan({ keep: false });
}

export async function markBlockDone(plan, sessionN, blockId) {
  const s = plan.sessions.find((x) => x.n === sessionN);
  const b = s?.blocks.find((x) => x.id === blockId);
  if (b) b.doneAt = Date.now();
  if (s && s.blocks.every((x) => x.doneAt)) s.completedAt = Date.now();
  await app.repo.savePlan(plan);
  // Adjust the remaining sessions from the latest results.
  if (s?.completedAt) return buildAndSavePlan();
  return plan;
}
