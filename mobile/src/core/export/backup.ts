import { sanitizeEfforts } from '../efforts/distanceEfforts';
import type { Goal, GoalMetric, GoalPeriod } from '../goals/goals';
import { sanitizeHistogram } from '../load/hrStats';
import type { RideRecord } from '../stats/rides';
import { sanitizeSettings } from '../../data/settings';
import type { Settings } from '../../data/settings';
import { unpackProfile } from '../../data/profileCodec';

/**
 * Respaldo completo (`respaldo.json`): todo lo que hace falta para armar la app de nuevo en otro
 * celular. Lleva recorridos (coordenadas): quien lo recibe puede ver por dónde andás.
 */
export const BACKUP_FORMAT = 'asistente-ciclismo-backup';
export const BACKUP_VERSION = 1;
/** Tope de tamaño de un respaldo al importar. */
export const BACKUP_MAX_BYTES = 200 * 1024 * 1024;

export interface BackupRide extends RideRecord {
  bikeId: string | null;
  /** Null = lo decide el tipo de actividad; 1 = contar como bici; 0 = no contar. */
  countedOverride: 0 | 1 | null;
}

/** Perfil de altitud: el texto JSON tal cual está en la base (arreglos empaquetados). */
export interface BackupProfile {
  rideId: string;
  points: string;
  demDone: boolean;
}

export interface BackupBike {
  id: string;
  name: string;
  type: string;
  weightKg: number | null;
  wheel: string | null;
  tireMm: number | null;
  retired: boolean;
  isDefault: boolean;
  createdT: number;
}

export interface BackupPart {
  id: string;
  bikeId: string;
  name: string;
  startKm: number;
  startT: number;
  alertKm: number | null;
}

export interface BackupSegment {
  id: string;
  name: string;
  points: string;
  length: number;
  bbox: [number, number, number, number];
  createdT: number;
  sourceRide: string | null;
}

export interface BackupWeather {
  rideId: string;
  status: string;
  data: string | null;
  fetchedT: number;
}

export interface BackupAwardSeen {
  key: string;
  t: number;
}

export interface BackupData {
  rides: BackupRide[];
  profiles: BackupProfile[];
  goals: Goal[];
  settings: Settings;
  bikes: BackupBike[];
  bikeParts: BackupPart[];
  segments: BackupSegment[];
  weather: BackupWeather[];
  awardsSeen: BackupAwardSeen[];
  awardsInit: boolean;
}

/** Arma el JSON del respaldo. Los ajustes van sin las URIs de las carpetas elegidas. */
export function buildBackup(data: BackupData, appVersion: string, now: number): string {
  const settings: Settings = {
    ...data.settings,
    folderUri: null,
    backup: { ...data.settings.backup, folderUri: null },
  };
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    createdAt: new Date(now).toISOString(),
    counts: {
      rides: data.rides.length,
      goals: data.goals.length,
      bikes: data.bikes.length,
      segments: data.segments.length,
    },
    rides: data.rides,
    profiles: data.profiles,
    goals: data.goals,
    settings,
    bikes: data.bikes,
    bikeParts: data.bikeParts,
    segments: data.segments,
    weather: data.weather,
    awardsSeen: data.awardsSeen,
    awardsInit: data.awardsInit,
  });
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const strOrNull = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length <= max ? v : null);

function sanitizeRide(raw: unknown): BackupRide | null {
  const r = obj(raw);
  if (!r) return null;
  const id = str(r.id, 120);
  const fileName = str(r.fileName, 300);
  const nums = ['startT', 'endT', 'distance', 'elapsedSec', 'movingSec', 'elevationGain', 'elevationLoss', 'maxSpeed'] as const;
  if (!id || !fileName || !nums.every((k) => isNum(r[k]))) return null;
  const d = obj(r.dem);
  const dem =
    d && isNum(d.gain) && isNum(d.loss) && isNum(d.maxAltitude) && isNum(d.minAltitude)
      ? { gain: d.gain, loss: d.loss, maxAltitude: d.maxAltitude, minAltitude: d.minAltitude }
      : null;
  return {
    id,
    fileName,
    startT: r.startT as number,
    endT: r.endT as number,
    distance: r.distance as number,
    elapsedSec: r.elapsedSec as number,
    movingSec: r.movingSec as number,
    elevationGain: r.elevationGain as number,
    elevationLoss: r.elevationLoss as number,
    maxAltitude: numOrNull(r.maxAltitude),
    minAltitude: numOrNull(r.minAltitude),
    maxSpeed: r.maxSpeed as number,
    dem,
    name: strOrNull(r.name, 200),
    activityType: strOrNull(r.activityType, 100),
    avgHr: numOrNull(r.avgHr),
    maxHr: numOrNull(r.maxHr),
    hrHist: sanitizeHistogram(r.hrHist),
    efforts: sanitizeEfforts(r.efforts),
    analysis: isNum(r.analysis) ? r.analysis : 0,
    bikeId: strOrNull(r.bikeId, 120) || null,
    countedOverride: r.countedOverride === 0 || r.countedOverride === 1 ? r.countedOverride : null,
  };
}

function sanitizeProfile(raw: unknown): BackupProfile | null {
  const p = obj(raw);
  const rideId = p && str(p.rideId, 120);
  // El texto se valida con el mismo lector que usa la app, pero se guarda tal cual (sin volver a armarlo).
  if (!p || !rideId || typeof p.points !== 'string' || unpackProfile(p.points) === null) return null;
  return { rideId, points: p.points, demDone: p.demDone === true };
}

const PERIODS: GoalPeriod[] = ['week', 'month', 'year'];
const METRICS: GoalMetric[] = ['rides', 'distance', 'time', 'elevation'];

function sanitizeGoal(raw: unknown): Goal | null {
  const g = obj(raw);
  const id = g && str(g.id, 60);
  if (!g || !id || !PERIODS.includes(g.period as GoalPeriod) || !METRICS.includes(g.metric as GoalMetric)) return null;
  if (!isNum(g.target) || g.target <= 0) return null;
  return { id, period: g.period as GoalPeriod, metric: g.metric as GoalMetric, target: g.target };
}

function sanitizeBike(raw: unknown): BackupBike | null {
  const b = obj(raw);
  const id = b && str(b.id, 60);
  const name = b && str(b.name, 80);
  if (!b || !id || !name || !isNum(b.createdT)) return null;
  return {
    id,
    name,
    type: str(b.type, 20) ?? 'road',
    weightKg: numOrNull(b.weightKg),
    wheel: strOrNull(b.wheel, 20),
    tireMm: numOrNull(b.tireMm),
    retired: b.retired === true,
    isDefault: b.isDefault === true,
    createdT: b.createdT,
  };
}

function sanitizePart(raw: unknown): BackupPart | null {
  const p = obj(raw);
  const id = p && str(p.id, 60);
  const bikeId = p && str(p.bikeId, 60);
  const name = p && str(p.name, 80);
  if (!p || !id || !bikeId || !name || !isNum(p.startKm) || !isNum(p.startT)) return null;
  return { id, bikeId, name, startKm: p.startKm, startT: p.startT, alertKm: numOrNull(p.alertKm) };
}

function sanitizeSegment(raw: unknown): BackupSegment | null {
  const s = obj(raw);
  const id = s && str(s.id, 60);
  const name = s && str(s.name, 80);
  const bbox = s && Array.isArray(s.bbox) && s.bbox.length === 4 && s.bbox.every(isNum) ? (s.bbox as [number, number, number, number]) : null;
  if (!s || !id || !name || !bbox || typeof s.points !== 'string' || !isNum(s.length) || !isNum(s.createdT)) return null;
  if (unpackProfile(s.points) === null) return null;
  return { id, name, points: s.points, length: s.length, bbox, createdT: s.createdT, sourceRide: strOrNull(s.sourceRide, 120) || null };
}

function sanitizeWeather(raw: unknown): BackupWeather | null {
  const w = obj(raw);
  const rideId = w && str(w.rideId, 120);
  const status = w && str(w.status, 20);
  if (!w || !rideId || !status || !isNum(w.fetchedT)) return null;
  return { rideId, status, data: strOrNull(w.data, 20_000), fetchedT: w.fetchedT };
}

function sanitizeSeen(raw: unknown): BackupAwardSeen | null {
  const a = obj(raw);
  const key = a && str(a.key, 160);
  return a && key && isNum(a.t) ? { key, t: a.t } : null;
}

function list<T>(raw: unknown, f: (x: unknown) => T | null): { items: T[]; skipped: number } {
  if (!Array.isArray(raw)) return { items: [], skipped: 0 };
  const items: T[] = [];
  for (const x of raw) {
    const v = f(x);
    if (v) items.push(v);
  }
  return { items, skipped: raw.length - items.length };
}

export type ParsedBackup =
  | { ok: true; data: BackupData; skipped: number; appVersion: string; createdAt: string }
  | { ok: false; error: string };

/**
 * Valida el respaldo elemento por elemento con los sanitizadores de la app: lo dañado se saltea
 * y se cuenta, no rompe la importación. Rechaza otros formatos y versiones más nuevas que la app.
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no es un respaldo válido (no se pudo leer).' };
  }
  const b = obj(raw);
  if (!b || b.format !== BACKUP_FORMAT) return { ok: false, error: 'Ese archivo no es un respaldo de Asistente Ciclismo.' };
  if (!isNum(b.version) || b.version > BACKUP_VERSION) {
    return { ok: false, error: 'El respaldo es de una versión más nueva de la app. Actualizá la app para importarlo.' };
  }
  const rides = list(b.rides, sanitizeRide);
  const profiles = list(b.profiles, sanitizeProfile);
  const goals = list(b.goals, sanitizeGoal);
  const bikes = list(b.bikes, sanitizeBike);
  const parts = list(b.bikeParts, sanitizePart);
  const segments = list(b.segments, sanitizeSegment);
  const weather = list(b.weather, sanitizeWeather);
  const seen = list(b.awardsSeen, sanitizeSeen);
  const settings = sanitizeSettings(b.settings);
  return {
    ok: true,
    data: {
      rides: rides.items,
      profiles: profiles.items,
      goals: goals.items,
      settings: { ...settings, folderUri: null, backup: { ...settings.backup, folderUri: null } },
      bikes: bikes.items,
      bikeParts: parts.items,
      segments: segments.items,
      weather: weather.items,
      awardsSeen: seen.items,
      awardsInit: b.awardsInit === true,
    },
    skipped:
      rides.skipped + profiles.skipped + goals.skipped + bikes.skipped + parts.skipped + segments.skipped + weather.skipped + seen.skipped,
    appVersion: typeof b.appVersion === 'string' ? b.appVersion.slice(0, 20) : '',
    createdAt: typeof b.createdAt === 'string' ? b.createdAt.slice(0, 40) : '',
  };
}

/** Lo que ya hay en el celular, para decidir qué se suma al restaurar. */
export interface LocalIndex {
  rideIds: Set<string>;
  /** Salidas locales sin altitud del mapa. */
  ridesWithoutDem: Set<string>;
  profileIds: Set<string>;
  /** Perfiles locales con puntos sin altitud del mapa. */
  profilesWithoutDem: Set<string>;
  goals: Goal[];
  bikeIds: Set<string>;
  partIds: Set<string>;
  segmentIds: Set<string>;
  weatherIds: Set<string>;
  awardKeys: Set<string>;
}

export interface GoalConflict {
  period: GoalPeriod;
  metric: GoalMetric;
  local: number;
  backup: number;
}

export interface RestorePlan {
  rides: BackupRide[];
  /** Salidas que ya estaban pero reciben la altitud del mapa del respaldo. */
  demUpgrades: BackupRide[];
  profiles: BackupProfile[];
  profileMerges: BackupProfile[];
  goals: Goal[];
  goalConflicts: GoalConflict[];
  bikes: BackupBike[];
  bikeParts: BackupPart[];
  segments: BackupSegment[];
  weather: BackupWeather[];
  awardsSeen: BackupAwardSeen[];
  /** Cuántos elementos del respaldo ya estaban y no se tocan. */
  alreadyHere: number;
}

/** Cuenta, sin tocar nada, lo que se va a sumar y los conflictos. Pura. */
export function planRestore(local: LocalIndex, data: BackupData): RestorePlan {
  const rides = data.rides.filter((r) => !local.rideIds.has(r.id));
  const demUpgrades = data.rides.filter((r) => local.rideIds.has(r.id) && r.dem !== null && local.ridesWithoutDem.has(r.id));
  const profiles = data.profiles.filter((p) => !local.profileIds.has(p.rideId));
  const profileMerges = data.profiles.filter((p) => local.profileIds.has(p.rideId) && local.profilesWithoutDem.has(p.rideId));

  const goals: Goal[] = [];
  const goalConflicts: GoalConflict[] = [];
  for (const g of data.goals) {
    const same = local.goals.find((x) => x.id === g.id || (x.period === g.period && x.metric === g.metric));
    if (!same) goals.push(g);
    else if (same.target !== g.target) goalConflicts.push({ period: g.period, metric: g.metric, local: same.target, backup: g.target });
  }

  const bikes = data.bikes.filter((b) => !local.bikeIds.has(b.id));
  const bikeParts = data.bikeParts.filter((p) => !local.partIds.has(p.id));
  const segments = data.segments.filter((s) => !local.segmentIds.has(s.id));
  const weather = data.weather.filter((w) => !local.weatherIds.has(w.rideId));
  const awardsSeen = data.awardsSeen.filter((a) => !local.awardKeys.has(a.key));
  const added = rides.length + profiles.length + goals.length + bikes.length + bikeParts.length + segments.length + weather.length;
  const total =
    data.rides.length + data.profiles.length + data.goals.length + data.bikes.length + data.bikeParts.length + data.segments.length + data.weather.length;
  return {
    rides,
    demUpgrades,
    profiles,
    profileMerges,
    goals,
    goalConflicts,
    bikes,
    bikeParts,
    segments,
    weather,
    awardsSeen,
    alreadyHere: total - added,
  };
}
