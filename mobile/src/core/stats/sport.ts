import type { RideRecord } from './rides';

/**
 * Solo cuentan las salidas en bici. OpenTracks guarda el tipo de actividad como texto libre en
 * el idioma del grabador ("Ciclismo", "Cycling", "Bicicleta de montaña"…).
 */
export type Sport = 'bike' | 'other' | 'unknown';

const BIKE_WORDS = ['bici', 'cicl', 'bike', 'biking', 'cycl', 'ride', 'mtb', 'gravel', 'bmx'];
/** Se descartan antes que las de bici: "motor bike" y "scooter" no son salidas en bici. */
const NOT_BIKE_WORDS = ['moto', 'motor', 'scooter', 'patinete', 'driv'];

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
  return BIKE_WORDS.some((w) => t.includes(w)) ? 'bike' : 'other';
}

/**
 * La salida cuenta como salida en bici: lo decide el interruptor del detalle si lo tocaste y, si
 * no, el tipo. Sin tipo (o "desconocido") cuenta: la app es de ciclismo y OpenTracks lo deja así
 * cuando no elegiste uno.
 */
export function countsAsRide(r: Pick<RideRecord, 'activityType' | 'countedOverride'>): boolean {
  if (r.countedOverride === 1) return true;
  if (r.countedOverride === 0) return false;
  return classifySport(r.activityType) !== 'other';
}
