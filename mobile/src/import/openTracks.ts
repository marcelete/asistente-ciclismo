import { analyzeActivity } from '../core/analysis/ride';
import type { ActivityInput, RideAnalysis } from '../core/analysis/ride';
import { parseGpxTrack } from '../core/io/gpx';

/** Una salida leída de un GPX, todavía sin analizar. */
export type ImportedActivity = ActivityInput;

/** Convierte el texto de un GPX de OpenTracks en una actividad, o null si no tiene datos usables. */
export function parseOpenTracksGpx(text: string, fileName: string): ImportedActivity | null {
  const track = parseGpxTrack(text);
  const { samples } = track;
  if (samples.length < 2) return null;
  const startT = samples[0].t;
  return {
    // Identificador estable: la misma salida exportada dos veces no se importa dos veces.
    id: `gpx:${startT}`,
    fileName,
    startT,
    endT: samples[samples.length - 1].t,
    samples,
    name: track.name,
    activityType: track.activityType,
  };
}

/** Lee y analiza un GPX. Lanza si el archivo está dañado; devuelve null si no tiene una salida. */
export function analyzeGpx(text: string, fileName: string): RideAnalysis | null {
  const act = parseOpenTracksGpx(text, fileName);
  return act ? analyzeActivity(act) : null;
}

/**
 * Procesa varios archivos ya leídos: descarta los que no sirven y los repetidos (mismo inicio), y
 * devuelve las salidas más recientes primero. Un archivo dañado (por ejemplo, a medio exportar)
 * no frena a los demás: se informa en `onError` y se sigue con el próximo.
 */
export function importFiles(
  files: { name: string; text: string }[],
  onError?: (name: string, error: unknown) => void,
): RideAnalysis[] {
  const byId = new Map<string, RideAnalysis>();
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.gpx')) continue;
    try {
      const a = analyzeGpx(f.text, f.name);
      if (a && !byId.has(a.record.id)) byId.set(a.record.id, a);
    } catch (e) {
      onError?.(f.name, e);
    }
  }
  return [...byId.values()].sort((a, b) => b.record.startT - a.record.startT);
}
