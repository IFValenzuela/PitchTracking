// Shared bits for drills.
import { t } from '../../../i18n/i18n.js';
import { lerpLevel } from '../../../engine/staircase.js';

export const MAXL = 20;
export const L = (level, a, b) => lerpLevel(level, MAXL, a, b);
// Log-spaced interpolation (for contrast, disparity, durations spanning decades).
export const LL = (level, a, b) => Math.exp(lerpLevel(level, MAXL, Math.log(a), Math.log(b)));

// Four direction buttons for Landolt-C style answers. ids: '0' right, '1' up, '2' left, '3' down.
export function directionButtons() {
  return [
    { id: '2', label: '←', aria: t('dir.left'), key: ['ArrowLeft', 'a'] },
    { id: '1', label: '↑', aria: t('dir.up'), key: ['ArrowUp', 'w'] },
    { id: '3', label: '↓', aria: t('dir.down'), key: ['ArrowDown', 's'] },
    { id: '0', label: '→', aria: t('dir.right'), key: ['ArrowRight', 'd'] },
  ];
}

export const isTapKey = (e) => e.key === ' ' || e.key === 'Enter';
