import { ANALYSIS_VERSION } from '../core/analysis/ride';
import type { RideAnalysis } from '../core/analysis/ride';
import { mergeDem } from '../core/elevation/profile';
import type { ProfilePoint } from '../core/elevation/profile';
import type { RideRecord } from '../core/stats/rides';
import { analyzeGpx } from './openTracks';

/** Tope de tamaño de un GPX: una salida larga de OpenTracks pesa pocos MB. */
export const MAX_GPX_BYTES = 50 * 1024 * 1024;

/** Un GPX de la carpeta, que se lee recién cuando hace falta. */
export interface GpxSource {
  name: string;
  /** Bytes. */
  size: number;
  read(): Promise<string>;
}

interface ErrorSink {
  /** Algo salió mal con un archivo; el mensaje no lleva datos personales. */
  onError?(what: string, e?: unknown): void;
}

async function readSource(src: GpxSource, deps: ErrorSink): Promise<string | null> {
  if (src.size > MAX_GPX_BYTES) {
    deps.onError?.(`GPX descartado: pesa ${Math.round(src.size / 1048576)} MB (máximo 50 MB)`);
    return null;
  }
  try {
    return await src.read();
  } catch (e) {
    deps.onError?.('No se pudo leer un GPX', e);
    return null;
  }
}

export interface ImportDeps extends ErrorSink {
  /** Guarda la salida y su perfil si es nueva; devuelve false si ya estaba (mismo id). */
  saveNew(a: RideAnalysis): Promise<boolean>;
  onProgress?(done: number, total: number): void;
}

export interface ImportResult {
  added: RideRecord[];
  /** Archivos dañados, enormes o ilegibles. */
  failed: number;
  /** Archivos sin una salida nueva: vacíos o la misma salida exportada con otro nombre. */
  skipped: number;
}

/**
 * Importa los GPX de a uno: cada archivo se lee, se analiza y se guarda antes de pasar al
 * siguiente, así una primera importación de cientos de salidas no llena la memoria del celular.
 * Un archivo dañado no frena a los demás.
 */
export async function importSources(sources: GpxSource[], deps: ImportDeps): Promise<ImportResult> {
  const added: RideRecord[] = [];
  let failed = 0;
  let skipped = 0;
  for (let i = 0; i < sources.length; i++) {
    deps.onProgress?.(i, sources.length);
    const src = sources[i];
    const text = await readSource(src, deps);
    if (text === null) {
      failed++;
      continue;
    }
    let analysis: RideAnalysis | null;
    try {
      analysis = analyzeGpx(text, src.name);
    } catch (e) {
      failed++;
      deps.onError?.('GPX dañado o incompleto', e);
      continue;
    }
    if (analysis && (await deps.saveNew(analysis))) added.push(analysis.record);
    else skipped++;
  }
  if (sources.length > 0) deps.onProgress?.(sources.length, sources.length);
  return { added, failed, skipped };
}

/** La salida se guardó con un análisis anterior al actual, o le falta el perfil. */
export function needsReanalysis(r: Pick<RideRecord, 'analysis'>, hasProfile: boolean): boolean {
  return r.analysis < ANALYSIS_VERSION || !hasProfile;
}

export interface ReanalyzeDeps extends ErrorSink {
  loadProfile(id: string): ProfilePoint[] | null;
  /** Reemplaza el análisis de una salida ya guardada; la altitud del mapa viene en el perfil. */
  saveReanalysis(a: RideAnalysis, profile: ProfilePoint[]): Promise<void>;
  onProgress?(done: number, total: number): void;
}

/**
 * Recalcula las salidas viejas releyendo su GPX. La altitud del mapa ya consultada se pasa al
 * perfil nuevo, para no volver a mandar esas coordenadas a internet. Si el GPX ya no está en la
 * carpeta, la salida queda como estaba. Devuelve cuántas se recalcularon.
 */
export async function reanalyzeRides(
  rides: { id: string; fileName: string }[],
  sourceByName: Map<string, GpxSource>,
  deps: ReanalyzeDeps,
): Promise<number> {
  let done = 0;
  const todo = rides.filter((r) => sourceByName.has(r.fileName));
  for (let i = 0; i < todo.length; i++) {
    deps.onProgress?.(i, todo.length);
    const r = todo[i];
    const src = sourceByName.get(r.fileName)!;
    const text = await readSource(src, deps);
    if (text === null) continue;
    try {
      const a = analyzeGpx(text, r.fileName);
      if (!a || a.record.id !== r.id) continue;
      await deps.saveReanalysis(a, mergeDem(a.profile, deps.loadProfile(r.id)));
      done++;
    } catch (e) {
      deps.onError?.('No se pudo recalcular una salida', e);
    }
  }
  return done;
}
