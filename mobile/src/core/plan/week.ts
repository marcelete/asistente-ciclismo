import { computeFitness } from '../load/fitness';
import type { DailyLoad } from '../load/fitness';
import type { HrProfile } from '../load/hr';
import { dailyLoads, localDateKey } from '../load/training';
import type { HrHistogram } from '../load/hrStats';
import { periodStart } from '../stats/periods';
import { planWeek } from './rules';
import type { PlanGoal, PlannedSession, WeekPlan } from './rules';

/** Carga por hora que se supone cuando no hay frecuencia cardíaca. */
export const ESTIMATED_TSS_PER_HOUR = 50;

const DAY_MS = 86_400_000;

/** Días de entrenamiento (0 = lunes) para `n` días por semana; el último, el fin de semana, es el largo. */
export function daysFor(n: number): number[] {
  const presets: Record<number, number[]> = {
    1: [5],
    2: [1, 5],
    3: [1, 3, 5],
    4: [0, 2, 4, 5],
    5: [0, 1, 3, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return presets[Math.min(7, Math.max(1, Math.round(n)))];
}

export interface PlanRide {
  startT: number;
  movingSec: number;
  hrHist: HrHistogram | null;
}

export interface PlanSession extends PlannedSession {
  /** Fecha local AAAA-MM-DD de la sesión. */
  date: string;
  /** Ese día hubo una salida en bici. */
  done: boolean;
}

export interface WeeklyPlan {
  weekStart: number;
  plan: WeekPlan;
  sessions: PlanSession[];
  ctl: number;
  atl: number;
  /** La carga se estimó por horas porque no hay frecuencia cardíaca. */
  estimatedLoad: boolean;
}

/**
 * Plan de la semana en curso. Usa CTL y ATL al domingo anterior, así el plan no cambia durante la
 * semana. Sin FC, supone ~50 de carga por hora en movimiento y lo avisa.
 */
export function weeklyPlan(input: {
  rides: PlanRide[];
  goal: PlanGoal;
  days: number;
  hoursPerWeek: number;
  eventDate: string | null;
  hr: HrProfile | null;
  now: number;
}): WeeklyPlan {
  const { rides, hr, now } = input;
  const weekStart = periodStart('week', now);
  const sundayBefore = weekStart - DAY_MS;

  let loads: DailyLoad[] = hr ? dailyLoads(rides, hr) : [];
  const estimatedLoad = loads.length === 0;
  if (estimatedLoad) {
    loads = rides.filter((r) => r.movingSec > 0).map((r) => ({ date: localDateKey(r.startT), load: (r.movingSec / 3600) * ESTIMATED_TSS_PER_HOUR }));
  }
  loads = loads.filter((l) => l.date <= localDateKey(sundayBefore));
  const series = loads.length > 0 ? computeFitness(loads, { untilDate: localDateKey(sundayBefore) }) : [];
  const last = series[series.length - 1];
  const ctl = last ? last.ctl : 0;
  const atl = last ? last.atl : 0;

  let weeksToEvent: number | undefined;
  if (input.goal === 'event' && input.eventDate) {
    const ev = Date.parse(`${input.eventDate}T12:00:00`);
    if (Number.isFinite(ev)) weeksToEvent = Math.max(0, Math.ceil((ev - weekStart) / (7 * DAY_MS)));
  }

  const plan = planWeek({
    ctl,
    atl,
    goal: input.goal,
    availableDays: daysFor(input.days),
    hoursPerWeek: input.hoursPerWeek,
    weeksToEvent,
  });

  const rideDays = new Set(rides.map((r) => localDateKey(r.startT)));
  const sessions: PlanSession[] = plan.sessions.map((s) => {
    const date = localDateKey(weekStart + s.day * DAY_MS + DAY_MS / 2);
    return { ...s, date, done: rideDays.has(date) };
  });
  return { weekStart, plan, sessions, ctl, atl, estimatedLoad };
}
