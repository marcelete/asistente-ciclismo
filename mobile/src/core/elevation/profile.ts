import { haversineMeters } from '../geo/distance';
import { isValidHr } from '../load/hrStats';
import type { Sample } from '../types';
import { GainAccumulator, smoothMovingAverage } from './gain';

/** Un punto del perfil de una salida, tomado cada pocos metros a lo largo del recorrido. */
export interface ProfilePoint {
  /** Distancia desde el inicio, en metros. */
  d: number;
  lat: number;
  lon: number;
  /** Altitud que registró el GPS (null si el GPX no la trae). */
  gps: number | null;
  /** Altitud del modelo digital de terreno (null mientras no se consultó). */
  dem: number | null;
  /** Segundos desde el inicio de la salida (null en perfiles guardados antes de la 0.4.0). */
  t: number | null;
  /** Frecuencia cardíaca en ese punto (null sin sensor). */
  hr: number | null;
}

export interface ElevationStats {
  gain: number;
  loss: number;
  maxAltitude: number;
  minAltitude: number;
}

/** Velocidad por encima de la cual un tramo entre dos muestras se considera un salto del GPS (m/s). */
const MAX_PLAUSIBLE_SPEED = 28;

/**
 * Reduce una salida a un punto cada `stepM` metros recorridos, interpolando posición y altitud.
 * Con el modelo de terreno de 90 m no hace falta más detalle, y así una salida de 100 km son
 * ~2.000 puntos. Los saltos imposibles del GPS se descartan como en LiveStats.
 */
export function buildProfile(samples: Sample[], stepM = 50): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  let prev: Sample | null = null;
  let dist = 0;
  let next = 0;
  let t0 = 0;
  // Interpola entre dos valores que pueden faltar: si falta uno, vale el otro.
  const mix = (a: number | null, b: number | null, f: number) =>
    a !== null && b !== null ? a + (b - a) * f : (b ?? a);
  const hrOf = (s: Sample) => (isValidHr(s.hr) ? s.hr : null);
  for (const s of samples) {
    if (prev === null) {
      t0 = s.t;
      out.push({ d: 0, lat: s.lat, lon: s.lon, gps: s.alt, dem: null, t: 0, hr: hrOf(s) });
      prev = s;
      next = stepM;
      continue;
    }
    const seg = haversineMeters(prev.lat, prev.lon, s.lat, s.lon);
    const dt = (s.t - prev.t) / 1000;
    if (dt <= 0 || seg / dt > MAX_PLAUSIBLE_SPEED) continue;
    while (seg > 0 && dist + seg >= next) {
      const f = (next - dist) / seg;
      out.push({
        d: next,
        lat: prev.lat + (s.lat - prev.lat) * f,
        lon: prev.lon + (s.lon - prev.lon) * f,
        gps: mix(prev.alt, s.alt, f),
        dem: null,
        t: (prev.t - t0 + (s.t - prev.t) * f) / 1000,
        hr: mix(hrOf(prev), hrOf(s), f),
      });
      next += stepM;
    }
    dist += seg;
    prev = s;
  }
  // El final del recorrido siempre entra, aunque no caiga justo en un múltiplo del paso.
  if (prev && out.length > 0 && dist - out[out.length - 1].d > 1) {
    out.push({ d: dist, lat: prev.lat, lon: prev.lon, gps: prev.alt, dem: null, t: (prev.t - t0) / 1000, hr: hrOf(prev) });
  }
  return out;
}

/**
 * Pasa la altitud del mapa ya consultada de un perfil viejo a uno recién armado (por ejemplo, al
 * releer el GPX de una salida importada con una versión anterior). Los puntos caen en las mismas
 * distancias, así que se emparejan por distancia; lo que no coincide queda para consultar.
 */
export function mergeDem(fresh: ProfilePoint[], old: ProfilePoint[] | null): ProfilePoint[] {
  if (!old || old.length === 0) return fresh;
  const byD = new Map<number, number>();
  for (const p of old) if (p.dem !== null) byD.set(Math.round(p.d), p.dem);
  return fresh.map((p) => (p.dem !== null ? p : { ...p, dem: byD.get(Math.round(p.d)) ?? null }));
}

/**
 * Mediana móvil centrada. Elimina picos angostos sin achatar las subidas: el modelo de terreno
 * es de superficie (incluye edificios, árboles y terraplenes) y al cruzarlos aparecen saltos de
 * 10–30 m en uno o dos puntos que no son parte del camino.
 */
export function medianFilter(values: number[], window: number): number[] {
  if (window <= 1) return values.slice();
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1)).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

/** Limpieza común antes de sumar desnivel: mediana (picos) y después media móvil (ruido). */
function clean(alts: number[], smoothing: number): number[] {
  return smoothMovingAverage(medianFilter(alts, 5), smoothing);
}

/**
 * Desnivel positivo y negativo, y altitudes extremas, de una serie de altitudes a lo largo del
 * recorrido. Cuenta cada subida y cada bajada de la salida (filtro de picos y valles), no solo
 * la diferencia entre el punto más alto y el más bajo.
 *
 * El modelo de terreno casi no tiene ruido, así que alcanza con un suavizado corto y un umbral
 * de 3 m; con la altitud del GPS conviene más suavizado y umbral (los de LiveStats).
 */
export function elevationStats(alts: number[], smoothing = 3, threshold = 3): ElevationStats | null {
  if (alts.length === 0) return null;
  const smooth = clean(alts, smoothing);
  const acc = new GainAccumulator(threshold);
  let maxAltitude = -Infinity;
  let minAltitude = Infinity;
  for (const a of smooth) {
    acc.push(a);
    if (a > maxAltitude) maxAltitude = a;
    if (a < minAltitude) minAltitude = a;
  }
  return { gain: acc.total, loss: acc.totalLoss, maxAltitude, minAltitude };
}

/** Desnivel positivo acumulado en cada punto del perfil, para graficarlo a lo largo del recorrido. */
export function cumulativeGain(alts: number[], smoothing = 3, threshold = 3): number[] {
  const acc = new GainAccumulator(threshold);
  return clean(alts, smoothing).map((a) => {
    acc.push(a);
    return acc.total;
  });
}

/** Altitudes del modelo de terreno, o null si a algún punto le falta. */
export function demAltitudes(points: ProfilePoint[]): number[] | null {
  const out: number[] = [];
  for (const p of points) {
    if (p.dem === null) return null;
    out.push(p.dem);
  }
  return out;
}

/** Parte los puntos en tandas del tamaño máximo que acepta la API de elevación. */
export function chunk<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
