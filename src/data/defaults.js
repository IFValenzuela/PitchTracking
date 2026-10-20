// Default settings. Stored in the `kv` store under key "settings" and merged
// (deeply) with these defaults on load, so new settings appear automatically.

export function guessPxPerCm() {
  // CSS pixels per centimetre differ a lot between device classes. This guess is
  // replaced by the card calibration during onboarding.
  const s = globalThis.screen;
  const minSide = s ? Math.min(s.width, s.height) : 800;
  if (minSide < 500) return 60; // phones
  if (minSide < 900) return 50; // tablets
  return 37.8; // desktop, 96 css px per inch
}

export function guessViewDistCm() {
  const s = globalThis.screen;
  const minSide = s ? Math.min(s.width, s.height) : 800;
  if (minSide < 500) return 40;
  if (minSide < 900) return 50;
  return 60;
}

export function defaultSettings() {
  const reduce = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return {
    onboarded: false,
    profile: { bats: 'R', level: 'hs', heightIn: 72 },
    calibration: { pxPerCm: guessPxPerCm(), viewDistCm: guessViewDistCm(), calibrated: false },
    prefs: {
      theme: 'dark',
      locale: 'en',
      quality: 'auto', // auto | low | medium | high
      stereo: 'off', // off | anaglyph | sbs  (WebXR is entered from the Pitch Lab when available)
      eyeSepCm: 6.3,
      view: 'batter', // batter | centered
      fovScale: 1, // 1 = true angular size from calibration
      headSway: false,
      sound: true,
      haptics: true,
      reduceMotion: reduce,
      buttonSide: 'right', // right | left | split
      cueAssist: 'auto', // on | off | auto (fades as you improve)
      swingTimeMs: 150, // modelled time from tap to bat-ball contact in Swing/Take
      blockSize: 20,
    },
    safety: {
      strobeAck: false,
      strobeEnabled: false,
      strobeHz: 2,
      strobeDuty: 0.5,
      strobeDim: true,
      dailyCapMin: 45,
      breakEveryMin: 20,
      capOverrideDate: null,
      restUntil: 0,
    },
    timing: { inputOffsetMs: 0, applyOffset: false, lastCheck: null },
  };
}

export function deepMerge(base, over) {
  if (over === undefined || over === null) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}
