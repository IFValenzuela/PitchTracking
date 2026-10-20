// Field geometry and physical constants. Units: feet, seconds, radians.
// Coordinates (catcher's view): x → first-base side, y → from home plate toward
// the mound (back tip of plate at y = 0), z → up from the field.

export const G = 32.174; // ft/s²
export const MPH = 5280 / 3600; // ft/s per mph
export const RPM = (2 * Math.PI) / 60; // rad/s per rpm
export const IN = 1 / 12; // ft per inch
export const DEG = Math.PI / 180;

export const BALL_RADIUS = 1.45 * IN; // 9.1 in circumference
export const BALL_DIAMETER = 2 * BALL_RADIUS;
export const BALL_MASS_LB = 5.125 / 16;

export const RUBBER_Y = 60.5; // front of rubber to back tip of plate
export const PLATE_FRONT_Y = 17 * IN; // front edge of home plate
export const PLATE_HALF_WIDTH = 8.5 * IN;
export const MOUND_HEIGHT = 10 * IN;

// Air at roughly sea level, 70 °F, 50 % humidity.
export const AIR_DENSITY_LB_FT3 = 0.0740;
export const DRAG_CD = 0.33;

// K = ½·ρ·A / m  (1/ft). Drag accel = K·Cd·|v|·v, lift accel = K·CL·|v|².
export const K_AERO = (0.5 * AIR_DENSITY_LB_FT3 * Math.PI * BALL_RADIUS ** 2) / BALL_MASS_LB;

// Mound surface height at distance y from the plate (slopes 1 in/ft from 6 in in front of the rubber).
export function moundHeightAt(y) {
  const flatFrontY = RUBBER_Y - 0.5;
  if (y >= flatFrontY) return MOUND_HEIGHT;
  return Math.max(0, MOUND_HEIGHT - (flatFrontY - y) * IN);
}
