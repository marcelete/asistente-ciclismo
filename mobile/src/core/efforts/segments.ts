import { LocalProjection, cumulativeLengths, projectOnPolyline } from '../geo/polyline';
import type { LatLon } from '../geo/polyline';
import type { Sample } from '../types';

export interface Segment {
  id: string;
  name: string;
  /** Trazado del segmento, de inicio a fin. */
  points: LatLon[];
}

export interface SegmentEffort {
  startIndex: number;
  endIndex: number;
  startT: number;
  endT: number;
  durationSec: number;
  /** Largo del segmento recorrido, en metros. */
  distance: number;
  avgSpeed: number;
  avgHr: number | null;
}

export interface SegmentMatchOptions {
  /** Distancia máxima al trazado para considerarse "sobre" el segmento, en metros. */
  tolerance: number;
  /** Cuánto antes del inicio / después del final se acepta, en metros. */
  endpointSlack: number;
  /** Retroceso máximo permitido por ruido de GPS, en metros. */
  backtrack: number;
}

export const DEFAULT_SEGMENT_OPTIONS: SegmentMatchOptions = {
  tolerance: 25,
  endpointSlack: 30,
  backtrack: 25,
};

/**
 * Busca las pasadas completas de un segmento dentro de una salida. Una pasada empieza cerca del
 * inicio del segmento, avanza sin salirse del trazado y termina cerca del final.
 *
 * El tiempo exacto de cruce del inicio y del final se estima con la velocidad local de avance
 * sobre el trazado, así no depende de que haya una muestra justo en esos puntos.
 */
export function findSegmentEfforts(
  track: Sample[],
  segment: Segment,
  options: Partial<SegmentMatchOptions> = {},
): SegmentEffort[] {
  const o = { ...DEFAULT_SEGMENT_OPTIONS, ...options };
  if (segment.points.length < 2 || track.length < 2) return [];

  const proj = new LocalProjection(segment.points[0].lat, segment.points[0].lon);
  const seg = segment.points.map((p) => proj.toXY(p));
  const cum = cumulativeLengths(seg);
  const length = cum[cum.length - 1];

  const progress = track.map((s) => {
    const r = projectOnPolyline(proj.toXY(s), seg, cum);
    return r.distance <= o.tolerance ? r.along : null;
  });

  /** Velocidad de avance sobre el trazado entre las muestras a y b (m/ms), o null. */
  const advance = (a: number, b: number): number | null => {
    const pa = progress[a];
    const pb = progress[b];
    const dt = track[b].t - track[a].t;
    if (pa === null || pb === null || dt <= 0 || pb <= pa) return null;
    return (pb - pa) / dt;
  };

  const efforts: SegmentEffort[] = [];
  let i = 0;
  while (i < track.length) {
    const p = progress[i];
    if (p === null || p > o.endpointSlack) {
      i++;
      continue;
    }
    let last = p;
    let j = i + 1;
    let finished = false;
    while (j < track.length) {
      const q = progress[j];
      if (q === null || q < last - o.backtrack) break;
      last = Math.max(last, q);
      if (last >= length - o.endpointSlack) {
        finished = true;
        break;
      }
      j++;
    }
    if (finished) {
      const vStart = advance(i, Math.min(i + 1, j));
      const vEnd = advance(Math.max(j - 1, i), j);
      const startT = track[i].t - (vStart ? (p ?? 0) / vStart : 0);
      const endT = track[j].t + (vEnd ? (length - (progress[j] ?? length)) / vEnd : 0);
      const dur = (endT - startT) / 1000;
      if (dur > 0) {
        const hrs = track
          .slice(i, j + 1)
          .map((s) => s.hr)
          .filter((h): h is number => h !== null);
        efforts.push({
          startIndex: i,
          endIndex: j,
          startT,
          endT,
          durationSec: dur,
          distance: length,
          avgSpeed: length / dur,
          avgHr: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null,
        });
      }
      i = j + 1;
    } else {
      i = Math.max(j, i + 1);
    }
  }
  return efforts;
}
