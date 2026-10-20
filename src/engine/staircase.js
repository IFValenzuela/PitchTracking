// Transformed up-down staircase (Levitt 1971). Pure functions on plain objects,
// so the state can be stored in IndexedDB as is.
//
// Level: continuous difficulty index, higher = harder. With `down` consecutive
// correct answers the level goes up by `step`; one error brings it down by
// `step`. 2-down/1-up converges on ≈70.7 % correct; 3-down/1-up on ≈79.4 %.
// Step size halves at reversals until `minStep`.

export function createStaircase({ min = 0, max = 20, start = 2, down = 2, up = 1, step = 2, minStep = 0.5, halveEvery = 2 } = {}) {
  return { min, max, level: start, down, up, step, minStep, halveEvery, runCorrect: 0, runWrong: 0, lastDir: 0, reversals: [], trials: 0, correct: 0, history: [] };
}

export function targetPercent(down, up = 1) {
  // P(correct)^down = 0.5 for up = 1
  return up === 1 ? 100 * 0.5 ** (1 / down) : NaN;
}

export function updateStaircase(state, correct) {
  const s = { ...state, reversals: [...state.reversals], history: [...state.history] };
  s.trials += 1;
  if (correct) s.correct += 1;
  let dir = 0;
  if (correct) {
    s.runCorrect += 1; s.runWrong = 0;
    if (s.runCorrect >= s.down) { dir = +1; s.runCorrect = 0; }
  } else {
    s.runWrong += 1; s.runCorrect = 0;
    if (s.runWrong >= s.up) { dir = -1; s.runWrong = 0; }
  }
  if (dir !== 0) {
    if (s.lastDir !== 0 && dir !== s.lastDir) {
      s.reversals.push(s.level);
      if (s.reversals.length > 30) s.reversals.shift();
      if (s.reversals.length % s.halveEvery === 0) s.step = Math.max(s.minStep, s.step / 2);
    }
    s.lastDir = dir;
    s.level = Math.min(s.max, Math.max(s.min, s.level + dir * s.step));
  }
  s.history.push(Math.round(s.level * 100) / 100);
  if (s.history.length > 200) s.history.shift();
  return s;
}

// Threshold estimate: mean of the last (up to) 6 reversals, else the current level.
export function thresholdEstimate(state, n = 6) {
  const r = state.reversals.slice(-n);
  if (r.length >= 2) return r.reduce((a, b) => a + b, 0) / r.length;
  return state.level;
}

// Allows resuming a stored staircase with a larger step after a long break,
// so it can re-converge quickly if performance changed.
export function resumeStaircase(state, { idleDays = 0 } = {}) {
  if (!state) return state;
  if (idleDays >= 7) return { ...state, step: Math.max(state.step, 1), runCorrect: 0, runWrong: 0 };
  return { ...state, runCorrect: 0, runWrong: 0 };
}

// Map a level onto a parameter between easy and hard values (linear in level).
export function lerpLevel(level, maxLevel, easy, hard) {
  const f = Math.max(0, Math.min(1, level / maxLevel));
  return easy + (hard - easy) * f;
}
