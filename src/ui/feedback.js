// Sound cues (synthesised with WebAudio, no media files) and haptics.
import { app } from '../app.js';

let ctx = null;

function audio() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Call from a user gesture once so iOS allows audio later.
export function unlockAudio() { if (app.repo?.settings.prefs.sound) audio(); }

const TONES = {
  good: [[880, 0.07], [1320, 0.09]],
  bad: [[220, 0.16]],
  tick: [[1000, 0.03]],
  go: [[660, 0.06]],
  done: [[660, 0.08], [880, 0.08], [1100, 0.12]],
};

export function sound(kind) {
  if (!app.repo?.settings.prefs.sound) return;
  const ac = audio();
  if (!ac) return;
  let t = ac.currentTime + 0.005;
  for (const [freq, dur] of TONES[kind] || TONES.tick) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = kind === 'bad' ? 'square' : 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
    t += dur;
  }
}

// Short burst of filtered noise: the "pop" of the ball reaching the mitt.
export function mittPop() {
  if (!app.repo?.settings.prefs.sound) return;
  const ac = audio();
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * 0.06);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1400;
  const g = ac.createGain();
  g.gain.value = 0.5;
  src.buffer = buf;
  src.connect(f).connect(g).connect(ac.destination);
  src.start();
}

export function haptic(pattern = 15) {
  if (!app.repo?.settings.prefs.haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

export function feedback(correct) {
  sound(correct ? 'good' : 'bad');
  haptic(correct ? 12 : [30, 40, 30]);
}
