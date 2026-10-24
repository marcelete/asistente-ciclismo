import type { ProfilePoint } from '../elevation/profile';
import type { Sample } from '../types';

/**
 * Convierte el perfil guardado (un punto cada 50 m) al formato de `findSegmentEfforts`. Saltea los
 * puntos sin tiempo (perfiles de antes de la 0.4.0). Las tolerancias se ajustan a esa separación.
 */
export function profileToTrack(points: ProfilePoint[], startT: number): Sample[] {
  const out: Sample[] = [];
  for (const p of points) {
    if (p.t === null) continue;
    out.push({ t: startT + p.t * 1000, lat: p.lat, lon: p.lon, alt: p.dem ?? p.gps, speed: null, hr: p.hr, acc: null });
  }
  return out;
}

/** Tolerancias para puntos cada 50 m. */
export const PROFILE_SEGMENT_OPTIONS = { tolerance: 35, endpointSlack: 45, backtrack: 35 };
