import { fastestDistances } from '../efforts/distanceEfforts';
import { buildProfile } from '../elevation/profile';
import type { ProfilePoint } from '../elevation/profile';
import { LiveStats } from '../live/LiveStats';
import { customName, rideFromSummary } from '../stats/rides';
import type { RideRecord } from '../stats/rides';
import type { Sample } from '../types';

/**
 * Versión del análisis de cada salida. Al subirla, las salidas guardadas con una versión anterior
 * se recalculan solas releyendo su GPX (por ejemplo, para sumar la FC o los mejores tiempos).
 */
export const ANALYSIS_VERSION = 1;

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
  });
  return { record, profile };
}
