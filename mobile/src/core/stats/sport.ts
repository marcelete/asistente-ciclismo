import type { RideRecord } from './rides';

/**
 * Cuentan las salidas en bici y las de correr, cada deporte por su lado (pedido 15). OpenTracks
 * guarda el tipo de actividad como texto libre en el idioma del grabador ("Ciclismo", "Cycling",
 * "Correr", "trail running"…).
 */
export type Sport = 'bike' | 'run' | 'other' | 'unknown';

/** Los deportes que cuentan y que entrena la app. */
export type TrainSport = 'bike' | 'run';

export const TRAIN_SPORTS: readonly TrainSport[] = ['bike', 'run'];

const BIKE_WORDS = ['bici', 'cicl', 'bike', 'biking', 'cycl', 'ride', 'mtb', 'gravel', 'bmx'];
/** Se descartan antes que las de bici: "motor bike" y "scooter" no son salidas en bici. */
const NOT_BIKE_WORDS = ['moto', 'motor', 'scooter', 'patinete', 'driv'];
/** Correr: se miran después de la bici, así "trail biking" sigue siendo bici. */
const RUN_WORDS = ['run', 'corr', 'trot', 'jog', 'footing', 'carrera a pie', 'maraton', 'marathon'];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** Qué deporte es, según el tipo de actividad del grabador. */
export function classifySport(activityType: string | null | undefined): Sport {
  if (activityType === null || activityType === undefined) return 'unknown';
  const t = normalize(activityType);
  if (t === '' || t === 'desconocido' || t === 'unknown') return 'unknown';
  if (NOT_BIKE_WORDS.some((w) => t.includes(w))) return 'other';
  if (BIKE_WORDS.some((w) => t.includes(w))) return 'bike';
  return RUN_WORDS.some((w) => t.includes(w)) ? 'run' : 'other';
}

/**
 * Lo que elegiste en el detalle de la salida (`counted_override`): 0 no cuenta, 1 bici, 2 correr.
 * Los respaldos y las bases de antes del pedido 15 solo tienen 0 y 1, que significan lo mismo.
 */
export type SportOverride = 0 | 1 | 2;

export function sanitizeOverride(v: unknown): SportOverride | null {
  return v === 0 || v === 1 || v === 2 ? v : null;
}

export function overrideFor(sport: TrainSport | 'none'): SportOverride {
  return sport === 'none' ? 0 : sport === 'bike' ? 1 : 2;
}

/**
 * Deporte con que cuenta la salida: lo decide el selector del detalle si lo tocaste y, si no, el
 * tipo. Sin tipo (o "desconocido") cuenta como bici, como antes: OpenTracks lo deja así cuando no
 * elegiste uno. `null`: no cuenta (caminatas y otras).
 */
export function sportOf(r: Pick<RideRecord, 'activityType' | 'countedOverride'>): TrainSport | null {
  if (r.countedOverride === 0) return null;
  if (r.countedOverride === 1) return 'bike';
  if (r.countedOverride === 2) return 'run';
  const s = classifySport(r.activityType);
  return s === 'run' ? 'run' : s === 'other' ? null : 'bike';
}

/** La salida cuenta (en bici o corriendo). */
export function countsAsRide(r: Pick<RideRecord, 'activityType' | 'countedOverride'>): boolean {
  return sportOf(r) !== null;
}

export function isSport(sport: TrainSport) {
  return (r: Pick<RideRecord, 'activityType' | 'countedOverride'>): boolean => sportOf(r) === sport;
}

export function sanitizeSport(v: unknown, fallback: TrainSport = 'bike'): TrainSport {
  return v === 'bike' || v === 'run' ? v : fallback;
}

/** Palabras que cambian según el deporte. */
export const SPORT_WORDS: Record<TrainSport, { name: string; activity: string; activities: string; icon: 'directions_bike' | 'directions_run' }> = {
  bike: { name: 'Bici', activity: 'salida', activities: 'salidas', icon: 'directions_bike' },
  run: { name: 'Correr', activity: 'carrera', activities: 'carreras', icon: 'directions_run' },
};
