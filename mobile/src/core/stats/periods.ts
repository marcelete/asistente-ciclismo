import { histogramSeconds } from '../load/hrStats';
import { rideElevation } from './rides';
import type { RideRecord } from './rides';

/**
 * Períodos de calendario en hora local. La semana empieza el lunes. Los rangos son semiabiertos:
 * [start, end).
 */
export type PeriodKind = 'day' | 'week' | 'month' | 'year';

export interface PeriodRange {
  kind: PeriodKind;
  start: number;
  end: number;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** 0 = lunes … 6 = domingo. */
export function weekdayMondayFirst(t: number): number {
  return (new Date(t).getDay() + 6) % 7;
}

export function periodStart(kind: PeriodKind, t: number): number {
  const d = new Date(t);
  switch (kind) {
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case 'week':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekdayMondayFirst(t)).getTime();
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    case 'year':
      return new Date(d.getFullYear(), 0, 1).getTime();
  }
}

/** Corre el inicio de un período `n` períodos (negativo = hacia atrás). Respeta los cambios de horario. */
export function shiftPeriodStart(kind: PeriodKind, start: number, n: number): number {
  const d = new Date(start);
  switch (kind) {
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
    case 'week':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n).getTime();
    case 'month':
      return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
    case 'year':
      return new Date(d.getFullYear() + n, 0, 1).getTime();
  }
}

/** El período que contiene `t`, corrido `offset` períodos (−1 = el anterior). */
export function periodRange(kind: PeriodKind, t: number, offset = 0): PeriodRange {
  const start = shiftPeriodStart(kind, periodStart(kind, t), offset);
  return { kind, start, end: shiftPeriodStart(kind, start, 1) };
}

/** Fracción del período ya transcurrida en el instante `t` (0 a 1). */
export function elapsedFraction(range: PeriodRange, t: number): number {
  if (t <= range.start) return 0;
  if (t >= range.end) return 1;
  return (t - range.start) / (range.end - range.start);
}

/** Días calendario completos que quedan en el período, contando el de `t`. */
export function daysLeft(range: PeriodRange, t: number): number {
  if (t >= range.end) return 0;
  let n = 0;
  for (let d = periodStart('day', Math.max(t, range.start)); d < range.end; d = shiftPeriodStart('day', d, 1)) n++;
  return n;
}

function dm(t: number): string {
  const d = new Date(t);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Nombre corto del período en español ("lunes 19/10/2026", "13/10 al 19/10/2026", "octubre de 2026", "2026"). */
export function periodLabel(range: PeriodRange): string {
  const d = new Date(range.start);
  switch (range.kind) {
    case 'day':
      return `${WEEKDAYS[d.getDay()]} ${dm(range.start)}/${d.getFullYear()}`;
    case 'week': {
      const last = shiftPeriodStart('day', range.end, -1);
      return `${dm(range.start)} al ${dm(last)}/${new Date(last).getFullYear()}`;
    }
    case 'month':
      return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
    case 'year':
      return String(d.getFullYear());
  }
}

export interface Totals {
  rides: number;
  distance: number;
  elapsedSec: number;
  movingSec: number;
  elevationGain: number;
  elevationLoss: number;
  /** Mayor desnivel positivo en una sola salida. */
  maxRideGain: number;
  /** Altitud más alta alcanzada en el período. */
  maxAltitude: number | null;
  longestDistance: number;
  /** Mayor tiempo en movimiento en una sola salida, en segundos. */
  longestMovingSec: number;
  maxSpeed: number;
  /** Días distintos con al menos una salida. */
  activeDays: number;
  /** FC media de las salidas con sensor, ponderada por el tiempo con dato (null si ninguna tiene). */
  avgHr: number | null;
  maxHr: number | null;
}

export const EMPTY_TOTALS: Totals = {
  rides: 0,
  distance: 0,
  elapsedSec: 0,
  movingSec: 0,
  elevationGain: 0,
  elevationLoss: 0,
  maxRideGain: 0,
  maxAltitude: null,
  longestDistance: 0,
  longestMovingSec: 0,
  maxSpeed: 0,
  activeDays: 0,
  avgHr: null,
  maxHr: null,
};

/** Una salida pertenece al período en el que empezó. */
export function ridesIn(rides: RideRecord[], range: Pick<PeriodRange, 'start' | 'end'>): RideRecord[] {
  return rides.filter((r) => r.startT >= range.start && r.startT < range.end);
}

export function totals(rides: RideRecord[]): Totals {
  const t = { ...EMPTY_TOTALS };
  const days = new Set<number>();
  let hrWeighted = 0;
  let hrSec = 0;
  for (const r of rides) {
    const e = rideElevation(r);
    t.rides++;
    t.distance += r.distance;
    t.elapsedSec += r.elapsedSec;
    t.movingSec += r.movingSec;
    t.elevationGain += e.gain;
    t.elevationLoss += e.loss;
    t.maxRideGain = Math.max(t.maxRideGain, e.gain);
    if (e.maxAltitude !== null && (t.maxAltitude === null || e.maxAltitude > t.maxAltitude)) t.maxAltitude = e.maxAltitude;
    t.longestDistance = Math.max(t.longestDistance, r.distance);
    t.longestMovingSec = Math.max(t.longestMovingSec, r.movingSec);
    t.maxSpeed = Math.max(t.maxSpeed, r.maxSpeed);
    days.add(periodStart('day', r.startT));
    if (r.avgHr !== null) {
      // Sin histograma (no debería pasar) la salida pesa su tiempo en movimiento.
      const sec = r.hrHist ? histogramSeconds(r.hrHist) : r.movingSec;
      hrWeighted += r.avgHr * sec;
      hrSec += sec;
    }
    if (r.maxHr !== null && (t.maxHr === null || r.maxHr > t.maxHr)) t.maxHr = r.maxHr;
  }
  t.activeDays = days.size;
  t.avgHr = hrSec > 0 ? hrWeighted / hrSec : null;
  return t;
}

export interface Bucket {
  /** Etiqueta corta para el eje ("L", "12", "Oct"). */
  label: string;
  start: number;
  end: number;
  rides: number;
  distance: number;
  movingSec: number;
  elapsedSec: number;
  elevationGain: number;
}

const WEEK_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTH_LABELS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/**
 * Reparto del período para el gráfico de barras: los 7 días de la semana, los días del mes o los
 * 12 meses del año. Un día no se reparte (devuelve un arreglo vacío).
 */
export function periodBuckets(rides: RideRecord[], range: PeriodRange): Bucket[] {
  if (range.kind === 'day') return [];
  const step: PeriodKind = range.kind === 'year' ? 'month' : 'day';
  const out: Bucket[] = [];
  for (let s = range.start, i = 0; s < range.end; s = shiftPeriodStart(step, s, 1), i++) {
    const e = shiftPeriodStart(step, s, 1);
    const label =
      range.kind === 'week' ? WEEK_LABELS[i] : range.kind === 'year' ? MONTH_LABELS[i] : String(new Date(s).getDate());
    out.push({ label, start: s, end: e, rides: 0, distance: 0, movingSec: 0, elapsedSec: 0, elevationGain: 0 });
  }
  for (const r of ridesIn(rides, range)) {
    const b = out.find((x) => r.startT >= x.start && r.startT < x.end);
    if (!b) continue;
    b.rides++;
    b.distance += r.distance;
    b.movingSec += r.movingSec;
    b.elapsedSec += r.elapsedSec;
    b.elevationGain += rideElevation(r).gain;
  }
  return out;
}

/** Nombre del mes en español ("octubre"). */
export function monthName(month: number): string {
  return MONTHS[month];
}

export function totalsIn(rides: RideRecord[], range: PeriodRange): Totals {
  return totals(ridesIn(rides, range));
}

/** Cantidad de salidas de hoy, de esta semana, de este mes y de este año. */
export function rideCounts(rides: RideRecord[], now: number): Record<PeriodKind, number> {
  const kinds: PeriodKind[] = ['day', 'week', 'month', 'year'];
  const out = {} as Record<PeriodKind, number>;
  for (const k of kinds) out[k] = ridesIn(rides, periodRange(k, now)).length;
  return out;
}
