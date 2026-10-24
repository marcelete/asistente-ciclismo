import { haversineMeters } from './distance';
import { PRIVACY_ZONE_M } from '../elevation/privacy';
import type { ProfilePoint } from '../elevation/profile';
import type { BBox } from './mercator';
import { encodePolyline } from './polylineCodec';
import { simplifyIndices } from './simplify';

/** Lo que se guarda de la geografía de cada salida (tabla ride_geo). */
export interface RideGeo {
  rideId: string;
  bbox: BBox;
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
  /** Polilínea codificada simplificada a ~10 m. */
  trace: string;
  routeId: string | null;
}

const TOLERANCE_M = 10;

/** Puntos del perfil sin las puntas (zona privada), si se pide. */
export function trimEnds(points: ProfilePoint[], hide: boolean, zoneM = PRIVACY_ZONE_M): ProfilePoint[] {
  if (!hide || points.length === 0) return points;
  const total = points[points.length - 1].d;
  return points.filter((p) => p.d >= zoneM && p.d <= total - zoneM);
}

/** Traza simplificada [lat, lon][] a partir de puntos del perfil. */
export function simplifiedTrace(points: ProfilePoint[], toleranceM = TOLERANCE_M): [number, number][] {
  if (points.length === 0) return [];
  const lat0 = points[0].lat;
  const kLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => (p.lon - points[0].lon) * kLon);
  const ys = points.map((p) => (p.lat - lat0) * 110574);
  return simplifyIndices(xs, ys, toleranceM).map((i) => [points[i].lat, points[i].lon]);
}

export function buildRideGeo(rideId: string, points: ProfilePoint[]): RideGeo | null {
  if (points.length < 2) return null;
  const trace = simplifiedTrace(points);
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  const a = points[0];
  const b = points[points.length - 1];
  return {
    rideId,
    bbox: { minLat, minLon, maxLat, maxLon },
    start: { lat: a.lat, lon: a.lon },
    end: { lat: b.lat, lon: b.lon },
    trace: encodePolyline(trace),
    routeId: null,
  };
}

/** Saca `m` metros de cada punta de una traza (para ocultar inicio y final en los mapas). */
export function trimTraceEnds(trace: [number, number][], m: number): [number, number][] {
  if (trace.length < 2) return trace;
  const cum = [0];
  for (let i = 1; i < trace.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(trace[i - 1][0], trace[i - 1][1], trace[i][0], trace[i][1]));
  }
  const total = cum[cum.length - 1];
  if (total <= m * 2) return [];
  return trace.filter((_, i) => cum[i] >= m && cum[i] <= total - m);
}
