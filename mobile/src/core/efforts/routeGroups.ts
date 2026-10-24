import { haversineMeters } from '../geo/distance';
import type { BBox } from '../geo/mercator';
import type { LatLon } from '../geo/polyline';
import { routeSimilarity } from './routes';

/** Lo que hace falta de una salida para agruparla con otras que hacen el mismo camino. */
export interface RouteCandidate {
  rideId: string;
  distance: number;
  bbox: BBox;
  start: LatLon;
  end: LatLon;
  /** Traza simplificada (~10 m). */
  trace: LatLon[];
}

const DIST_TOL = 0.1;
const ENDS_M = 300;
const BBOX_OVERLAP = 0.6;

function overlapRatio(a: BBox, b: BBox): number {
  const w = Math.min(a.maxLon, b.maxLon) - Math.max(a.minLon, b.minLon);
  const h = Math.min(a.maxLat, b.maxLat) - Math.max(a.minLat, b.minLat);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const areaA = (a.maxLon - a.minLon) * (a.maxLat - a.minLat);
  const areaB = (b.maxLon - b.minLon) * (b.maxLat - b.minLat);
  const smaller = Math.min(areaA, areaB);
  // Una traza casi recta tiene área casi cero: en ese caso alcanza con que se toquen.
  return smaller <= 1e-12 ? 1 : inter / smaller;
}

/** Descarta rápido lo que no puede ser el mismo camino, antes de comparar las trazas. */
export function mayBeSameRoute(a: RouteCandidate, b: RouteCandidate): boolean {
  if (Math.abs(a.distance - b.distance) > Math.max(a.distance, b.distance) * DIST_TOL) return false;
  if (haversineMeters(a.start.lat, a.start.lon, b.start.lat, b.start.lon) > ENDS_M) return false;
  if (haversineMeters(a.end.lat, a.end.lon, b.end.lat, b.end.lon) > ENDS_M) return false;
  return overlapRatio(a.bbox, b.bbox) >= BBOX_OVERLAP;
}

/**
 * Asigna un recorrido a cada salida nueva comparándola solo con un representante de cada grupo.
 * `existing` son los representantes ya conocidos (la salida que dio nombre a cada grupo).
 * Devuelve rideId → id del recorrido (el id de su representante). Una pasada gruesa a 200 m filtra
 * antes de la comparación fina.
 */
export function assignRoutes(fresh: RouteCandidate[], existing: RouteCandidate[]): Map<string, string> {
  const reps = [...existing];
  const out = new Map<string, string>();
  for (const c of fresh) {
    let found: string | null = null;
    for (const r of reps) {
      if (!mayBeSameRoute(c, r)) continue;
      if (routeSimilarity(c.trace, r.trace, { tolerance: 200, step: 200 }) < 0.9) continue;
      if (routeSimilarity(c.trace, r.trace) >= 0.9) {
        found = r.rideId;
        break;
      }
    }
    if (found === null) {
      reps.push(c);
      found = c.rideId;
    }
    out.set(c.rideId, found);
  }
  return out;
}
