import type { Sample } from '../types';

/** Generador pseudoaleatorio determinista (mulberry32), para pruebas repetibles. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Número aleatorio con distribución normal (Box-Muller). */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SyntheticRideOptions {
  /** Duración en segundos. */
  durationSec: number;
  /** Velocidad en m/s: constante, o función del tiempo en segundos. */
  speed: number | ((tSec: number) => number);
  /** Altitud verdadera en metros en función de la distancia recorrida. */
  altitudeAt?: (distanceM: number) => number;
  /** Ruido gaussiano (desvío estándar) de la altitud, en metros. */
  altNoise?: number;
  /** Ruido gaussiano de la posición, en metros. */
  posNoise?: number;
  /** FC constante o función del tiempo en segundos. */
  hr?: number | ((tSec: number) => number) | null;
  startLat?: number;
  startLon?: number;
  startT?: number;
  seed?: number;
}

/**
 * Genera una salida sintética en línea recta hacia el este a 1 Hz. Sirve de dato de prueba y
 * para el modo simulación de la app.
 */
export function syntheticRide(opts: SyntheticRideOptions): Sample[] {
  const rand = seededRandom(opts.seed ?? 1);
  const lat0 = opts.startLat ?? -34.6;
  const lon0 = opts.startLon ?? -58.4;
  const t0 = opts.startT ?? Date.UTC(2026, 9, 18, 12, 0, 0);
  const mPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const mPerDegLat = 110574;
  const out: Sample[] = [];
  let dist = 0;
  for (let i = 0; i <= opts.durationSec; i++) {
    const v = typeof opts.speed === 'function' ? opts.speed(i) : opts.speed;
    if (i > 0) dist += v;
    const noiseE = (opts.posNoise ?? 0) * gaussian(rand);
    const noiseN = (opts.posNoise ?? 0) * gaussian(rand);
    const alt = opts.altitudeAt ? opts.altitudeAt(dist) + (opts.altNoise ?? 0) * gaussian(rand) : null;
    const hr = typeof opts.hr === 'function' ? opts.hr(i) : (opts.hr ?? null);
    out.push({
      t: t0 + i * 1000,
      lat: lat0 + noiseN / mPerDegLat,
      lon: lon0 + (dist + noiseE) / mPerDegLon,
      alt,
      speed: v,
      hr,
      acc: 5,
    });
  }
  return out;
}
