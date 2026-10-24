import { findSegmentEfforts } from '../core/efforts/segments';
import { assignRoutes } from '../core/efforts/routeGroups';
import type { RouteCandidate } from '../core/efforts/routeGroups';
import { PROFILE_SEGMENT_OPTIONS, profileToTrack } from '../core/efforts/trackAdapter';
import type { ProfilePoint } from '../core/elevation/profile';
import { decodePolyline } from '../core/geo/polylineCodec';
import { loadProfile, loadRides } from '../data/db';
import { loadRideGeo } from '../data/dbGeo';
import {
  loadSegment,
  pendingScans,
  ridesWithoutRoute,
  routeRepresentativeIds,
  saveScan,
  saveSegment,
  setRoutes,
} from '../data/dbSegments';
import type { SegmentRow } from '../data/dbSegments';
import { packProfile, unpackProfile } from '../data/profileCodec';
import { log } from './log';

/** Largo permitido de un segmento. */
export const SEGMENT_MIN_M = 300;
export const SEGMENT_MAX_M = 50_000;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Arma un segmento desde un tramo del perfil de una salida (por ejemplo, una subida). */
export function segmentFromProfile(name: string, points: ProfilePoint[], rideId: string, now: number = Date.now()): SegmentRow | null {
  if (points.length < 2) return null;
  const d0 = points[0].d;
  const rebased = points.map((p) => ({ ...p, d: p.d - d0, t: null, hr: null }));
  const length = rebased[rebased.length - 1].d;
  if (length < SEGMENT_MIN_M || length > SEGMENT_MAX_M) return null;
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const p of rebased) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return {
    id: `seg-${now}`,
    name: name.trim().slice(0, 80) || 'Segmento',
    points: JSON.stringify(packProfile(rebased)),
    length,
    bbox: [minLat, minLon, maxLat, maxLon],
    createdT: now,
    sourceRide: rideId,
  };
}

/** Compara una salida con un segmento y guarda sus pasadas. */
async function scan(segment: SegmentRow, rideId: string, startT: number): Promise<number> {
  const profile = loadProfile(rideId);
  const seg = unpackProfile(segment.points);
  if (!profile || !seg) {
    await saveScan(segment.id, rideId, []);
    return 0;
  }
  const efforts = findSegmentEfforts(
    profileToTrack(profile, startT),
    { id: segment.id, name: segment.name, points: seg.map((p) => ({ lat: p.lat, lon: p.lon })) },
    PROFILE_SEGMENT_OPTIONS,
  );
  await saveScan(
    segment.id,
    rideId,
    efforts.map((e) => ({ segmentId: segment.id, rideId, startT: e.startT, duration: e.durationSec, speed: e.avgSpeed, avgHr: e.avgHr })),
  );
  return efforts.length;
}

/** Guarda un segmento nuevo y lo compara con las salidas cuya caja lo toca. */
export async function createSegment(segment: SegmentRow): Promise<void> {
  await saveSegment(segment);
  await scanPending();
}

/** Compara todo lo que falta: segmentos nuevos con salidas viejas y salidas nuevas con segmentos. */
export async function scanPending(): Promise<number> {
  const pairs = pendingScans();
  if (pairs.length === 0) return 0;
  const starts = new Map(loadRides().map((r) => [r.id, r.startT] as const));
  const segments = new Map<string, SegmentRow>();
  let found = 0;
  let n = 0;
  for (const p of pairs) {
    let seg = segments.get(p.segmentId);
    if (!seg) {
      const loaded = loadSegment(p.segmentId);
      if (!loaded) continue;
      seg = loaded;
      segments.set(p.segmentId, seg);
    }
    const startT = starts.get(p.rideId);
    if (startT === undefined) continue;
    found += await scan(seg, p.rideId, startT);
    if (++n % 10 === 0) await tick();
  }
  if (n > 0) log('info', 'segments', `Se compararon ${n} par(es) segmento-salida, ${found} pasada(s)`);
  return found;
}

function candidate(rideId: string, distance: number): RouteCandidate | null {
  const geo = loadRideGeo(rideId);
  if (!geo) return null;
  return {
    rideId,
    distance,
    bbox: geo.bbox,
    start: geo.start,
    end: geo.end,
    trace: decodePolyline(geo.trace).map(([lat, lon]) => ({ lat, lon })),
  };
}

/** Asigna el recorrido equivalente de las salidas que todavía no lo tienen. */
export async function assignPendingRoutes(): Promise<number> {
  const ids = ridesWithoutRoute();
  if (ids.length === 0) return 0;
  const dist = new Map(loadRides().map((r) => [r.id, r.distance] as const));
  const startOf = new Map(loadRides().map((r) => [r.id, r.startT] as const));
  const fresh = ids
    .sort((a, b) => (startOf.get(a) ?? 0) - (startOf.get(b) ?? 0))
    .map((id) => candidate(id, dist.get(id) ?? 0))
    .filter((c): c is RouteCandidate => c !== null);
  const existing = routeRepresentativeIds()
    .map((id) => candidate(id, dist.get(id) ?? 0))
    .filter((c): c is RouteCandidate => c !== null);
  await tick();
  const map = assignRoutes(fresh, existing);
  await setRoutes(map);
  log('info', 'segments', `Se asignó el recorrido de ${map.size} salida(s)`);
  return map.size;
}

