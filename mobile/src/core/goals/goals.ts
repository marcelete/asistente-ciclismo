import { daysLeft, elapsedFraction, periodRange, ridesIn } from '../stats/periods';
import type { PeriodRange } from '../stats/periods';
import { rideElevation, rideTime } from '../stats/rides';
import type { RideRecord } from '../stats/rides';

export type GoalPeriod = 'week' | 'month' | 'year';
export type GoalMetric = 'rides' | 'distance' | 'time' | 'elevation';

/** Una meta de volumen. `target` va en unidades base: salidas, metros, segundos o metros. */
export interface Goal {
  id: string;
  period: GoalPeriod;
  metric: GoalMetric;
  target: number;
}

export interface GoalProgress {
  goal: Goal;
  range: PeriodRange;
  value: number;
  /** value / target, puede pasar de 1. */
  fraction: number;
  /** Lo que "debería" llevar a esta altura del período si fuera parejo (target × tiempo transcurrido). */
  expected: number;
  done: boolean;
  /** Va por debajo del ritmo parejo. */
  behind: boolean;
  remaining: number;
  daysLeft: number;
  /**
   * Con cuánto terminarías el período si seguís al mismo ritmo (null al principio del período,
   * cuando todavía no hay ritmo que medir).
   */
  projected: number | null;
  /** Lo que falta por cada día que queda, contando hoy (0 si ya está cumplida). */
  perDay: number;
}

/** Fracción del período a partir de la cual la proyección es razonable. */
const MIN_FRACTION_FOR_PROJECTION = 0.15;

export function metricValue(metric: GoalMetric, rides: RideRecord[], autoPause: boolean): number {
  switch (metric) {
    case 'rides':
      return rides.length;
    case 'distance':
      return rides.reduce((a, r) => a + r.distance, 0);
    case 'time':
      return rides.reduce((a, r) => a + rideTime(r, autoPause), 0);
    case 'elevation':
      return rides.reduce((a, r) => a + rideElevation(r).gain, 0);
  }
}

/** Progreso de una meta en el período que contiene `now`. El tiempo respeta la preferencia de autopausa. */
export function goalProgress(goal: Goal, rides: RideRecord[], now: number, autoPause: boolean): GoalProgress {
  const range = periodRange(goal.period, now);
  const value = metricValue(goal.metric, ridesIn(rides, range), autoPause);
  const elapsed = elapsedFraction(range, now);
  const expected = goal.target * elapsed;
  const done = value >= goal.target;
  const remaining = Math.max(0, goal.target - value);
  const left = daysLeft(range, now);
  return {
    goal,
    range,
    value,
    fraction: goal.target > 0 ? value / goal.target : 1,
    expected,
    done,
    behind: !done && value < expected,
    remaining,
    daysLeft: left,
    projected: elapsed >= MIN_FRACTION_FOR_PROJECTION ? value / elapsed : null,
    perDay: left > 0 ? remaining / left : remaining,
  };
}

/** Metas que pasaron de no cumplidas a cumplidas al agregar salidas nuevas. */
export function newlyCompleted(
  goals: Goal[],
  before: RideRecord[],
  after: RideRecord[],
  now: number,
  autoPause: boolean,
): Goal[] {
  return goals.filter(
    (g) => !goalProgress(g, before, now, autoPause).done && goalProgress(g, after, now, autoPause).done,
  );
}
