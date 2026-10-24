import { XMLParser } from 'fast-xml-parser';
import type { Sample } from '../types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) => name === 'trk' || name === 'trkseg' || name === 'trkpt',
  // Los GPX de OpenTracks no usan entidades XML; apagarlas cierra la puerta a las bombas de expansión.
  processEntities: false,
  htmlEntities: false,
});

/** Tope de puntos por archivo: ~5 días grabando a 1 Hz. Más que eso no es una salida real. */
export const MAX_TRACK_POINTS = 500_000;

/** Fechas válidas de un punto: desde el 2000 hasta un día en el futuro (relojes mal puestos). */
const MIN_TIME = Date.UTC(2000, 0, 1);
const FUTURE_SLACK_MS = 86400000;

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Busca un valor numérico en las extensiones del punto, a cualquier profundidad. Cubre las
 * variantes v1 y v2 de `TrackPointExtension` de Garmin (que usa OpenTracks), con o sin prefijo.
 */
function findExt(ext: unknown, names: readonly string[]): number | null {
  if (!ext || typeof ext !== 'object') return null;
  for (const [key, value] of Object.entries(ext as Record<string, unknown>)) {
    if (names.includes(key.toLowerCase())) {
      const n = num(value);
      if (n !== null) return n;
    }
    if (typeof value === 'object') {
      const nested = findExt(value, names);
      if (nested !== null) return nested;
    }
  }
  return null;
}

/** Largo máximo del nombre o del tipo de una traza que se guarda. */
const MAX_LABEL_LENGTH = 80;

/** Texto corto y limpio de una etiqueta del GPX (sin caracteres de control), o null si está vacía. */
function label(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const text = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, MAX_LABEL_LENGTH) : null;
}

export interface GpxTrack {
  samples: Sample[];
  /** Nombre de la traza tal como lo guardó el grabador (OpenTracks usa la fecha si no le pusiste uno). */
  name: string | null;
  /** Tipo de actividad: el traducido de OpenTracks si está, si no el de `<type>`. */
  activityType: string | null;
}

type RawTrk = { name?: unknown; type?: unknown; extensions?: Record<string, unknown>; trkseg?: { trkpt?: unknown[] }[] };

/**
 * Lee un archivo GPX y devuelve las muestras de todos los segmentos de todas las trazas en
 * orden. Los puntos sin hora se descartan, porque sin tiempo no hay velocidad ni ritmo.
 * La velocidad y la precisión se leen de las extensiones si existen; si no, quedan en null y
 * se derivan después de las posiciones.
 */
export function parseGpx(xml: string): Sample[] {
  return parseGpxTrack(xml).samples;
}

/** Como `parseGpx`, pero devuelve también el nombre y el tipo de actividad de la primera traza. */
export function parseGpxTrack(xml: string): GpxTrack {
  const doc = parser.parse(xml) as { gpx?: { trk?: RawTrk[] } };
  const out: Sample[] = [];
  const maxTime = Date.now() + FUTURE_SLACK_MS;
  const first = doc.gpx?.trk?.[0];
  const name = label(first?.name);
  const activityType = label(first?.extensions?.typeTranslated) ?? label(first?.type);
  for (const trk of doc.gpx?.trk ?? []) {
    for (const seg of trk.trkseg ?? []) {
      for (const raw of seg.trkpt ?? []) {
        const pt = raw as Record<string, unknown>;
        const lat = num(pt['@_lat']);
        const lon = num(pt['@_lon']);
        const time = typeof pt.time === 'string' ? Date.parse(pt.time) : NaN;
        if (lat === null || lon === null || Number.isNaN(time)) continue;
        if (time < MIN_TIME || time > maxTime || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
        if (out.length >= MAX_TRACK_POINTS) throw new Error(`El GPX tiene más de ${MAX_TRACK_POINTS} puntos`);
        out.push({
          t: time,
          lat,
          lon,
          alt: num(pt.ele),
          speed: findExt(pt.extensions, ['speed']),
          hr: findExt(pt.extensions, ['hr', 'heartrate']),
          acc: findExt(pt.extensions, ['accuracy_horizontal', 'hacc', 'accuracy']),
        });
      }
    }
  }
  return { samples: out, name, activityType };
}

/** Genera un GPX 1.1 a partir de muestras (con FC en la extensión de Garmin). */
export function toGpx(samples: Sample[], name = 'Salida', type?: string): string {
  const clean = (s: string) => s.replace(/[<>&"']/g, '');
  const pts = samples
    .map((s) => {
      const ele = s.alt !== null ? `<ele>${s.alt.toFixed(1)}</ele>` : '';
      const hr =
        s.hr !== null
          ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${Math.round(s.hr)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`
          : '';
      return `<trkpt lat="${s.lat.toFixed(7)}" lon="${s.lon.toFixed(7)}">${ele}<time>${new Date(s.t).toISOString()}</time>${hr}</trkpt>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<gpx version="1.1" creator="Asistente Ciclismo" xmlns="http://www.topografix.com/GPX/1/1" ` +
    `xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">` +
    `<trk><name>${clean(name)}</name>${type ? `<type>${clean(type)}</type>` : ''}<trkseg>${pts}</trkseg></trk></gpx>`
  );
}
