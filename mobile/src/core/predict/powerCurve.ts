import { altitudeSeries, airDensityAt } from '../analysis/profileMetrics';
import type { ProfilePoint } from '../elevation/profile';
import { estimatePower } from '../power/model';
import type { PowerParams } from '../power/model';

/** Duraciones de la curva de potencia estimada, en segundos (5, 10, 20 y 60 min). */
export const POWER_DURATIONS_SEC = [300, 600, 1200, 3600] as const;

const STEP = 10;
const MOVING_MIN = 1.0;
const MAX_SPEED = 28;

/**
 * Potencia estimada de la salida, una muestra cada 10 s (los tramos sin pedalear cuentan 0 y las
 * paradas se saltean). Usa el modelo físico; no hay medidor de potencia.
 */
export function powerSeries(points: ProfilePoint[], base: Omit<PowerParams, 'rho'>): number[] {
  const alt = altitudeSeries(points);
  const altitudes = alt?.values ?? points.map(() => 0);
  const out: number[] = [];
  let acc = 0;
  let accT = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.t === null || b.t === null) continue;
    const dd = b.d - a.d;
    const dt = b.t - a.t;
    if (dd <= 0 || dt <= 0) continue;
    const v = dd / dt;
    // Una parada larga corta la ventana: la potencia de 20 min tiene que ser de 20 min seguidos.
    if (v < MOVING_MIN || v > MAX_SPEED) {
      acc = 0;
      accT = 0;
      continue;
    }
    const grade = Math.max(-0.25, Math.min(0.25, (altitudes[i] - altitudes[i - 1]) / dd));
    const w = estimatePower({ ...base, rho: airDensityAt(altitudes[i]) }, { speed: v, grade });
    acc += w * dt;
    accT += dt;
    while (accT >= STEP) {
      out.push(acc / accT);
      acc = 0;
      accT = 0;
    }
  }
  return out;
}

/** Mejor promedio de una ventana de `windowSec` sobre una serie de 10 s. */
export function bestAverage(series: number[], windowSec: number): number | null {
  const n = Math.round(windowSec / STEP);
  if (series.length < n || n <= 0) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += series[i];
  let best = sum;
  for (let i = n; i < series.length; i++) {
    sum += series[i] - series[i - n];
    if (sum > best) best = sum;
  }
  return best / n;
}

export interface PowerCurvePoint {
  durationSec: number;
  watts: number;
}

/** Mejor potencia estimada de cada duración entre varias salidas (por ejemplo, los últimos 90 días). */
export function powerCurve(seriesList: number[][]): PowerCurvePoint[] {
  const out: PowerCurvePoint[] = [];
  for (const d of POWER_DURATIONS_SEC) {
    let best: number | null = null;
    for (const s of seriesList) {
      const v = bestAverage(s, d);
      if (v !== null && (best === null || v > best)) best = v;
    }
    if (best !== null && best > 0) out.push({ durationSec: d, watts: Math.round(best) });
  }
  return out;
}
