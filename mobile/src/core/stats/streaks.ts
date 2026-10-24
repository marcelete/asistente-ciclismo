import { periodStart, shiftPeriodStart } from './periods';
import type { RideRecord } from './rides';

export interface Streak {
  /** Períodos seguidos con al menos una salida, terminando en el actual o en el anterior. */
  current: number;
  /** La racha más larga del historial. */
  best: number;
  /** Ya hay salida en el período actual (hoy, o esta semana). */
  doneThisPeriod: boolean;
}

/**
 * Racha de días o de semanas con al menos una salida. La racha actual sigue viva mientras el
 * período actual no terminó: si ayer saliste y hoy todavía no, la racha cuenta hasta ayer.
 */
export function streak(rides: RideRecord[], kind: 'day' | 'week', now: number): Streak {
  const keys = new Set<number>();
  for (const r of rides) if (r.startT <= now) keys.add(periodStart(kind, r.startT));
  const sorted = [...keys].sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of sorted) {
    run = prev !== null && shiftPeriodStart(kind, prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }

  const thisPeriod = periodStart(kind, now);
  const doneThisPeriod = keys.has(thisPeriod);
  let current = 0;
  let k = doneThisPeriod ? thisPeriod : shiftPeriodStart(kind, thisPeriod, -1);
  while (keys.has(k)) {
    current++;
    k = shiftPeriodStart(kind, k, -1);
  }
  return { current, best, doneThisPeriod };
}
