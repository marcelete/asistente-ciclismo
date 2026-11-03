import { DELOAD_FACTOR } from './progression';
import { weekCompliance } from './compliance';
import type { SessionResult } from './compliance';

export type WeekAction = 'avanzar' | 'repetir' | 'aliviar' | 'recuperar';

export interface WeekReview {
  compliance: number;
  action: WeekAction;
  /** Cuánto se escala la carga de la semana siguiente respecto de lo previsto. */
  loadFactor: number;
  /** Por qué, citando el principio. */
  why: string[];
}

/**
 * Revisión de la semana que terminó: compara lo previsto con lo hecho y con tu forma (TSB), y decide
 * cómo sigue la próxima. Con mucha fatiga recupera, con poco cumplimiento repite o alivia, y si
 * cumpliste y estás fresco avanza como estaba previsto.
 */
export function reviewWeek(results: SessionResult[], tsb: number): WeekReview {
  const compliance = weekCompliance(results);
  const pct = Math.round(compliance * 100);

  if (tsb < -25) {
    return {
      compliance,
      action: 'recuperar',
      loadFactor: DELOAD_FACTOR,
      why: [`Tu forma está en ${Math.round(tsb)}: la fatiga acumulada pide una semana de recuperación antes de seguir (recuperación y supercompensación).`],
    };
  }
  if (compliance < 0.5) {
    return {
      compliance,
      action: 'aliviar',
      loadFactor: 0.8,
      why: [`Cumpliste el ${pct} % de lo previsto: la próxima semana baja un 20 % para volver a la rutina sin forzar (individualización).`],
    };
  }
  if (compliance < 0.8) {
    return {
      compliance,
      action: 'repetir',
      loadFactor: 0.95,
      why: [`Cumpliste el ${pct} % de lo previsto: se repite una carga parecida antes de subir (progresión).`],
    };
  }
  return {
    compliance,
    action: 'avanzar',
    loadFactor: 1,
    why: [`Cumpliste el ${pct} % de lo previsto y tu forma está bien: la carga sigue la progresión del plan (sobrecarga).`],
  };
}
