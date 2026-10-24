/**
 * Planificador semanal por reglas. Decide cuánta carga y qué tipo de sesiones tocan a partir de
 * tu forma actual (CTL/ATL/TSB), el objetivo y la disponibilidad. Los textos finales de cada
 * sesión salen de plantillas (o de un LLM opcional); acá solo se decide la estructura.
 */

export type SessionKind = 'recovery' | 'endurance' | 'tempo' | 'intervals' | 'long';
export type PlanGoal = 'endurance' | 'climbing' | 'general' | 'event';

export interface PlanInput {
  ctl: number;
  atl: number;
  goal: PlanGoal;
  /** Días de la semana disponibles para entrenar, 0 = lunes … 6 = domingo. */
  availableDays: number[];
  /** Horas totales disponibles en la semana. */
  hoursPerWeek: number;
  /** Semanas que faltan para el evento objetivo (solo si goal = 'event'). */
  weeksToEvent?: number;
  /** Aumento semanal máximo de CTL que se acepta (puntos por semana). */
  maxRamp?: number;
}

export interface PlannedSession {
  day: number;
  kind: SessionKind;
  durationMin: number;
  /** Carga estimada de la sesión (hrTSS). */
  targetLoad: number;
  /** Zona de FC principal (1 a 5). */
  zone: number;
}

export interface WeekPlan {
  /** Carga total prevista de la semana (suma de las sesiones, hrTSS). */
  targetLoad: number;
  phase: 'build' | 'maintain' | 'recover' | 'taper';
  sessions: PlannedSession[];
  notes: string[];
}

/** Carga por hora típica de cada tipo de sesión (hrTSS/h). */
const LOAD_PER_HOUR: Record<SessionKind, number> = {
  recovery: 30,
  endurance: 50,
  long: 55,
  tempo: 70,
  intervals: 85,
};

const ZONE: Record<SessionKind, number> = { recovery: 1, endurance: 2, long: 2, tempo: 3, intervals: 4 };

/** Peso relativo de cada tipo de sesión al repartir la carga de la semana. */
const WEIGHT: Record<SessionKind, number> = { recovery: 0.6, endurance: 1, long: 1.8, tempo: 1.2, intervals: 1.1 };

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

function choosePhase(i: PlanInput): WeekPlan['phase'] {
  if (i.goal === 'event' && i.weeksToEvent !== undefined && i.weeksToEvent <= 1) return 'taper';
  const tsb = i.ctl - i.atl;
  if (tsb < -25) return 'recover';
  if (tsb < -10) return 'maintain';
  return 'build';
}

/** Tipos de sesión para `n` días: la larga al final, las duras separadas por días suaves. */
function chooseKinds(n: number, phase: WeekPlan['phase'], goal: PlanGoal): SessionKind[] {
  const easy: SessionKind = phase === 'recover' ? 'recovery' : 'endurance';
  const kinds: SessionKind[] = new Array<SessionKind>(n).fill(easy);
  kinds[n - 1] = phase === 'recover' ? 'endurance' : 'long';
  if (phase === 'build' && n >= 3) {
    const hard: SessionKind = goal === 'climbing' ? 'intervals' : 'tempo';
    for (const slot of n >= 5 ? [1, 3] : [1]) if (slot < n - 1) kinds[slot] = hard;
  }
  return kinds;
}

export function planWeek(input: PlanInput): WeekPlan {
  const days = [...new Set(input.availableDays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  const notes: string[] = [];
  if (days.length === 0) {
    return { targetLoad: 0, phase: 'maintain', sessions: [], notes: ['No indicaste días disponibles.'] };
  }

  const phase = choosePhase(input);
  // En régimen estable una semana equivale a 7·CTL de carga; subir el CTL `ramp` puntos por
  // semana pide ~7·ramp de carga adicional.
  let target = input.ctl * 7;
  if (phase === 'build') target += (input.maxRamp ?? 5) * 7;
  if (phase === 'recover') target *= 0.6;
  if (phase === 'taper') target *= 0.5;
  target = Math.max(target, days.length * 20);

  const kinds = chooseKinds(days.length, phase, input.goal);
  const totalWeight = kinds.reduce((s, k) => s + WEIGHT[k], 0);
  const sessions: PlannedSession[] = days.map((day, idx) => {
    const kind = kinds[idx];
    const load = (target * WEIGHT[kind]) / totalWeight;
    const durationMin = Math.max(30, roundTo5((load / LOAD_PER_HOUR[kind]) * 60));
    return { day, kind, durationMin, targetLoad: 0, zone: ZONE[kind] };
  });

  // El tiempo disponible manda: si las sesiones no entran en las horas, se acortan todas.
  const totalMin = sessions.reduce((s, x) => s + x.durationMin, 0);
  if (totalMin > input.hoursPerWeek * 60) {
    const k = (input.hoursPerWeek * 60) / totalMin;
    for (const s of sessions) s.durationMin = Math.max(20, roundTo5(s.durationMin * k));
    notes.push('Se acortaron las sesiones para respetar las horas disponibles.');
  }
  for (const s of sessions) s.targetLoad = Math.round((LOAD_PER_HOUR[s.kind] * s.durationMin) / 60);

  if (phase === 'recover') notes.push('Tu forma está muy baja (fatiga alta): semana de recuperación.');
  if (phase === 'taper') notes.push('Semana previa al evento: menos volumen para llegar fresco.');
  return {
    targetLoad: sessions.reduce((s, x) => s + x.targetLoad, 0),
    phase,
    sessions,
    notes,
  };
}
