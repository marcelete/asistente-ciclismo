import { fastestDistances } from '../efforts/distanceEfforts';
import { buildProfile } from '../elevation/profile';
import type { ProfilePoint } from '../elevation/profile';
import { LiveStats } from '../live/LiveStats';
import { classifySport } from '../stats/sport';
import { customName, rideFromSummary } from '../stats/rides';
import type { RideRecord } from '../stats/rides';
import type { Sample } from '../types';

/**
 * Versión del análisis de cada salida. Al subirla, las salidas guardadas con una versión anterior
 * se recalculan solas releyendo su GPX (por ejemplo, para sumar la FC o los mejores tiempos).
 */
export const ANALYSIS_VERSION = 2;
// 2 (pedido 15): mejores tiempos de correr (400 m, milla, media y maratón) y cadencia media.

export interface ActivityInput {
  id: string;
  fileName: string;
  startT: number;
  endT: number;
  samples: Sample[];
  name: string | null;
  activityType: string | null;
}

export interface RideAnalysis {
  record: RideRecord;
  /** Un punto cada 50 m con altitud, tiempo y FC. */
  profile: ProfilePoint[];
}

/**
 * Todo lo que se calcula de una salida al importarla. Las muestras pasan por el mismo acumulador
 * que la pantalla en vivo, así los números coinciden.
 */
export function analyzeActivity(a: ActivityInput): RideAnalysis {
  const live = new LiveStats();
  for (const s of a.samples) live.push(s);
  const profile = buildProfile(a.samples);
  const efforts = fastestDistances(profile);
  const record = rideFromSummary(a, live.snapshot(), {
    name: customName(a.name),
    activityType: a.activityType,
    hrHist: live.hrHistogram(),
    efforts: Object.keys(efforts).length > 0 ? efforts : null,
    analysis: ANALYSIS_VERSION,
    avgCadence: averageCadence(a.samples, classifySport(a.activityType) === 'run'),
  });
  return { record, profile };
}

/**
 * Cadencia media de los puntos en movimiento (más de 1 m/s) que la traen. Al correr, algunos
 * sensores informan los pasos de un solo pie (80 a 100): se duplican para que sean pasos por minuto.
 */
export function averageCadence(samples: Sample[], run: boolean): number | null {
  let sum = 0;
  let n = 0;
  for (const s of samples) {
    if (s.cad === null || s.cad === undefined || !(s.cad > 0) || s.cad > 260) continue;
    if (s.speed !== null && s.speed < 1) continue;
    sum += s.cad;
    n++;
  }
  if (n < 10) return null;
  const avg = sum / n;
  return Math.round(run && avg < 120 ? avg * 2 : avg);
}
