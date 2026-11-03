import { hrZoneRanges } from '../load/hr';
import type { HrProfile } from '../load/hr';
import type { PowerParams } from '../power/model';
import { solveSpeed } from '../power/solve';
import type { Intensity, Target } from './types';

/** Lo que se sabe de la persona para convertir lo relativo en números. Todo puede faltar. */
export interface ZoneContext {
  hr: HrProfile | null;
  /** Potencia de umbral estimada (W). */
  ftp: number | null;
  /** Masa, rodadura y arrastre de la bici elegida. */
  params: PowerParams | null;
  /** Deporte de la sesión; bici si falta. */
  sport?: 'bike' | 'run';
  /** Correr: velocidad de umbral (la que sostenés una hora), en km/h. */
  thresholdKmh?: number | null;
  /** Correr: banda de pasos por minuto para la técnica. */
  cadence?: { min: number; max: number } | null;
}

/**
 * Correr: fracción de la velocidad de umbral de cada zona. Corriendo, la potencia es casi
 * proporcional a la velocidad en llano, así que el umbral se toma sobre la velocidad.
 */
export const ZONE_RUN: Record<number, [number, number]> = {
  1: [0.65, 0.78],
  2: [0.78, 0.88],
  3: [0.88, 0.95],
  4: [0.95, 1.02],
  5: [1.02, 1.15],
};

/** Banda de pasos por minuto si no hay una en los ajustes. */
export const DEFAULT_CADENCE = { min: 165, max: 185 } as const;

function zoneForRunFraction(f: number): 1 | 2 | 3 | 4 | 5 {
  for (const z of [5, 4, 3, 2] as const) if (f >= ZONE_RUN[z][0] - 0.005) return z;
  return 1;
}

/** Fracción del FTP que corresponde a cada zona (modelo de 5 zonas de Coggan simplificado). */
export const ZONE_FTP: Record<number, [number, number]> = {
  1: [0.4, 0.55],
  2: [0.56, 0.75],
  3: [0.76, 0.9],
  4: [0.91, 1.05],
  5: [1.06, 1.2],
};

/** Esfuerzo percibido típico de cada zona. */
export const ZONE_RPE: Record<number, [number, number]> = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
  4: [7, 8],
  5: [9, 10],
};

/** FTP estimado a partir del mejor promedio de 20 minutos (el 95 %). */
export function ftpFromTwentyMin(watts: number | null): number | null {
  return watts !== null && watts > 0 ? Math.round(watts * 0.95) : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Al correr, una décima de km/h son unos 3 s por km: el ritmo se guarda con dos decimales. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Velocidad en llano (km/h) que da esa potencia con la bici y el peso de la persona. */
export function flatSpeedKmh(params: PowerParams, watts: number): number {
  return round1(solveSpeed(params, watts, 0) * 3.6);
}

function zoneForFtpFraction(f: number): 1 | 2 | 3 | 4 | 5 {
  for (const z of [5, 4, 3, 2] as const) if (f >= ZONE_FTP[z][0] - 0.005) return z;
  return 1;
}

function rpeTarget(min: number, max: number): Target {
  return { kind: 'rpe', min, max, unit: '/10' };
}

/**
 * Baja un esfuerzo relativo a números de la persona. Prefiere la velocidad en llano si se conoce
 * el FTP y la bici, después la FC y por último el esfuerzo percibido. `null` si el bloque es libre.
 */
export function resolveTarget(i: Intensity, ctx: ZoneContext): Target | null {
  if (i.type === 'free') return null;
  if (i.type === 'rpe') return rpeTarget(i.min, i.max);
  if (i.type === 'cadence') {
    const c = ctx.cadence ?? DEFAULT_CADENCE;
    return { kind: 'cadence', min: c.min, max: c.max, unit: 'ppm' };
  }
  if (ctx.sport === 'run') return resolveRun(i, ctx);

  const [lo, hi] = i.type === 'zone' ? ZONE_FTP[i.zone] : [i.min, i.max];
  if (ctx.ftp !== null && ctx.params) {
    return { kind: 'speed', min: flatSpeedKmh(ctx.params, lo * ctx.ftp), max: flatSpeedKmh(ctx.params, hi * ctx.ftp), unit: 'km/h' };
  }
  const zone = i.type === 'zone' ? i.zone : zoneForFtpFraction((lo + hi) / 2);
  if (ctx.hr) {
    const r = hrZoneRanges(ctx.hr).find((x) => x.zone === zone);
    if (r) return { kind: 'hr', min: r.min, max: r.max, unit: 'lpm' };
  }
  if (ctx.ftp !== null) return { kind: 'power', min: Math.round(lo * ctx.ftp), max: Math.round(hi * ctx.ftp), unit: 'W' };
  const [a, b] = ZONE_RPE[zone];
  return rpeTarget(a, b);
}

/**
 * Correr: ritmo si se conoce la velocidad de umbral, si no la FC y por último el esfuerzo
 * percibido. La velocidad va en km/h con unidad `min/km`, para mostrarla como ritmo.
 */
function resolveRun(i: Exclude<Intensity, { type: 'free' | 'rpe' | 'cadence' }>, ctx: ZoneContext): Target {
  const [lo, hi] = i.type === 'zone' ? ZONE_RUN[i.zone] : [i.min, i.max];
  const thr = ctx.thresholdKmh ?? null;
  if (thr !== null && thr > 0) return { kind: 'speed', min: round2(lo * thr), max: round2(hi * thr), unit: 'min/km' };
  const zone = i.type === 'zone' ? i.zone : zoneForRunFraction((lo + hi) / 2);
  if (ctx.hr) {
    const r = hrZoneRanges(ctx.hr).find((x) => x.zone === zone);
    if (r) return { kind: 'hr', min: r.min, max: r.max, unit: 'lpm' };
  }
  const [a, b] = ZONE_RPE[zone];
  return rpeTarget(a, b);
}

/** Segundos por km de una velocidad en km/h. */
export const paceSecOf = (kmh: number) => (kmh > 0 ? 3600 / kmh : Infinity);

/** Banda para sostener un ritmo (correr): el ritmo más o menos la tolerancia, en km/h con unidad `min/km`. */
export function steadyPaceTarget(paceSec: number, tolSec = 10): Target {
  const p = Math.max(150, paceSec);
  return { kind: 'speed', min: round2(3600 / (p + tolSec)), max: round2(3600 / Math.max(60, p - tolSec)), unit: 'min/km' };
}

/** Banda para sostener una velocidad: el centro más o menos la tolerancia (por defecto 1 km/h). */
export function steadyTarget(centerKmh: number, tolKmh = 1): Target {
  return { kind: 'speed', min: round1(Math.max(0, centerKmh - tolKmh)), max: round1(centerKmh + tolKmh), unit: 'km/h' };
}

/** Zona de FC de 1 a 5 de una intensidad, 0 si es libre. */
export function zoneOf(i: Intensity, sport: 'bike' | 'run' = 'bike'): number {
  if (i.type === 'free') return 0;
  if (i.type === 'cadence') return 2;
  if (i.type === 'zone') return i.zone;
  if (i.type === 'ftp') return sport === 'run' ? zoneForRunFraction((i.min + i.max) / 2) : zoneForFtpFraction((i.min + i.max) / 2);
  const mid = (i.min + i.max) / 2;
  return mid >= 9 ? 5 : mid >= 7 ? 4 : mid >= 5 ? 3 : mid >= 3 ? 2 : 1;
}
