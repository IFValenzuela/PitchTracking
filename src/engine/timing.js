// Timing utilities. Pure functions are unit-tested; FrameClock runs in the browser.
//
// Timebase: everything uses the performance.now() clock (ms). Pointer events
// carry event.timeStamp on the same clock in all current browsers, which lets us
// timestamp a tap at the moment the OS delivered it, not when our handler ran.

export function now() { return globalThis.performance ? performance.now() : Date.now(); }

// Returns the event's timestamp on the performance.now() clock.
export function eventTime(e, nowMs = now()) {
  const ts = e?.timeStamp;
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return nowMs;
  // Very old engines used epoch-based timestamps; ignore anything implausible.
  if (ts > nowMs + 50 || ts < nowMs - 5000) return nowMs;
  return ts;
}

export function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; }

export function sd(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function median(xs) { return quantile(xs, 0.5); }

// Summary of requestAnimationFrame intervals.
export function frameStats(intervals) {
  const xs = intervals.filter((d) => d > 0 && d < 1000);
  const med = median(xs);
  const m = mean(xs);
  return {
    n: xs.length,
    fps: xs.length ? 1000 / m : NaN,
    meanMs: m,
    medianMs: med,
    p95Ms: quantile(xs, 0.95),
    p99Ms: quantile(xs, 0.99),
    // A frame is "late" if it took more than 1.5 x the typical frame.
    latePct: xs.length ? (100 * xs.filter((d) => d > med * 1.5).length) / xs.length : NaN,
  };
}

// Tap-along synchronisation: asynchronies = tapTime - stimulusPresentTime (ms).
// Removes outliers beyond 3 MAD, then reports offset, spread and an overall
// timing-uncertainty estimate that includes half a frame of display quantisation.
export function syncStats(asyncs, frameMs = 16.7) {
  if (!asyncs.length) return { n: 0, meanMs: NaN, sdMs: NaN, uncertaintyMs: NaN };
  const med = median(asyncs);
  const mad = median(asyncs.map((a) => Math.abs(a - med))) || 1;
  const kept = asyncs.filter((a) => Math.abs(a - med) <= 3 * 1.4826 * mad + 5);
  const s = sd(kept);
  return {
    n: kept.length,
    rejected: asyncs.length - kept.length,
    meanMs: mean(kept),
    sdMs: s,
    uncertaintyMs: Math.sqrt((Number.isFinite(s) ? s : 0) ** 2 + (frameMs / 2) ** 2),
  };
}

export class FrameClock {
  constructor() {
    this.last = 0;
    this.ema = 16.67;
    this.intervals = [];
  }

  tick(ts) {
    if (this.last) {
      const d = ts - this.last;
      if (d > 0 && d < 250) {
        this.ema = this.ema * 0.9 + d * 0.1;
        this.intervals.push(d);
        if (this.intervals.length > 600) this.intervals.shift();
      }
    }
    this.last = ts;
  }

  // rAF timestamps mark the start of a frame; the image reaches the screen
  // roughly one frame later. Renderers add this lead so what is displayed
  // matches the physical clock at the moment of display.
  presentLead() { return Math.min(this.ema, 34); }

  get frameMs() { return this.ema; }

  stats() { return frameStats(this.intervals); }

  reset() { this.last = 0; this.intervals = []; }
}

// Tap offset correction measured in the Settings self-check (optional).
export function correctedTapTime(rawTs, timingSettings) {
  return timingSettings?.applyOffset ? rawTs - (timingSettings.inputOffsetMs || 0) : rawTs;
}
