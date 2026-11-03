// Deterministic math: only + - * / and sqrt (IEEE-754 exact) are used, so the
// results are bit-identical on every JS engine. Angles are in DEGREES
// (0 = right, 90 = down because the y axis points down).

export const PI = 3.141592653589793;
const DEG2RAD = PI / 180;
export const RAD2DEG = 180 / PI;
const HALF_PI = PI / 2;
const SQRT3 = 1.7320508075688772;
const TAN15 = 0.2679491924311227;

function sinRad(x: number): number {
  // Taylor series to x^13, |x| <= pi/2 → error < 6e-8
  const x2 = x * x;
  return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - (x2 / 110) * (1 - x2 / 156))))));
}

export function dsin(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  if (d > 270) d -= 360;
  else if (d > 90) d = 180 - d;
  return sinRad(d * DEG2RAD);
}

export function dcos(deg: number): number {
  return dsin(deg + 90);
}

function atanSeries(x: number): number {
  const x2 = x * x;
  return x * (1 - x2 * (1 / 3 - x2 * (1 / 5 - x2 * (1 / 7 - x2 * (1 / 9 - x2 * (1 / 11 - x2 * (1 / 13 - x2 / 15)))))));
}

function atanPos(a: number): number {
  let inv = false;
  if (a > 1) { a = 1 / a; inv = true; }
  let off = 0;
  if (a > TAN15) { a = (a * SQRT3 - 1) / (a + SQRT3); off = PI / 6; }
  const r = off + atanSeries(a);
  return inv ? HALF_PI - r : r;
}

/** atan2 in degrees, range (-180, 180]. */
export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  let r: number;
  if (x === 0) r = y > 0 ? HALF_PI : -HALF_PI;
  else {
    const a = atanPos(Math.abs(y / x));
    if (x > 0) r = y >= 0 ? a : -a;
    else r = y >= 0 ? PI - a : -(PI - a);
  }
  return r * RAD2DEG;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

/** Normalise an angle to (-180, 180]. */
export function normAngle(a: number): number {
  let d = a % 360;
  if (d > 180) d -= 360;
  else if (d <= -180) d += 360;
  return d;
}

/** Rotate angle `from` toward `to` by at most `maxStep` degrees. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const diff = normAngle(to - from);
  if (diff > maxStep) return from + maxStep;
  if (diff < -maxStep) return from - maxStep;
  return to;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export type Ease = 'linear' | 'inQuad' | 'outQuad' | 'inOutQuad' | 'inOutSine' | 'outBack' | 'outCubic' | 'inCubic';

export function ease(kind: Ease, t: number): number {
  switch (kind) {
    case 'linear': return t;
    case 'inQuad': return t * t;
    case 'outQuad': return t * (2 - t);
    case 'inOutQuad': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'inOutSine': return 0.5 - 0.5 * dcos(t * 180);
    case 'outCubic': { const u = 1 - t; return 1 - u * u * u; }
    case 'inCubic': return t * t * t;
    case 'outBack': { const c1 = 1.70158, c3 = c1 + 1; const u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; }
  }
}
