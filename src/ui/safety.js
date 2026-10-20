// Safety rules: photosensitivity gate, strobe caps, daily training cap, rest.
import { app } from '../app.js';
import { t } from '../i18n/i18n.js';
import { dialog } from './dom.js';

export const MAX_STROBE_HZ = 4; // hard cap, enforced in clampStrobe()
export const MIN_STROBE_HZ = 0.5;
export const MIN_DUTY = 0.2; // minimum visible fraction of each cycle
export const MAX_DUTY = 0.9;
export const REST_MS = 2 * 60 * 60 * 1000; // after discomfort: suggest 2 h rest

export function clampStrobe({ hz, duty }) {
  const h = Math.min(MAX_STROBE_HZ, Math.max(MIN_STROBE_HZ, Number(hz) || 2));
  const d = Math.min(MAX_DUTY, Math.max(MIN_DUTY, Number(duty) || 0.5));
  return { hz: h, duty: d };
}

// Shows the photosensitivity warning every time strobe is switched on.
export async function confirmStrobe() {
  const s = app.repo.settings;
  if (s.prefs.reduceMotion) {
    await dialog({ title: t('set.strobe'), body: t('set.strobeBlockedMotion'), buttons: [{ id: 'ok', label: t('common.ok'), primary: true }] });
    return false;
  }
  const r = await dialog({
    title: t('safety.photoTitle'),
    body: t('safety.photoBody', { n: MAX_STROBE_HZ }),
    buttons: [{ id: 'no', label: t('safety.photoDecline') }, { id: 'yes', label: t('safety.photoAccept'), primary: true }],
    dismissable: false,
  });
  if (r === 'yes') { await app.repo.saveSettings({ safety: { strobeAck: true } }); return true; }
  return false;
}

export function strobeActive() {
  const s = app.repo.settings;
  return s.safety.strobeEnabled && s.safety.strobeAck && !s.prefs.reduceMotion;
}

// Returns true if training may start (after any warnings the user accepted).
export async function preTrainingCheck() {
  const s = app.repo.settings;
  if (s.safety.restUntil && Date.now() < s.safety.restUntil) {
    const r = await dialog({
      title: t('train.restTitle'), body: t('train.restActive'),
      buttons: [{ id: 'no', label: t('common.back'), primary: true }, { id: 'go', label: t('train.restOverride') }],
    });
    if (r !== 'go') return false;
    await app.repo.saveSettings({ safety: { restUntil: 0 } });
  }
  const usedMin = Math.round((await app.repo.usageToday()) / 60000);
  const cap = s.safety.dailyCapMin;
  const today = new Date().toDateString();
  if (cap > 0 && usedMin >= cap && s.safety.capOverrideDate !== today) {
    const r = await dialog({
      title: t('train.capTitle'), body: t('train.capBody', { n: usedMin, cap }),
      buttons: [{ id: 'no', label: t('common.back'), primary: true }, { id: 'go', label: t('train.capOverride') }],
    });
    if (r !== 'go') return false;
    await app.repo.saveSettings({ safety: { capOverrideDate: today } });
  }
  return true;
}

export async function reportDiscomfort() {
  await app.repo.saveSettings({ safety: { restUntil: Date.now() + REST_MS, strobeEnabled: false } });
  await dialog({ title: t('train.restTitle'), body: t('train.restBody'), buttons: [{ id: 'ok', label: t('common.ok'), primary: true }] });
}
