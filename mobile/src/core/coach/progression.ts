import { CTL_DAYS } from '../load/fitness';
import type { Level } from './types';

/** Subida máxima de la carga diaria sobre tu CTL en una semana de carga (el `maxRamp` del plan semanal). */
export const MAX_RAMP = 5;
/** Tope de aumento de volumen entre dos semanas de carga. */
export const MAX_VOLUME_GROWTH = 0.1;
/** Cuánto baja la carga en una semana de recuperación respecto de lo que venías haciendo. */
export const DELOAD_FACTOR = 0.6;

/** Nivel de la persona según lo que viene haciendo: CTL actual y horas semanales de las últimas 8 semanas. */
export function assessLevel(ctl: number, avgHoursPerWeek: number): Level {
  if (ctl >= 60 || avgHoursPerWeek >= 8) return 2;
  if (ctl >= 30 || avgHoursPerWeek >= 4) return 1;
  return 0;
}

/** Semanas de carga seguidas antes de una de recuperación: 3:1, o 2:1 si recién empezás. */
export function loadWeeksBeforeRecovery(level: Level): number {
  return level === 0 ? 2 : 3;
}

/** CTL esperado después de una semana con esa carga total (media móvil exponencial de 42 días). */
export function projectCtl(ctl: number, weeklyLoad: number): number {
  const daily = weeklyLoad / 7;
  return daily + (ctl - daily) * Math.exp(-7 / CTL_DAYS);
}

/** Recorta los minutos de la semana para no crecer más del tope respecto de la semana de carga anterior. */
export function capVolume(prevMinutes: number | null, minutes: number): { minutes: number; capped: boolean } {
  if (prevMinutes === null || prevMinutes <= 0) return { minutes, capped: false };
  const max = Math.round(prevMinutes * (1 + MAX_VOLUME_GROWTH));
  return minutes > max ? { minutes: max, capped: true } : { minutes, capped: false };
}

export type ContinuityAction = 'seguir' | 'ajuste' | 'retroceder' | 'reiniciar';

export interface Continuity {
  action: ContinuityAction;
  /** Mesociclos que hay que retroceder. */
  mesosBack: number;
  why: string | null;
}

/** Qué hacer según los días sin entrenar: 7 a 13 → semana de ajuste, 14 a 27 → un mesociclo atrás, 28 o más → reiniciar la base. */
export function continuity(daysWithoutRide: number): Continuity {
  if (daysWithoutRide >= 28) {
    return { action: 'reiniciar', mesosBack: 0, why: `Pasaron ${daysWithoutRide} días sin entrenar: se reinicia la base (continuidad).` };
  }
  if (daysWithoutRide >= 14) {
    return { action: 'retroceder', mesosBack: 1, why: `Pasaron ${daysWithoutRide} días sin entrenar: se retrocede un bloque (continuidad).` };
  }
  if (daysWithoutRide >= 7) {
    return { action: 'ajuste', mesosBack: 0, why: `Pasaron ${daysWithoutRide} días sin entrenar: vuelve una semana de ajuste (continuidad).` };
  }
  return { action: 'seguir', mesosBack: 0, why: null };
}
