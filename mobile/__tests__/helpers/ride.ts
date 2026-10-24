import type { ProfilePoint } from '../../src/core/elevation/profile';
import type { RideRecord } from '../../src/core/stats/rides';

/** Fecha local: los tests no dependen de la zona horaria de la máquina. */
export const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();

/** Una salida de 20 km y una hora, con lo que haga falta cambiado. */
export function makeRide(t: number, over: Partial<RideRecord> = {}): RideRecord {
  return {
    id: `gpx:${t}`,
    fileName: 'x.gpx',
    startT: t,
    endT: t + 3600_000,
    distance: 20000,
    elapsedSec: 3600,
    movingSec: 3000,
    elevationGain: 200,
    elevationLoss: 190,
    maxAltitude: 300,
    minAltitude: 100,
    maxSpeed: 12,
    dem: null,
    name: null,
    activityType: null,
    avgHr: null,
    maxHr: null,
    hrHist: null,
    efforts: null,
    analysis: 1,
    ...over,
  };
}

/** Un punto de perfil con lo mínimo; lo demás en null. */
export function point(d: number, over: Partial<ProfilePoint> = {}): ProfilePoint {
  return { d, lat: -34.6, lon: -58.4, gps: null, dem: null, t: null, hr: null, ...over };
}
