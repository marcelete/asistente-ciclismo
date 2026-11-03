import type { DailyLoad } from '../load/fitness';

/**
 * Carga por esfuerzo percibido (método de Foster): RPE de 1 a 10 por los minutos de la sesión.
 * Sirve para lo que no tiene frecuencia cardíaca útil, como la fuerza y el core.
 */
export function sessionAu(rpe: number, minutes: number): number {
  return Math.max(0, Math.min(10, rpe)) * Math.max(0, minutes);
}

/** Una hora en el umbral (RPE ≈ 7) vale 100 de hrTSS: 7 × 60 = 420 unidades. */
const AU_PER_HR_TSS = 4.2;

/** Equivalente en hrTSS de una carga por esfuerzo percibido, para sumarla a la carga diaria. */
export function auToTss(au: number): number {
  return au / AU_PER_HR_TSS;
}

export interface OffBikeSession {
  /** Fecha local AAAA-MM-DD. */
  date: string;
  rpe: number;
  minutes: number;
}

/** Cargas diarias de las sesiones fuera de la bici, listas para sumarlas a `dailyLoads`. */
export function offBikeLoads(sessions: OffBikeSession[]): DailyLoad[] {
  return sessions.map((s) => ({ date: s.date, load: Math.round(auToTss(sessionAu(s.rpe, s.minutes)) * 10) / 10 }));
}
