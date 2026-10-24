import type { ProfilePoint } from '../core/elevation/profile';

/**
 * Puntos guardados como arreglos [d, lat, lon, gps, dem, t, hr] para que el JSON ocupe poco. Los
 * perfiles guardados antes de la 0.4.0 tienen solo los 5 primeros (sin tiempo ni FC).
 */
export type PackedPoint = [number, number, number, number | null, number | null, number | null, number | null];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);

const round = (n: number | null, k: number) => (n === null ? null : Math.round(n * k) / k);

/** Redondea cada campo a la precisión que hace falta: ~1 m en la posición, 0,1 m en la altitud. */
export function packProfile(points: ProfilePoint[]): PackedPoint[] {
  return points.map((p) => [
    Math.round(p.d),
    round(p.lat, 1e5)!,
    round(p.lon, 1e5)!,
    round(p.gps, 10),
    round(p.dem, 10),
    round(p.t, 1),
    round(p.hr, 1),
  ]);
}

/** Valida el JSON guardado: un perfil dañado se trata como si no existiera, en vez de romper la pantalla. */
export function unpackProfile(json: string): ProfilePoint[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const out: ProfilePoint[] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || (p.length !== 5 && p.length !== 7)) return null;
    const [d, lat, lon, gps, dem, t = null, hr = null] = p as unknown[];
    if (!isNum(d) || !isNum(lat) || !isNum(lon) || !isNumOrNull(gps) || !isNumOrNull(dem)) return null;
    if (!isNumOrNull(t) || !isNumOrNull(hr)) return null;
    out.push({
      d,
      lat,
      lon,
      gps: gps as number | null,
      dem: dem as number | null,
      t: t as number | null,
      hr: hr as number | null,
    });
  }
  return out;
}

/** El perfil tiene el formato actual (con el tiempo de cada punto). */
export function hasTiming(points: ProfilePoint[]): boolean {
  return points.length > 0 && points.every((p) => p.t !== null);
}
