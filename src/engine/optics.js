// Screen geometry: converts between CSS pixels, centimetres and visual angle,
// using the calibrated pixel density and viewing distance.

const DEG = Math.PI / 180;

export const CARD_WIDTH_CM = 8.56; // ISO/IEC 7810 ID-1 card
export const CARD_HEIGHT_CM = 5.398;

// Visual angle (degrees) subtended by `cm` centred on the line of sight.
export function cmToDeg(cm, viewDistCm) { return (2 * Math.atan(cm / 2 / viewDistCm)) / DEG; }

export function degToCm(deg, viewDistCm) { return 2 * viewDistCm * Math.tan((deg * DEG) / 2); }

// Pixels per degree near the screen centre.
export function pxPerDeg(pxPerCm, viewDistCm) { return pxPerCm * degToCm(1, viewDistCm); }

export function degToPx(deg, cal) { return degToCm(deg, cal.viewDistCm) * cal.pxPerCm; }

// Field of view (degrees) of a viewport of the given CSS size.
export function screenFov(cssW, cssH, cal) {
  return {
    hDeg: cmToDeg(cssW / cal.pxPerCm, cal.viewDistCm),
    vDeg: cmToDeg(cssH / cal.pxPerCm, cal.viewDistCm),
  };
}

// Angular diameter (deg) of a ball of `diameterFt` at `distanceFt`.
export function ballAngularDeg(diameterFt, distanceFt) { return (2 * Math.atan(diameterFt / 2 / distanceFt)) / DEG; }
