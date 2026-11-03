import { RUN_EFFORT_DISTANCES_M } from '../efforts/distanceEfforts';

/**
 * Correr: la velocidad de umbral (la que sostenés más o menos una hora) sale de lo que haya
 * (pedido 15): una marca que cargaste, el test de 30 minutos o tus mejores tiempos recientes. Con
 * eso se arman los ritmos de cada zona; sin nada, las sesiones van por FC o por esfuerzo percibido.
 */

/** Exponente de Riegel: cuánto se enlentece el ritmo al alargar la distancia. */
export const RIEGEL_EXPONENT = 1.06;

/** Tiempo (s) para otra distancia con la fórmula de Riegel. */
export function riegelTime(km: number, sec: number, toKm: number): number {
  return sec * (toKm / km) ** RIEGEL_EXPONENT;
}

/**
 * Velocidad de umbral (km/h) a partir de una marca: la distancia que, con Riegel, se cubriría en
 * una hora. Ej.: 10 km en 50 min dan unos 11,9 km/h (5:03 por km).
 */
export function thresholdFromEffort(km: number, sec: number): number | null {
  if (!(km > 0) || !(sec > 0)) return null;
  const kmInHour = km * (3600 / sec) ** (1 / RIEGEL_EXPONENT);
  return Math.round(kmInHour * 100) / 100;
}

export type ThresholdSource = 'race' | 'test' | 'history';

export interface RunThreshold {
  kmh: number;
  source: ThresholdSource;
  /** Fecha (ms) del dato de origen. */
  t: number;
  /** Texto corto de dónde salió ("tu marca de 10 km", "el test del 03/11"). */
  detail: string;
}

export interface RunLevelInput {
  now: number;
  /** Marca cargada en los ajustes. */
  race: { km: number; sec: number; t: number } | null;
  /** Tests de 30 minutos hechos: velocidad media del bloque de test (km/h). */
  tests: { t: number; avgKmh: number }[];
  /** Carreras con sus mejores tiempos (metros → segundos). */
  runs: { startT: number; efforts: Record<number, number> | null }[];
}

const DAY_MS = 86_400_000;
/** Una marca o un test viejos dejan de valer: el nivel cambia. */
export const RACE_VALID_DAYS = 180;
export const TEST_VALID_DAYS = 120;
export const HISTORY_DAYS = 90;
/** Los mejores tiempos de menos de 1 km dicen más de la velocidad que del umbral: no se usan. */
const MIN_HISTORY_DISTANCE = 1000;

const fmtDate = (t: number) => {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const kmText = (km: number) => {
  if (Math.abs(km - 21.1) < 0.1) return 'media maratón';
  if (Math.abs(km - 42.2) < 0.1) return 'maratón';
  return `${String(Math.round(km * 10) / 10).replace('.', ',')} km`;
};

/**
 * El umbral de correr con lo que haya. La marca y el test valen más que el historial porque se
 * hicieron a fondo: entre los dos, gana el más nuevo. Si no hay ninguno vigente, el mejor valor
 * de las carreras de los últimos 90 días (los entrenamientos suaves lo subestiman, nunca lo inflan).
 */
export function runThreshold(i: RunLevelInput): RunThreshold | null {
  const candidates: RunThreshold[] = [];
  if (i.race && i.now - i.race.t <= RACE_VALID_DAYS * DAY_MS) {
    const kmh = thresholdFromEffort(i.race.km, i.race.sec);
    if (kmh) candidates.push({ kmh, source: 'race', t: i.race.t, detail: `tu marca de ${kmText(i.race.km)}` });
  }
  for (const test of i.tests) {
    if (i.now - test.t > TEST_VALID_DAYS * DAY_MS || !(test.avgKmh > 0)) continue;
    const kmh = thresholdFromEffort(test.avgKmh / 2, 1800);
    if (kmh) candidates.push({ kmh, source: 'test', t: test.t, detail: `el test de 30 minutos del ${fmtDate(test.t)}` });
  }
  if (candidates.length > 0) return candidates.reduce((a, b) => (b.t > a.t ? b : a));

  let best: RunThreshold | null = null;
  for (const r of i.runs) {
    if (i.now - r.startT > HISTORY_DAYS * DAY_MS || r.startT > i.now || !r.efforts) continue;
    for (const d of RUN_EFFORT_DISTANCES_M) {
      const sec = r.efforts[d];
      if (d < MIN_HISTORY_DISTANCE || !sec) continue;
      const kmh = thresholdFromEffort(d / 1000, sec);
      if (kmh && (!best || kmh > best.kmh)) best = { kmh, source: 'history', t: r.startT, detail: `tus ${kmText(d / 1000)} del ${fmtDate(r.startT)}` };
    }
  }
  return best;
}

/** Ritmo (s/km) de una velocidad en km/h. */
export const paceSec = (kmh: number) => 3600 / kmh;

/** Una velocidad de umbral creíble para una persona: entre 15:00 y 2:40 por km. */
export const isPlausibleThreshold = (kmh: number) => kmh >= 4 && kmh <= 22.5;
