export interface HrProfile {
  hrMax: number;
  hrRest: number;
  /** Frecuencia cardíaca de umbral, si se conoce. */
  hrThreshold?: number;
  sex: 'male' | 'female';
}

/** Reserva de FC (Karvonen) normalizada: 0 en reposo, 1 en el máximo. */
export function hrReserveFraction(hr: number, p: HrProfile): number {
  const f = (hr - p.hrRest) / (p.hrMax - p.hrRest);
  return Math.min(1, Math.max(0, f));
}

/** Límites inferiores de las zonas 1 a 5 como fracción de la reserva de FC. */
export const ZONE_LOWER_BOUNDS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/** Zona de FC de 0 (por debajo de la zona 1) a 5. */
export function hrZone(hr: number, p: HrProfile): 0 | 1 | 2 | 3 | 4 | 5 {
  const f = (hr - p.hrRest) / (p.hrMax - p.hrRest);
  let zone = 0;
  for (let i = 0; i < ZONE_LOWER_BOUNDS.length; i++) if (f >= ZONE_LOWER_BOUNDS[i]) zone = i + 1;
  return zone as 0 | 1 | 2 | 3 | 4 | 5;
}

/** Límites de las zonas en latidos por minuto: [{zone, min, max}]. */
export function hrZoneRanges(p: HrProfile): { zone: number; min: number; max: number }[] {
  const bpm = (f: number) => Math.round(p.hrRest + f * (p.hrMax - p.hrRest));
  const bounds = [...ZONE_LOWER_BOUNDS, 1];
  return ZONE_LOWER_BOUNDS.map((_, i) => ({ zone: i + 1, min: bpm(bounds[i]), max: bpm(bounds[i + 1]) }));
}

/** Coeficiente de ponderación de Banister según sexo. */
function banisterB(sex: 'male' | 'female'): number {
  return sex === 'male' ? 1.92 : 1.67;
}

/** TRIMP de Banister para un tramo de `minutes` minutos a frecuencia cardíaca constante. */
export function trimpSegment(hr: number, minutes: number, p: HrProfile): number {
  const x = hrReserveFraction(hr, p);
  return minutes * x * 0.64 * Math.exp(banisterB(p.sex) * x);
}

/** TRIMP acumulado de una serie de FC con muestras `dtSec` segundos separadas. */
export function trimpFromSeries(hrs: (number | null)[], dtSec: number, p: HrProfile): number {
  let total = 0;
  for (const hr of hrs) {
    if (hr === null || hr <= 0) continue;
    total += trimpSegment(hr, dtSec / 60, p);
  }
  return total;
}

/**
 * hrTSS: TRIMP normalizado para que una hora a la FC de umbral valga 100 puntos.
 * Si no se conoce el umbral, se asume el 85 % de la reserva de FC.
 */
export function hrTss(trimp: number, p: HrProfile): number {
  const thr = p.hrThreshold ?? p.hrRest + 0.85 * (p.hrMax - p.hrRest);
  const oneHourAtThreshold = trimpSegment(thr, 60, p);
  return (trimp / oneHourAtThreshold) * 100;
}
