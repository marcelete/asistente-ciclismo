import * as SQLite from 'expo-sqlite';
import type { RideAnalysis } from '../core/analysis/ride';
import { sanitizeEfforts } from '../core/efforts/distanceEfforts';
import type { ElevationStats, ProfilePoint } from '../core/elevation/profile';
import type { Goal } from '../core/goals/goals';
import { sanitizeHistogram } from '../core/load/hrStats';
import type { RideRecord } from '../core/stats/rides';
import { packProfile, unpackProfile } from './profileCodec';

/**
 * Base local del celular. Guarda el resumen de cada salida importada, su perfil de altitud (un
 * punto cada 50 m), las metas, los ajustes y el registro de errores. Las muestras completas no se
 * guardan: el GPX original sigue en la carpeta de OpenTracks.
 */
let db: SQLite.SQLiteDatabase | null = null;

// Migraciones por versión (PRAGMA user_version). Cada paso corre una sola vez.
const MIGRATIONS: string[] = [
  // 1: altitud según el mapa de terreno y perfil de cada salida.
  `ALTER TABLE rides ADD COLUMN dem_gain REAL;
   ALTER TABLE rides ADD COLUMN dem_loss REAL;
   ALTER TABLE rides ADD COLUMN dem_max_altitude REAL;
   ALTER TABLE rides ADD COLUMN dem_min_altitude REAL;
   CREATE TABLE IF NOT EXISTS profiles (
     ride_id TEXT PRIMARY KEY NOT NULL,
     points TEXT NOT NULL,
     dem_done INTEGER NOT NULL DEFAULT 0
   );`,
  // 2: registro de errores y eventos, sin datos personales (ver services/log).
  `CREATE TABLE IF NOT EXISTS logs (
     t INTEGER NOT NULL,
     level TEXT NOT NULL,
     tag TEXT NOT NULL,
     msg TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS logs_t ON logs (t);`,
  // 3: nombre y tipo de la salida, frecuencia cardíaca, mejores tiempos y versión del análisis.
  // Las salidas anteriores quedan con analysis = 0 y se recalculan releyendo su GPX.
  `ALTER TABLE rides ADD COLUMN name TEXT;
   ALTER TABLE rides ADD COLUMN activity_type TEXT;
   ALTER TABLE rides ADD COLUMN avg_hr REAL;
   ALTER TABLE rides ADD COLUMN max_hr REAL;
   ALTER TABLE rides ADD COLUMN hr_hist TEXT;
   ALTER TABLE rides ADD COLUMN efforts TEXT;
   ALTER TABLE rides ADD COLUMN analysis INTEGER NOT NULL DEFAULT 0;`,
  // 4 (0.5.0): geografía de cada salida, segmentos, clima, logros vistos, bicis y caché de altitud.
  `ALTER TABLE rides ADD COLUMN bike_id TEXT;
   ALTER TABLE rides ADD COLUMN counted_override INTEGER;
   CREATE TABLE IF NOT EXISTS ride_geo (
     ride_id TEXT PRIMARY KEY NOT NULL,
     min_lat REAL NOT NULL, min_lon REAL NOT NULL, max_lat REAL NOT NULL, max_lon REAL NOT NULL,
     start_lat REAL NOT NULL, start_lon REAL NOT NULL, end_lat REAL NOT NULL, end_lon REAL NOT NULL,
     trace TEXT NOT NULL,
     route_id TEXT
   );
   CREATE TABLE IF NOT EXISTS segments (
     id TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL,
     points TEXT NOT NULL,
     length REAL NOT NULL,
     min_lat REAL NOT NULL, min_lon REAL NOT NULL, max_lat REAL NOT NULL, max_lon REAL NOT NULL,
     created_t INTEGER NOT NULL,
     source_ride TEXT
   );
   CREATE TABLE IF NOT EXISTS segment_efforts (
     segment_id TEXT NOT NULL,
     ride_id TEXT NOT NULL,
     start_t INTEGER NOT NULL,
     duration REAL NOT NULL,
     speed REAL NOT NULL,
     avg_hr REAL,
     PRIMARY KEY (segment_id, ride_id, start_t)
   );
   CREATE TABLE IF NOT EXISTS segment_scans (
     segment_id TEXT NOT NULL,
     ride_id TEXT NOT NULL,
     PRIMARY KEY (segment_id, ride_id)
   );
   CREATE TABLE IF NOT EXISTS weather (
     ride_id TEXT PRIMARY KEY NOT NULL,
     status TEXT NOT NULL,
     data TEXT,
     fetched_t INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS awards_seen (
     key TEXT PRIMARY KEY NOT NULL,
     t INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS bikes (
     id TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL,
     type TEXT NOT NULL,
     weight_kg REAL,
     wheel TEXT,
     tire_mm REAL,
     retired INTEGER NOT NULL DEFAULT 0,
     is_default INTEGER NOT NULL DEFAULT 0,
     created_t INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS bike_parts (
     id TEXT PRIMARY KEY NOT NULL,
     bike_id TEXT NOT NULL,
     name TEXT NOT NULL,
     start_km REAL NOT NULL,
     start_t INTEGER NOT NULL,
     alert_km REAL
   );
   CREATE TABLE IF NOT EXISTS dem_cells (
     cy INTEGER NOT NULL,
     cx INTEGER NOT NULL,
     alt REAL NOT NULL,
     PRIMARY KEY (cy, cx)
   );`,
];

/**
 * Abre la base la primera vez que se usa y aplica las migraciones. Se hace al primer uso (y no al
 * importar el módulo) para que un error acá llegue a la pantalla de error en vez de cerrar la app.
 */
export function conn(): SQLite.SQLiteDatabase {
  if (db) return db;
  const d = SQLite.openDatabaseSync('asistente.db');
  d.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS rides (
      id TEXT PRIMARY KEY NOT NULL,
      file_name TEXT NOT NULL,
      start_t INTEGER NOT NULL,
      end_t INTEGER NOT NULL,
      distance REAL NOT NULL,
      elapsed_sec REAL NOT NULL,
      moving_sec REAL NOT NULL,
      elevation_gain REAL NOT NULL,
      elevation_loss REAL NOT NULL,
      max_altitude REAL,
      min_altitude REAL,
      max_speed REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rides_start ON rides (start_t);
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      period TEXT NOT NULL,
      metric TEXT NOT NULL,
      target REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  const version = d.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  for (let v = version; v < MIGRATIONS.length; v++) {
    try {
      d.withTransactionSync(() => {
        d.execSync(MIGRATIONS[v]);
        d.execSync(`PRAGMA user_version = ${v + 1}`);
      });
    } catch (e) {
      throw new Error(`Falló la migración ${v + 1} de la base: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  db = d;
  return d;
}

interface RideRow {
  id: string;
  file_name: string;
  start_t: number;
  end_t: number;
  distance: number;
  elapsed_sec: number;
  moving_sec: number;
  elevation_gain: number;
  elevation_loss: number;
  max_altitude: number | null;
  min_altitude: number | null;
  max_speed: number;
  dem_gain: number | null;
  dem_loss: number | null;
  dem_max_altitude: number | null;
  dem_min_altitude: number | null;
  name: string | null;
  activity_type: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  hr_hist: string | null;
  efforts: string | null;
  analysis: number;
  bike_id: string | null;
  counted_override: number | null;
}

/** JSON guardado por la app; si está dañado se trata como vacío. */
function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function loadRides(): RideRecord[] {
  return conn().getAllSync<RideRow>('SELECT * FROM rides ORDER BY start_t DESC').map((r) => ({
    id: r.id,
    fileName: r.file_name,
    startT: r.start_t,
    endT: r.end_t,
    distance: r.distance,
    elapsedSec: r.elapsed_sec,
    movingSec: r.moving_sec,
    elevationGain: r.elevation_gain,
    elevationLoss: r.elevation_loss,
    maxAltitude: r.max_altitude,
    minAltitude: r.min_altitude,
    maxSpeed: r.max_speed,
    dem:
      r.dem_gain === null || r.dem_loss === null || r.dem_max_altitude === null || r.dem_min_altitude === null
        ? null
        : { gain: r.dem_gain, loss: r.dem_loss, maxAltitude: r.dem_max_altitude, minAltitude: r.dem_min_altitude },
    name: r.name,
    activityType: r.activity_type,
    avgHr: r.avg_hr,
    maxHr: r.max_hr,
    hrHist: sanitizeHistogram(parseJson(r.hr_hist)),
    efforts: sanitizeEfforts(parseJson(r.efforts)),
    analysis: r.analysis,
    bikeId: r.bike_id,
    countedOverride: r.counted_override === 0 || r.counted_override === 1 ? r.counted_override : null,
  }));
}

/** Columnas que salen del análisis del GPX (todas menos la altitud del mapa). */
export const ANALYSIS_COLUMNS = [
  'file_name',
  'start_t',
  'end_t',
  'distance',
  'elapsed_sec',
  'moving_sec',
  'elevation_gain',
  'elevation_loss',
  'max_altitude',
  'min_altitude',
  'max_speed',
  'name',
  'activity_type',
  'avg_hr',
  'max_hr',
  'hr_hist',
  'efforts',
  'analysis',
] as const;

export function analysisValues(r: RideRecord): SQLite.SQLiteBindValue[] {
  return [
    r.fileName,
    r.startT,
    r.endT,
    r.distance,
    r.elapsedSec,
    r.movingSec,
    r.elevationGain,
    r.elevationLoss,
    r.maxAltitude,
    r.minAltitude,
    r.maxSpeed,
    r.name,
    r.activityType,
    r.avgHr,
    r.maxHr,
    r.hrHist ? JSON.stringify(r.hrHist) : null,
    r.efforts ? JSON.stringify(r.efforts) : null,
    r.analysis,
  ];
}

const allDem = (points: ProfilePoint[]) => points.length > 0 && points.every((p) => p.dem !== null);

export function writeProfile(d: SQLite.SQLiteDatabase, rideId: string, points: ProfilePoint[], demDone: boolean): void {
  d.runSync('INSERT OR REPLACE INTO profiles (ride_id, points, dem_done) VALUES (?, ?, ?)', [
    rideId,
    JSON.stringify(packProfile(points)),
    demDone ? 1 : 0,
  ]);
}

/**
 * Guarda una salida nueva con su perfil, las dos cosas juntas. Si ya estaba (la misma salida
 * exportada con otro nombre) no toca nada: así no se pisa la altitud del mapa ya consultada.
 * Devuelve si se agregó.
 */
export async function saveNewRide(a: RideAnalysis): Promise<boolean> {
  const d = conn();
  let added = false;
  d.withTransactionSync(() => {
    const res = d.runSync(
      `INSERT OR IGNORE INTO rides (id, ${ANALYSIS_COLUMNS.join(', ')}) VALUES (?${', ?'.repeat(ANALYSIS_COLUMNS.length)})`,
      [a.record.id, ...analysisValues(a.record)],
    );
    added = res.changes > 0;
    if (added) {
      writeProfile(d, a.record.id, a.profile, allDem(a.profile));
      // La bici por defecto se asigna a cada salida que entra.
      const def = d.getFirstSync<{ id: string }>('SELECT id FROM bikes WHERE is_default = 1 AND retired = 0');
      if (def) d.runSync('UPDATE rides SET bike_id = ? WHERE id = ?', [def.id, a.record.id]);
    }
  });
  return added;
}

/** Reemplaza el análisis de una salida ya guardada y su perfil, sin tocar la altitud del mapa de la salida. */
export async function saveReanalysis(a: RideAnalysis, profile: ProfilePoint[]): Promise<void> {
  const d = conn();
  d.withTransactionSync(() => {
    d.runSync(`UPDATE rides SET ${ANALYSIS_COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
      ...analysisValues(a.record),
      a.record.id,
    ]);
    // La geografía y los segmentos calculados salen del perfil anterior: se rehacen.
    d.runSync('DELETE FROM ride_geo WHERE ride_id = ?', [a.record.id]);
    d.runSync('DELETE FROM segment_efforts WHERE ride_id = ?', [a.record.id]);
    d.runSync('DELETE FROM segment_scans WHERE ride_id = ?', [a.record.id]);
    writeProfile(d, a.record.id, profile, allDem(profile));
  });
}

/**
 * Guarda el perfil con la altitud del mapa recién consultada. `demDone` marca que la consulta ya
 * se hizo aunque queden puntos sin altitud (una salida corta sin altitud del GPS, por ejemplo):
 * si no, quedaría esperando para siempre.
 */
export async function saveProfile(rideId: string, points: ProfilePoint[], demDone = allDem(points)): Promise<void> {
  writeProfile(conn(), rideId, points, demDone);
}

export function loadProfile(rideId: string): ProfilePoint[] | null {
  const row = conn().getFirstSync<{ points: string }>('SELECT points FROM profiles WHERE ride_id = ?', [rideId]);
  return row ? unpackProfile(row.points) : null;
}

/** La salida todavía espera la consulta de altitud del mapa (false si ya se hizo o no tiene perfil). */
export function isDemPending(rideId: string): boolean {
  const row = conn().getFirstSync<{ dem_done: number }>('SELECT dem_done FROM profiles WHERE ride_id = ?', [rideId]);
  return row !== null && row.dem_done === 0;
}

/** Borra un perfil dañado para que se rearme releyendo el GPX. */
export async function deleteProfile(rideId: string): Promise<void> {
  await conn().runAsync('DELETE FROM profiles WHERE ride_id = ?', [rideId]);
}

/** Ids de las salidas que tienen perfil guardado. */
export function profileIds(): Set<string> {
  return new Set(conn().getAllSync<{ ride_id: string }>('SELECT ride_id FROM profiles').map((r) => r.ride_id));
}

/** Salidas con perfil que todavía esperan la altitud del mapa. */
export function profilesPendingDem(): string[] {
  return conn()
    .getAllSync<{ ride_id: string }>(
      'SELECT ride_id FROM profiles WHERE dem_done = 0 ORDER BY (SELECT start_t FROM rides WHERE rides.id = profiles.ride_id) DESC',
    )
    .map((r) => r.ride_id);
}

export async function saveRideDem(rideId: string, dem: ElevationStats): Promise<void> {
  await conn().runAsync(
    'UPDATE rides SET dem_gain = ?, dem_loss = ?, dem_max_altitude = ?, dem_min_altitude = ? WHERE id = ?',
    [dem.gain, dem.loss, dem.maxAltitude, dem.minAltitude, rideId],
  );
}

export function loadGoals(): Goal[] {
  return conn().getAllSync<Goal>('SELECT id, period, metric, target FROM goals ORDER BY rowid');
}

export async function saveGoal(g: Goal): Promise<void> {
  await conn().runAsync('INSERT OR REPLACE INTO goals (id, period, metric, target) VALUES (?, ?, ?, ?)', [
    g.id,
    g.period,
    g.metric,
    g.target,
  ]);
}

export async function deleteGoal(id: string): Promise<void> {
  await conn().runAsync('DELETE FROM goals WHERE id = ?', [id]);
}

export function loadSetting<T>(key: string, fallback: T): T {
  const row = conn().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await conn().runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
}

export interface LogRow {
  t: number;
  level: string;
  tag: string;
  msg: string;
}

/** Cantidad de entradas y antigüedad máxima que se conservan del registro. */
const LOG_MAX_ROWS = 500;
const LOG_MAX_AGE_MS = 30 * 86400000;

/** Agrega una entrada (ya redactada) y descarta las viejas para que el registro no crezca sin límite. */
export async function appendLog(row: LogRow): Promise<void> {
  const d = conn();
  await d.runAsync('INSERT INTO logs (t, level, tag, msg) VALUES (?, ?, ?, ?)', [row.t, row.level, row.tag, row.msg]);
  await d.runAsync(
    'DELETE FROM logs WHERE t < ? OR rowid NOT IN (SELECT rowid FROM logs ORDER BY t DESC LIMIT ?)',
    [row.t - LOG_MAX_AGE_MS, LOG_MAX_ROWS],
  );
}

export function loadLogs(limit = 100): LogRow[] {
  return conn().getAllSync<LogRow>('SELECT t, level, tag, msg FROM logs ORDER BY t DESC LIMIT ?', [limit]);
}

export async function clearLogs(): Promise<void> {
  await conn().runAsync('DELETE FROM logs');
}

/** Tablas de datos que se vacían al borrar todo (los ajustes y el registro se tratan aparte). */
const DATA_TABLES = [
  'profiles',
  'rides',
  'goals',
  'ride_geo',
  'segments',
  'segment_efforts',
  'segment_scans',
  'weather',
  'awards_seen',
  'bikes',
  'bike_parts',
  'dem_cells',
];

/**
 * Borra todo lo guardado por la app: salidas, perfiles, metas, bicis, segmentos, clima, logros,
 * caché de altitud, ajustes (con el presupuesto y la espera de Open-Meteo) y registro.
 */
export async function deleteAllData(): Promise<void> {
  await conn().execAsync(
    `${DATA_TABLES.map((t) => `DELETE FROM ${t};`).join(' ')} DELETE FROM settings; DELETE FROM logs; VACUUM; PRAGMA wal_checkpoint(TRUNCATE);`,
  );
}
