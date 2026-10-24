import type {
  BackupAwardSeen,
  BackupBike,
  BackupData,
  BackupPart,
  BackupProfile,
  BackupRide,
  BackupSegment,
  BackupWeather,
  LocalIndex,
  RestorePlan,
} from '../core/export/backup';
import { mergeDem } from '../core/elevation/profile';
import type { Goal } from '../core/goals/goals';
import { ANALYSIS_COLUMNS, analysisValues, conn, loadGoals, loadRides, loadSetting, writeProfile } from './db';
import { unpackProfile } from './profileCodec';
import { sanitizeSettings } from './settings';
import type { Settings } from './settings';

/** Lecturas y escrituras en bloque para exportar e importar respaldos (ver core/export/backup). */

interface BikeRow {
  id: string;
  name: string;
  type: string;
  weight_kg: number | null;
  wheel: string | null;
  tire_mm: number | null;
  retired: number;
  is_default: number;
  created_t: number;
}

/** Todo lo guardado, listo para armar el respaldo. */
export function readBackupData(settings: Settings): BackupData {
  const d = conn();
  const extra = new Map(
    d
      .getAllSync<{ id: string; bike_id: string | null; counted_override: number | null }>(
        'SELECT id, bike_id, counted_override FROM rides',
      )
      .map((r) => [r.id, r] as const),
  );
  const rides: BackupRide[] = loadRides().map((r) => {
    const e = extra.get(r.id);
    const o = e?.counted_override;
    return { ...r, bikeId: e?.bike_id ?? null, countedOverride: o === 0 || o === 1 ? o : null };
  });
  const profiles: BackupProfile[] = d
    .getAllSync<{ ride_id: string; points: string; dem_done: number }>('SELECT ride_id, points, dem_done FROM profiles')
    .map((p) => ({ rideId: p.ride_id, points: p.points, demDone: p.dem_done === 1 }));
  const bikes: BackupBike[] = d.getAllSync<BikeRow>('SELECT * FROM bikes ORDER BY created_t').map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    weightKg: b.weight_kg,
    wheel: b.wheel,
    tireMm: b.tire_mm,
    retired: b.retired === 1,
    isDefault: b.is_default === 1,
    createdT: b.created_t,
  }));
  const bikeParts: BackupPart[] = d
    .getAllSync<{ id: string; bike_id: string; name: string; start_km: number; start_t: number; alert_km: number | null }>(
      'SELECT * FROM bike_parts',
    )
    .map((p) => ({ id: p.id, bikeId: p.bike_id, name: p.name, startKm: p.start_km, startT: p.start_t, alertKm: p.alert_km }));
  const segments: BackupSegment[] = d
    .getAllSync<{
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
    }>('SELECT * FROM segments')
    .map((s) => ({
      id: s.id,
      name: s.name,
      points: s.points,
      length: s.length,
      bbox: [s.min_lat, s.min_lon, s.max_lat, s.max_lon] as [number, number, number, number],
      createdT: s.created_t,
      sourceRide: s.source_ride,
    }));
  const weather: BackupWeather[] = d
    .getAllSync<{ ride_id: string; status: string; data: string | null; fetched_t: number }>('SELECT * FROM weather')
    .map((w) => ({ rideId: w.ride_id, status: w.status, data: w.data, fetchedT: w.fetched_t }));
  const awardsSeen: BackupAwardSeen[] = d.getAllSync<BackupAwardSeen>('SELECT key, t FROM awards_seen');
  return {
    rides,
    profiles,
    goals: loadGoals(),
    settings,
    bikes,
    bikeParts,
    segments,
    weather,
    awardsSeen,
    awardsInit: loadSetting<boolean>('awardsInit', false),
  };
}

const ids = (sql: string): Set<string> =>
  new Set(conn().getAllSync<{ id: string }>(sql).map((r) => r.id));

/** Qué hay ya en el celular, para que `planRestore` decida qué falta. */
export function readLocalIndex(): LocalIndex {
  const d = conn();
  const profilesWithoutDem = new Set<string>();
  for (const p of d.getAllSync<{ ride_id: string; points: string }>('SELECT ride_id, points FROM profiles')) {
    const pts = unpackProfile(p.points);
    if (pts && pts.some((q) => q.dem === null)) profilesWithoutDem.add(p.ride_id);
  }
  return {
    rideIds: ids('SELECT id FROM rides'),
    ridesWithoutDem: ids('SELECT id FROM rides WHERE dem_gain IS NULL'),
    profileIds: ids('SELECT ride_id AS id FROM profiles'),
    profilesWithoutDem,
    goals: loadGoals(),
    bikeIds: ids('SELECT id FROM bikes'),
    partIds: ids('SELECT id FROM bike_parts'),
    segmentIds: ids('SELECT id FROM segments'),
    weatherIds: ids('SELECT ride_id AS id FROM weather'),
    awardKeys: ids('SELECT key AS id FROM awards_seen'),
  };
}

export interface RestoreOptions {
  /** Reemplaza los ajustes y el perfil por los del respaldo. */
  settings: Settings | null;
  /** Marca que ya se hizo la primera pasada de logros (todo queda visto, sin festejos). */
  awardsInit: boolean;
}

/**
 * Aplica el plan en una sola transacción: si algo falla no queda nada a medias. Las salidas que
 * ya estaban no se pisan; solo reciben la altitud del mapa que les faltaba.
 */
export async function applyRestore(plan: RestorePlan, opts: RestoreOptions): Promise<void> {
  const d = conn();
  const profileOf = new Map(plan.profiles.map((p) => [p.rideId, p] as const));
  d.withTransactionSync(() => {
    for (const r of plan.rides) {
      d.runSync(
        `INSERT OR IGNORE INTO rides (id, ${ANALYSIS_COLUMNS.join(', ')}) VALUES (?${', ?'.repeat(ANALYSIS_COLUMNS.length)})`,
        [r.id, ...analysisValues(r)],
      );
      d.runSync('UPDATE rides SET bike_id = ?, counted_override = ? WHERE id = ?', [r.bikeId, r.countedOverride, r.id]);
      if (r.dem) {
        d.runSync('UPDATE rides SET dem_gain = ?, dem_loss = ?, dem_max_altitude = ?, dem_min_altitude = ? WHERE id = ?', [
          r.dem.gain,
          r.dem.loss,
          r.dem.maxAltitude,
          r.dem.minAltitude,
          r.id,
        ]);
      }
    }
    for (const r of plan.demUpgrades) {
      d.runSync(
        'UPDATE rides SET dem_gain = ?, dem_loss = ?, dem_max_altitude = ?, dem_min_altitude = ? WHERE id = ? AND dem_gain IS NULL',
        [r.dem!.gain, r.dem!.loss, r.dem!.maxAltitude, r.dem!.minAltitude, r.id],
      );
    }
    for (const p of profileOf.values()) {
      // El texto del respaldo se guarda tal cual.
      d.runSync('INSERT OR IGNORE INTO profiles (ride_id, points, dem_done) VALUES (?, ?, ?)', [p.rideId, p.points, p.demDone ? 1 : 0]);
    }
    for (const p of plan.profileMerges) {
      const fresh = unpackProfile(p.points);
      const local = d.getFirstSync<{ points: string }>('SELECT points FROM profiles WHERE ride_id = ?', [p.rideId]);
      const old = local ? unpackProfile(local.points) : null;
      if (!fresh || !old) continue;
      const merged = mergeDem(old, fresh);
      writeProfile(d, p.rideId, merged, merged.every((q) => q.dem !== null));
    }
    for (const g of plan.goals as Goal[]) {
      d.runSync('INSERT OR IGNORE INTO goals (id, period, metric, target) VALUES (?, ?, ?, ?)', [g.id, g.period, g.metric, g.target]);
    }
    for (const b of plan.bikes) {
      d.runSync(
        'INSERT OR IGNORE INTO bikes (id, name, type, weight_kg, wheel, tire_mm, retired, is_default, created_t) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [b.id, b.name, b.type, b.weightKg, b.wheel, b.tireMm, b.retired ? 1 : 0, 0, b.createdT],
      );
    }
    // Una sola bici por defecto: si no hay ninguna en el celular, queda la del respaldo.
    const hasDefault = d.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM bikes WHERE is_default = 1')?.n ?? 0;
    if (hasDefault === 0) {
      const wanted = plan.bikes.find((b) => b.isDefault);
      if (wanted) d.runSync('UPDATE bikes SET is_default = 1 WHERE id = ?', [wanted.id]);
    }
    for (const p of plan.bikeParts) {
      d.runSync('INSERT OR IGNORE INTO bike_parts (id, bike_id, name, start_km, start_t, alert_km) VALUES (?, ?, ?, ?, ?, ?)', [
        p.id,
        p.bikeId,
        p.name,
        p.startKm,
        p.startT,
        p.alertKm,
      ]);
    }
    for (const s of plan.segments) {
      d.runSync(
        'INSERT OR IGNORE INTO segments (id, name, points, length, min_lat, min_lon, max_lat, max_lon, created_t, source_ride) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [s.id, s.name, s.points, s.length, s.bbox[0], s.bbox[1], s.bbox[2], s.bbox[3], s.createdT, s.sourceRide],
      );
    }
    for (const w of plan.weather) {
      d.runSync('INSERT OR IGNORE INTO weather (ride_id, status, data, fetched_t) VALUES (?, ?, ?, ?)', [w.rideId, w.status, w.data, w.fetchedT]);
    }
    for (const a of plan.awardsSeen) {
      d.runSync('INSERT OR IGNORE INTO awards_seen (key, t) VALUES (?, ?)', [a.key, a.t]);
    }
    if (opts.awardsInit) d.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['awardsInit', 'true']);
    if (opts.settings) {
      const clean = sanitizeSettings(opts.settings);
      d.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['settings', JSON.stringify(clean)]);
    }
  });
}
