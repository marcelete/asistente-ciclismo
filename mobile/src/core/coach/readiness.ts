/** Cómo te sentís hoy, de 1 a 5. En la fatiga, 5 es muy cansado. */
export interface CheckIn {
  sleep: number;
  mood: number;
  fatigue: number;
}

export type ReadinessMode = 'ok' | 'easy' | 'rest';

export interface Readiness {
  mode: ReadinessMode;
  /** De 3 (muy mal) a 15 (muy bien). */
  score: number;
  why: string;
}

const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

export function readinessScore(c: CheckIn): number {
  return clamp(c.sleep) + clamp(c.mood) + (6 - clamp(c.fatigue));
}

/**
 * Qué hacer hoy según cómo te sentís: con 10 o más se hace lo planeado, entre 7 y 9 se baja a zona 2
 * y el 70 % del tiempo, y con 6 o menos se descansa o se hace movilidad (recuperación).
 */
export function readiness(c: CheckIn): Readiness {
  const score = readinessScore(c);
  if (score >= 10) return { mode: 'ok', score, why: 'Te sentís bien: se hace la sesión como está planeada.' };
  if (score >= 7) {
    return { mode: 'easy', score, why: 'Dormiste o te sentís por debajo de lo normal: hoy zona 2 y el 70 % del tiempo (recuperación).' };
  }
  return { mode: 'rest', score, why: 'Hoy tu cuerpo pide descanso: mejor movilidad o nada (supercompensación).' };
}
