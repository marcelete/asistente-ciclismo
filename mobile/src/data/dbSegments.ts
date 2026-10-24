import { conn } from './db';

/** Segmentos personales, tus pasadas por ellos y qué salidas ya se compararon con cada uno. */

export interface SegmentRow {
  id: string;
  name: string;
  /** Texto JSON con los puntos empaquetados (el mismo formato que el perfil de altitud). */
  points: string;
  length: number;
  bbox: [number, number, number, number];
  createdT: number;
  sourceRide: string | null;
}

export interface EffortRow {
  segmentId: string;
  rideId: string;
  startT: number;
  duration: number;
  speed: number;
  avgHr: number | null;
}

interface RawSegment {
  id: string;
  name: string;
  points: string;
  length: number;
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
  created_t: number;
  source_ride: string | null;
}

const toSegment = (r: RawSegment): SegmentRow => ({
  id: r.id,
  name: r.name,
  points: r.points,
  length: r.length,
  bbox: [r.min_lat, r.min_lon, r.max_lat, r.max_lon],
  createdT: r.created_t,
  sourceRide: r.source_ride,
});

export function loadSegments(): SegmentRow[] {
  return conn().getAllSync<RawSegment>('SELECT * FROM segments ORDER BY created_t DESC').map(toSegment);
}

export function loadSegment(id: string): SegmentRow | null {
  const r = conn().getFirstSync<RawSegment>('SELECT * FROM segments WHERE id = ?', [id]);
  return r ? toSegment(r) : null;
}

export async function saveSegment(s: SegmentRow): Promise<void> {
  await conn().runAsync(
    'INSERT OR REPLACE INTO segments (id, name, points, length, min_lat, min_lon, max_lat, max_lon, created_t, source_ride) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [s.id, s.name, s.points, s.length, s.bbox[0], s.bbox[1], s.bbox[2], s.bbox[3], s.createdT, s.sourceRide],
  );
}

export async function deleteSegment(id: string): Promise<void> {
  const d = conn();
  d.withTransactionSync(() => {
    d.runSync('DELETE FROM segment_efforts WHERE segment_id = ?', [id]);
    d.runSync('DELETE FROM segment_scans WHERE segment_id = ?', [id]);
    d.runSync('DELETE FROM segments WHERE id = ?', [id]);
  });
}

export async function renameSegment(id: string, name: string): Promise<void> {
  await conn().runAsync('UPDATE segments SET name = ? WHERE id = ?', [name, id]);
}

interface RawEffort {
  segment_id: string;
  ride_id: string;
  start_t: number;
  duration: number;
  speed: number;
  avg_hr: number | null;
}

const toEffort = (e: RawEffort): EffortRow => ({
  segmentId: e.segment_id,
  rideId: e.ride_id,
  startT: e.start_t,
  duration: e.duration,
  speed: e.speed,
  avgHr: e.avg_hr,
});

export function loadEfforts(segmentId?: string): EffortRow[] {
  const rows = segmentId
    ? conn().getAllSync<RawEffort>('SELECT * FROM segment_efforts WHERE segment_id = ? ORDER BY start_t', [segmentId])
    : conn().getAllSync<RawEffort>('SELECT * FROM segment_efforts ORDER BY start_t');
  return rows.map(toEffort);
}

export function loadEffortsOfRide(rideId: string): EffortRow[] {
  return conn().getAllSync<RawEffort>('SELECT * FROM segment_efforts WHERE ride_id = ? ORDER BY start_t', [rideId]).map(toEffort);
}

/** Guarda las pasadas de una salida por un segmento y marca la salida como ya comparada. */
export async function saveScan(segmentId: string, rideId: string, efforts: EffortRow[]): Promise<void> {
  const d = conn();
  d.withTransactionSync(() => {
    d.runSync('DELETE FROM segment_efforts WHERE segment_id = ? AND ride_id = ?', [segmentId, rideId]);
    for (const e of efforts) {
      d.runSync('INSERT OR REPLACE INTO segment_efforts (segment_id, ride_id, start_t, duration, speed, avg_hr) VALUES (?, ?, ?, ?, ?, ?)', [
        e.segmentId,
        e.rideId,
        e.startT,
        e.duration,
        e.speed,
        e.avgHr,
      ]);
    }
    d.runSync('INSERT OR IGNORE INTO segment_scans (segment_id, ride_id) VALUES (?, ?)', [segmentId, rideId]);
  });
}

/**
 * Pares (segmento, salida) que faltan comparar: la caja de la salida toca la del segmento y el par
 * todavía no está en segment_scans.
 */
export function pendingScans(): { segmentId: string; rideId: string }[] {
  return conn()
    .getAllSync<{ segment_id: string; ride_id: string }>(
      `SELECT s.id AS segment_id, g.ride_id AS ride_id
         FROM segments s
         JOIN ride_geo g
           ON g.min_lat <= s.max_lat AND g.max_lat >= s.min_lat
          AND g.min_lon <= s.max_lon AND g.max_lon >= s.min_lon
        WHERE NOT EXISTS (SELECT 1 FROM segment_scans c WHERE c.segment_id = s.id AND c.ride_id = g.ride_id)`,
    )
    .map((r) => ({ segmentId: r.segment_id, rideId: r.ride_id }));
}

/** Salidas con geografía pero sin recorrido asignado, y los representantes de los recorridos existentes. */
export function ridesWithoutRoute(): string[] {
  return conn().getAllSync<{ ride_id: string }>('SELECT ride_id FROM ride_geo WHERE route_id IS NULL').map((r) => r.ride_id);
}

export function routeRepresentativeIds(): string[] {
  return conn().getAllSync<{ route_id: string }>('SELECT DISTINCT route_id FROM ride_geo WHERE route_id IS NOT NULL').map((r) => r.route_id);
}

export async function setRoutes(map: Map<string, string>): Promise<void> {
  const d = conn();
  d.withTransactionSync(() => {
    for (const [rideId, routeId] of map) d.runSync('UPDATE ride_geo SET route_id = ? WHERE ride_id = ?', [routeId, rideId]);
  });
}

/** Salidas de cada recorrido: routeId → ids. */
export function routeMembers(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of conn().getAllSync<{ ride_id: string; route_id: string }>('SELECT ride_id, route_id FROM ride_geo WHERE route_id IS NOT NULL')) {
    out.set(r.route_id, [...(out.get(r.route_id) ?? []), r.ride_id]);
  }
  return out;
}

export function routeOfRide(rideId: string): string | null {
  return conn().getFirstSync<{ route_id: string | null }>('SELECT route_id FROM ride_geo WHERE ride_id = ?', [rideId])?.route_id ?? null;
}
