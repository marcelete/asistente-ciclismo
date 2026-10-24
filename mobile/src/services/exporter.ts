import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { climbsFromProfile, estimateEnergy } from '../core/analysis/profileMetrics';
import { bikeOfRide, energyParams, totalsByBike } from '../core/bikes/bikes';
import type { Bike } from '../core/bikes/bikes';
import type { EnergyEstimate } from '../core/analysis/profileMetrics';
import { computeAwards } from '../core/awards/engine';
import { buildBackup, BACKUP_MAX_BYTES, parseBackup, planRestore } from '../core/export/backup';
import type { ParsedBackup, RestorePlan } from '../core/export/backup';
import {
  bicisCsv,
  formaDiariaCsv,
  leeme,
  logrosCsv,
  metasCsv,
  perfilCsv,
  pointRows,
  pointsCsv,
  salidasCsv,
  segmentosCsv,
} from '../core/export/bundle';
import { csvCell } from '../core/export/csv';
import type { RideExportContext } from '../core/export/columns';
import { looksLikeZip, unzipStore, zipStore } from '../core/export/zip';
import type { ZipEntry } from '../core/export/zip';
import type { Goal } from '../core/goals/goals';
import { resolveHrProfile, localDateKey } from '../core/load/training';
import { countsAsRide } from '../core/stats/sport';
import type { RideRecord } from '../core/stats/rides';
import { loadProfile, loadSetting, saveSetting } from '../data/db';
import { applyRestore, readBackupData, readLocalIndex } from '../data/dbBackup';
import { loadBikes } from '../data/dbBikes';
import { loadEfforts, loadSegments, routeMembers } from '../data/dbSegments';
import { loadWeather } from '../data/dbWeather';
import type { Settings } from '../data/settings';
import { log } from './log';

/** Qué se exporta. El respaldo completo siempre va en el ZIP. */
export interface ExportOptions {
  includePoints: boolean;
  hideEnds: boolean;
}

/** Lo que el store tiene en ese momento. */
export interface ExportSnapshot {
  rides: RideRecord[];
  goals: Goal[];
  settings: Settings;
  appVersion: string;
}

const EXPORT_DIR = 'export';
const CHUNK_BYTES = 1024 * 1024;
const ZIP_MIME = 'application/zip';
/** Nombre fijo de la copia automática en la carpeta elegida. */
export const AUTO_BACKUP_NAME = 'asistente-ciclismo-respaldo.zip';
const AUTO_BACKUP_MIN_MS = 3600_000;

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const enc = new TextEncoder();
const bytesOf = (text: string): Uint8Array => enc.encode(text);

function exportDir(): Directory {
  const dir = new Directory(Paths.cache, EXPORT_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Los ZIP de la caché se borran al abrir la app: ya se compartieron o se descartaron. */
export function cleanExportCache(): void {
  try {
    const dir = new Directory(Paths.cache, EXPORT_DIR);
    if (dir.exists) dir.delete();
  } catch (e) {
    log('warn', 'export', 'No se pudo limpiar la caché de exportación', e);
  }
}

/** Potencia y subidas de cada salida, calculadas de a poco para no congelar la pantalla. */
async function perRideExtras(snap: ExportSnapshot, bikes: Bike[]) {
  const a = snap.settings.athlete;
  const energy = new Map<string, EnergyEstimate | null>();
  const climbs = new Map<string, number>();
  let n = 0;
  for (const r of snap.rides) {
    const points = loadProfile(r.id);
    if (points) {
      const params = energyParams(a.weightKg, bikeOfRide(r, bikes), { bike: a.bike, bikeKg: a.bikeKg });
      energy.set(r.id, params ? estimateEnergy(points, params) : null);
      climbs.set(r.id, climbsFromProfile(points).length);
    }
    if (++n % 20 === 0) await tick();
  }
  return { energy, climbs };
}

/** Arma todos los archivos del ZIP. Devuelve también cuántas salidas se exportaron. */
export async function buildEntries(snap: ExportSnapshot, opts: ExportOptions, now: number = Date.now()): Promise<ZipEntry[]> {
  const { rides, goals, settings, appVersion } = snap;
  const observedMax = rides.reduce<number | null>((m, r) => (r.maxHr !== null && (m === null || r.maxHr > m) ? r.maxHr : m), null);
  const hr = resolveHrProfile(settings.athlete, observedMax, now)?.profile ?? null;
  const bikes = loadBikes();
  const { energy, climbs } = await perRideExtras(snap, bikes);
  const ctx: RideExportContext = {
    autoPause: settings.autoPause,
    hr,
    counted: countsAsRide,
    bikeName: (r) => bikeOfRide(r, bikes)?.name ?? null,
    energy: (r) => energy.get(r.id) ?? null,
    climbCount: (r) => climbs.get(r.id) ?? null,
  };
  const backup = readBackupData(settings);
  const counted = rides.filter(countsAsRide);
  const totals = totalsByBike(counted, bikes);

  // Segmentos, recorridos y logros: los mismos que ve la app.
  const segNames = new Map(loadSegments().map((x) => [x.id, x] as const));
  const efforts = loadEfforts();
  const routeOf = new Map<string, string>();
  for (const [route, ids] of routeMembers()) for (const id of ids) routeOf.set(id, route);
  const awards = computeAwards({
    rides: counted,
    goals,
    now,
    autoPause: settings.autoPause,
    segmentEfforts: efforts.map((e) => ({ segmentId: e.segmentId, segmentName: segNames.get(e.segmentId)?.name ?? 'segmento', rideId: e.rideId, duration: e.duration })),
    routeOf,
    weather: new Map([...loadWeather()].flatMap(([id, w]) => (w.data ? [[id, w.data] as const] : []))),
  });
  const awardsByRide = new Map<string, string[]>();
  for (const e of awards.events) if (e.rideId) awardsByRide.set(e.rideId, [...(awardsByRide.get(e.rideId) ?? []), e.title]);
  const weatherRows = loadWeather();
  ctx.weather = (r) => weatherRows.get(r.id)?.data ?? null;
  ctx.routeId = (r) => routeOf.get(r.id) ?? null;
  ctx.awards = (r) => awardsByRide.get(r.id)?.join(' | ') ?? null;
  await tick();

  const files: [string, string][] = [
    ['salidas.csv', salidasCsv(rides, ctx)],
    [
      'segmentos.csv',
      segmentosCsv(
        efforts.map((e) => ({
          segmentName: segNames.get(e.segmentId)?.name ?? 'Segmento',
          segmentLengthM: segNames.get(e.segmentId)?.length ?? 0,
          rideId: e.rideId,
          startT: e.startT,
          durationSec: e.duration,
          speedMs: e.speed,
          avgHr: e.avgHr,
        })),
      ),
    ],
    ['metas.csv', metasCsv(goals)],
    ['logros.csv', logrosCsv(awards.events.map((e) => ({ key: e.key, kind: e.kind, title: e.title, rideId: e.rideId, t: e.t })))],
    ['bicis.csv', bicisCsv(backup.bikes, backup.bikeParts, (id) => ({ km: totals.get(id)?.km ?? 0, rides: totals.get(id)?.rides ?? 0 }))],
    ['forma_diaria.csv', formaDiariaCsv(rides.filter(countsAsRide), hr, now)],
    ['perfil.csv', perfilCsv(settings, hr)],
  ];
  if (opts.includePoints) {
    // Se arma de a una salida y se junta al final; con miles de salidas son decenas de MB de texto.
    const parts: string[] = [];
    let n = 0;
    for (const r of rides) {
      const points = loadProfile(r.id);
      if (points) {
        for (const row of pointRows(r.id, points, opts.hideEnds)) parts.push(row.map(csvCell).join(','));
      }
      if (++n % 20 === 0) await tick();
    }
    const header = pointsCsv([]);
    files.push(['puntos.csv', header + parts.join('\r\n') + (parts.length > 0 ? '\r\n' : '')]);
  }
  const readme = leeme({
    now,
    appVersion,
    includePoints: opts.includePoints,
    hideEnds: opts.hideEnds,
    counts: { rides: rides.length },
  });
  const entries: ZipEntry[] = [{ name: 'LEEME.txt', data: bytesOf(readme) }];
  for (const [name, text] of files) entries.push({ name, data: bytesOf(text) });
  entries.push({ name: 'respaldo.json', data: bytesOf(buildBackup(backup, appVersion, now)) });
  return entries;
}

async function writeInChunks(file: File, data: Uint8Array): Promise<void> {
  const handle = file.open(FileMode.WriteOnly);
  try {
    for (let i = 0; i < data.length; i += CHUNK_BYTES) {
      await handle.writeBytes(data.subarray(i, Math.min(data.length, i + CHUNK_BYTES)));
    }
  } finally {
    handle.close();
  }
}

export function exportFileName(now: number = Date.now()): string {
  return `asistente-ciclismo-${localDateKey(now)}.zip`;
}

/** Arma el ZIP en la caché de la app y devuelve el archivo, listo para compartir o copiar. */
export async function createExportZip(snap: ExportSnapshot, opts: ExportOptions): Promise<File> {
  const now = Date.now();
  const entries = await buildEntries(snap, opts, now);
  const zip = zipStore(entries, now);
  const file = new File(exportDir(), exportFileName(now));
  if (file.exists) file.delete();
  file.create();
  await writeInChunks(file, zip);
  log('info', 'export', `ZIP armado: ${entries.length} archivos, ${Math.round(zip.length / 1024)} KB`);
  return file;
}

/** Abre el menú de compartir (Drive, Quick Share a la PC, Gmail…). */
export async function shareExport(snap: ExportSnapshot, opts: ExportOptions): Promise<string> {
  if (!(await Sharing.isAvailableAsync())) return 'Este teléfono no tiene menú para compartir archivos.';
  const file = await createExportZip(snap, opts);
  await Sharing.shareAsync(file.uri, { mimeType: ZIP_MIME, dialogTitle: 'Exportar mis datos' });
  return 'Listo. Si cerraste el menú sin elegir nada, no se guardó en ningún lado.';
}

/** El selector de carpetas de Android avisa con una excepción cuando lo cerrás sin elegir. */
export function isPickerCancel(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === 'ERR_PICKER_CANCELLED' || (e instanceof Error && /cancel/i.test(e.message));
}

/** Pide una carpeta (por ejemplo una que se vea desde la PC por USB o que sincronice Syncthing). */
export async function pickBackupFolder(initial: string | null): Promise<string | null> {
  try {
    const dir = await Directory.pickDirectoryAsync(initial ?? undefined);
    return dir.uri;
  } catch (e) {
    if (isPickerCancel(e)) return null;
    throw e;
  }
}

/**
 * Copia el ZIP a la carpeta elegida. En SAF no se sobrescribe: se borra el archivo anterior y se
 * crea uno nuevo, porque sobrescribir deja basura al final en algunos proveedores.
 */
export async function saveZipToFolder(folderUri: string, name: string, zip: Uint8Array): Promise<void> {
  const dir = new Directory(folderUri);
  for (const entry of dir.list()) {
    if (entry instanceof File && entry.name === name) entry.delete();
  }
  const file = dir.createFile(name, ZIP_MIME);
  await writeInChunks(file, zip);
}

/** Exporta directo a la carpeta elegida, con la fecha en el nombre. */
export async function exportToFolder(snap: ExportSnapshot, opts: ExportOptions, folderUri: string): Promise<string> {
  const now = Date.now();
  const entries = await buildEntries(snap, opts, now);
  await saveZipToFolder(folderUri, exportFileName(now), zipStore(entries, now));
  return `Guardado en la carpeta elegida como ${exportFileName(now)}.`;
}

const LAST_AUTO_KEY = 'lastAutoBackup';

/**
 * Copia automática: actualiza `asistente-ciclismo-respaldo.zip` en la carpeta elegida, como mucho
 * una vez por hora. Devuelve true si copió.
 */
export async function autoBackupIfDue(snap: ExportSnapshot, now: number = Date.now()): Promise<boolean> {
  const b = snap.settings.backup;
  if (!b.auto || !b.folderUri) return false;
  if (now - loadSetting<number>(LAST_AUTO_KEY, 0) < AUTO_BACKUP_MIN_MS) return false;
  // Se marca antes para que una falla no reintente en cada lectura de la carpeta.
  await saveSetting(LAST_AUTO_KEY, now);
  const entries = await buildEntries(snap, { includePoints: b.includePoints, hideEnds: b.hideEnds }, now);
  await saveZipToFolder(b.folderUri, AUTO_BACKUP_NAME, zipStore(entries, now));
  log('info', 'export', 'Copia automática actualizada');
  return true;
}

/** Lo que se muestra antes de confirmar la importación. */
export interface PendingRestore {
  parsed: Extract<ParsedBackup, { ok: true }>;
  plan: RestorePlan;
}

export type PickResult = { kind: 'cancelled' } | { kind: 'error'; message: string } | { kind: 'ready'; pending: PendingRestore };

/** Elige un archivo (ZIP o respaldo.json), lo valida y calcula qué se va a sumar. No toca la base. */
export async function pickBackupFile(): Promise<PickResult> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/zip', 'application/json', 'application/octet-stream', '*/*'] });
  if (picked.canceled) return { kind: 'cancelled' };
  const file = picked.result;
  const size = file.size ?? 0;
  if (size > BACKUP_MAX_BYTES) return { kind: 'error', message: 'El archivo pesa más de 200 MB: no parece un respaldo.' };
  const data = await file.bytes();
  let text: string;
  if (looksLikeZip(data)) {
    const inner = unzipStore(data).find((e) => e.name === 'respaldo.json');
    if (!inner) return { kind: 'error', message: 'El ZIP no trae respaldo.json.' };
    text = new TextDecoder().decode(inner.data);
  } else {
    text = new TextDecoder().decode(data);
  }
  const parsed = parseBackup(text);
  if (!parsed.ok) return { kind: 'error', message: parsed.error };
  return { kind: 'ready', pending: { parsed, plan: planRestore(readLocalIndex(), parsed.data) } };
}

/** Aplica la importación confirmada. Los ajustes locales de carpetas se conservan. */
export async function restorePending(pending: PendingRestore, current: Settings, restoreSettings: boolean): Promise<string[]> {
  const { plan, parsed } = pending;
  const incoming = parsed.data.settings;
  const settings: Settings | null = restoreSettings
    ? { ...incoming, folderUri: current.folderUri, backup: { ...incoming.backup, folderUri: current.backup.folderUri } }
    : null;
  await applyRestore(plan, { settings, awardsInit: parsed.data.awardsInit });
  log('info', 'export', `Respaldo restaurado: ${plan.rides.length} salida(s) nuevas`);
  return [...plan.rides.map((r) => r.id), ...plan.demUpgrades.map((r) => r.id)];
}
