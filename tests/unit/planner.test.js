import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyPlan, labShare, rankWeakSkills, weekStartISO, nextSession, drillBlocksFor } from '../../src/plan/planner.js';

const latest = {
  id: 'a2', at: Date.parse('2026-10-19T10:00:00'),
  raw: {
    pitchRecognition: { p: 0, display: { pct: 40 } },
    zoneJudgment: { p: 2, display: { dprime: 2.2 } },
    anticipation: { p: 3, display: { ms: 35 } },
    pursuit: { p: 4 }, dynamicAcuity: { p: 14 }, contrast: { p: 12 }, saccades: { p: 9 },
    reaction: { p: 1.2, display: { ms: 280 } }, inhibition: { p: 1, display: { commissionPct: 10 } },
  },
  scores: {},
};

test('three sessions of about 15 minutes, Pitch Lab at least half', () => {
  const plan = buildWeeklyPlan({ now: Date.parse('2026-10-20T09:00:00'), latest });
  assert.equal(plan.sessions.length, 3);
  for (const s of plan.sessions) {
    assert.ok(s.minutes >= 13 && s.minutes <= 16, `minutes ${s.minutes}`);
    assert.ok(labShare(s) >= 0.5, `lab share ${labShare(s)}`);
    const modes = s.blocks.filter((b) => b.kind === 'lab').map((b) => b.mode);
    assert.ok(modes.some((m) => m === 'zone' || m === 'swing'), 'has a decision mode');
    assert.ok(modes.some((m) => ['pid', 'occlusion', 'tunnel'].includes(m)), 'has a recognition mode');
  }
});

test('weakest skills drive the drills and every session differs', () => {
  const weak = rankWeakSkills({ latest });
  assert.equal(weak[0].skill, 'pitchRecognition'); // 40 % pitch ID is the weakest area
  assert.equal(weak[1].skill, 'pursuit'); // level 4 of 20
  const plan = buildWeeklyPlan({ now: Date.parse('2026-10-20T09:00:00'), latest });
  const drillSets = plan.sessions.map((s) => s.blocks.filter((b) => b.kind === 'drill').map((b) => b.drill));
  for (const d of drillSets) assert.ok(d.includes('visualSpan'), 'weakest area supported every session');
  assert.ok(drillSets.some((d) => d.includes('pursuit')), 'second-weakest area scheduled');
  assert.ok(new Set(drillSets.map((d) => d.join())).size >= 2, 'sessions vary');
  for (const d of drillSets) assert.ok(!d.includes('mot'), 'MOT is not a priority pick');
});

test('recognition work progresses to occlusion as Pitch ID improves', () => {
  const lo = buildWeeklyPlan({ latest, labLevels: { pid: 2 } });
  const hi = buildWeeklyPlan({ latest, labLevels: { pid: 15 } });
  const count = (p, m) => p.sessions.flatMap((s) => s.blocks).filter((b) => b.mode === m).length;
  assert.ok(count(hi, 'occlusion') > count(lo, 'occlusion'));
});

test('plan works without an Eye Check and flags the re-test', () => {
  const plan = buildWeeklyPlan({ now: Date.parse('2026-10-20T09:00:00') });
  assert.equal(plan.sessions.length, 3);
  assert.ok(plan.retestDue);
  assert.equal(drillBlocksFor(0, []).length, 3);
});

test('completed sessions are kept when the plan is rebuilt', () => {
  const p1 = buildWeeklyPlan({ latest });
  p1.sessions[0].completedAt = 123;
  const p2 = buildWeeklyPlan({ latest, keepCompleted: p1.sessions, labLevels: { pid: 15 } });
  assert.equal(p2.sessions[0].completedAt, 123);
  assert.equal(nextSession(p2).n, 2);
});

test('weeks start on Monday', () => {
  assert.equal(weekStartISO(Date.parse('2026-10-22T12:00:00')), '2026-10-19');
  assert.equal(weekStartISO(Date.parse('2026-10-19T00:30:00')), '2026-10-19');
});
