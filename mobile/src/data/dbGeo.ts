import type { RideGeo } from '../core/geo/rideGeo';
import { conn } from './db';

interface Row {
  ride_id: string;
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  trace: string;
  route_id: string | null;
}

const toGeo = (r: Row): RideGeo => ({
  rideId: r.ride_id,
  bbox: { minLat: r.min_lat, minLon: r.min_lon, maxLat: r.max_lat, maxLon: r.max_lon },
  start: { lat: r.start_lat, lon: r.start_lon },
  end: { lat: r.end_lat, lon: r.end_lon },
  trace: r.trace,
  routeId: r.route_id,
});

export function loadRideGeo(rideId: string): RideGeo | null {
  const r = conn().getFirstSync<Row>('SELECT * FROM ride_geo WHERE ride_id = ?', [rideId]);
  return r ? toGeo(r) : null;
}

/** La geografía de las salidas indicadas (para el mapa de calor). */
export function loadGeos(rideIds: string[]): RideGeo[] {
  if (rideIds.length === 0) return [];
  const out: RideGeo[] = [];
  for (let i = 0; i < rideIds.length; i += 500) {
    const part = rideIds.slice(i, i + 500);
    out.push(...conn().getAllSync<Row>(`SELECT * FROM ride_geo WHERE ride_id IN (${part.map(() => '?').join(',')})`, part).map(toGeo));
  }
  return out;
}

export async function saveRideGeo(g: RideGeo): Promise<void> {
  await conn().runAsync(
    `INSERT OR REPLACE INTO ride_geo (ride_id, min_lat, min_lon, max_lat, max_lon, start_lat, start_lon, end_lat, end_lon, trace, route_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [g.rideId, g.bbox.minLat, g.bbox.minLon, g.bbox.maxLat, g.bbox.maxLon, g.start.lat, g.start.lon, g.end.lat, g.end.lon, g.trace, g.routeId],
  );
}

/** Salidas con perfil que todavía no tienen geografía indexada. */
export function ridesWithoutGeo(): string[] {
  return conn()
    .getAllSync<{ ride_id: string }>('SELECT ride_id FROM profiles WHERE ride_id NOT IN (SELECT ride_id FROM ride_geo)')
    .map((r) => r.ride_id);
}
