import type { ProfilePoint } from '../elevation/profile';
import { estimatePower } from './model';
import type { PowerParams } from './model';

/**
 * Inverso de `estimatePower`: con qué velocidad vas si ponés cierta potencia, y viceversa.
 * Se resuelve por bisección: la potencia necesaria crece con la velocidad.
 */
const MAX_SPEED = 30;
const MIN_SPEED = 0.2;

/** Velocidad (m/s) que da esa potencia en una pendiente (cociente) y con cierto viento en contra. */
export function solveSpeed(params: PowerParams, watts: number, grade: number, headwind = 0): number {
  let lo = MIN_SPEED;
  let hi = MAX_SPEED;
  if (estimatePower(params, { speed: hi, grade, headwind }) <= watts) return hi;
  if (estimatePower(params, { speed: lo, grade, headwind }) >= watts) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (estimatePower(params, { speed: mid, grade, headwind }) < watts) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Segundos que lleva recorrer un perfil poniendo siempre la misma potencia. */
export function timeForProfile(points: ProfilePoint[], altitudes: number[], params: PowerParams, watts: number): number {
  let t = 0;
  for (let i = 1; i < points.length; i++) {
    const dd = points[i].d - points[i - 1].d;
    if (dd <= 0) continue;
    const grade = Math.max(-0.25, Math.min(0.25, (altitudes[i] - altitudes[i - 1]) / dd));
    t += dd / solveSpeed(params, watts, grade);
  }
  return t;
}

/** Potencia constante que hace falta para recorrer el perfil en `targetSec` (null si no es alcanzable). */
export function powerForTime(points: ProfilePoint[], altitudes: number[], params: PowerParams, targetSec: number): number | null {
  if (points.length < 2 || targetSec <= 0) return null;
  let lo = 30;
  let hi = 1500;
  if (timeForProfile(points, altitudes, params, hi) > targetSec) return null;
  if (timeForProfile(points, altitudes, params, lo) <= targetSec) return lo;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    // Más potencia, menos tiempo.
    if (timeForProfile(points, altitudes, params, mid) > targetSec) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
