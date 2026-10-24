import type { ProfilePoint } from './profile';

/** Metros del inicio y del final de cada salida que nunca salen del celular (suelen ser tu casa). */
export const PRIVACY_ZONE_M = 300;

/** Decimales de las coordenadas enviadas: 4 son ~11 m, de sobra para un modelo de 90 m. */
export const SENT_DECIMALS = 4;

/** Índices de los puntos que se pueden consultar afuera: los que no caen en la zona privada. */
export function shareableIndices(points: ProfilePoint[], zoneM = PRIVACY_ZONE_M): number[] {
  if (points.length === 0) return [];
  const total = points[points.length - 1].d;
  const out: number[] = [];
  points.forEach((p, i) => {
    if (p.d >= zoneM && p.d <= total - zoneM) out.push(i);
  });
  return out;
}

/**
 * Completa la altitud del mapa en la zona privada sin haberla consultado: sigue la forma de la
 * altitud del GPS, corrida para empalmar con el primer (o último) punto del mapa; si el GPS no
 * tiene altitud, la repite plana. Si no se consultó ningún punto (salida muy corta), usa el GPS tal cual.
 */
export function fillPrivacyZone(points: ProfilePoint[]): ProfilePoint[] {
  const known = points.map((p, i) => (p.dem !== null ? i : -1)).filter((i) => i >= 0);
  if (known.length === 0) return points.map((p) => ({ ...p, dem: p.gps }));
  const first = known[0];
  const last = known[known.length - 1];
  const fill = (p: ProfilePoint, ref: ProfilePoint): number =>
    p.gps !== null && ref.gps !== null ? ref.dem! + (p.gps - ref.gps) : ref.dem!;
  return points.map((p, i) => {
    if (p.dem !== null) return p;
    if (i < first) return { ...p, dem: fill(p, points[first]) };
    if (i > last) return { ...p, dem: fill(p, points[last]) };
    return p;
  });
}
