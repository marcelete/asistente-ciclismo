import { computeFitness } from '../load/fitness';
import type { DailyLoad } from '../load/fitness';
import type { HrProfile } from '../load/hr';
import type { HrHistogram } from '../load/hrStats';
import { dailyLoads, localDateKey } from '../load/training';
import { ESTIMATED_TSS_PER_HOUR } from '../plan/week';
import type { PlanGoal } from '../plan/rules';
import type { TrainSport } from '../stats/sport';
import { addDays, dateKey, mondayOf, weekIndex } from './dates';
import { planMicrocycle } from './micro';
import { buildMacrocycle } from './periodization';
import { assessLevel, projectCtl } from './progression';
import type { Level, Macrocycle, Microcycle } from './types';

/** Lo mínimo que se necesita de una salida para calcular la forma y el volumen. */
export interface CoachRide {
  startT: number;
  movingSec: number;
  hrHist: HrHistogram | null;
}

export interface Fitness {
  ctl: number;
  atl: number;
  /** La carga se estimó por horas porque no hay frecuencia cardíaca. */
  estimated: boolean;
}

const DAY_MS = 86_400_000;

/** CTL y ATL al cierre del día anterior a `beforeT` (el plan de una semana no cambia durante la semana). */
export function fitnessBefore(rides: CoachRide[], hr: HrProfile | null, extra: DailyLoad[], beforeT: number): Fitness {
  let loads: DailyLoad[] = hr ? dailyLoads(rides, hr) : [];
  const estimated = loads.length === 0;
  if (estimated) {
    loads = rides.filter((r) => r.movingSec > 0).map((r) => ({ date: localDateKey(r.startT), load: (r.movingSec / 3600) * ESTIMATED_TSS_PER_HOUR }));
  }
  const until = localDateKey(beforeT - DAY_MS);
  loads = [...loads, ...extra].filter((l) => l.date <= until);
  const series = loads.length > 0 ? computeFitness(loads, { untilDate: until }) : [];
  const last = series[series.length - 1];
  return { ctl: last ? last.ctl : 0, atl: last ? last.atl : 0, estimated };
}

/** Horas por semana en bici de las últimas `weeks` semanas antes de `now`. */
export function avgHoursPerWeek(rides: CoachRide[], now: number, weeks = 8): number {
  const from = now - weeks * 7 * DAY_MS;
  return rides.filter((r) => r.startT >= from && r.startT < now).reduce((s, r) => s + r.movingSec, 0) / 3600 / weeks;
}

/** Nivel de la persona a partir de lo que viene haciendo. */
export function levelFromRides(rides: CoachRide[], hr: HrProfile | null, extra: DailyLoad[], now: number): Level {
  const f = fitnessBefore(rides, hr, extra, now);
  return assessLevel(f.ctl, avgHoursPerWeek(rides, now));
}

/** El pico de minutos en bici de las últimas `weeks` semanas completas antes de `weekStartT`, o `null` si no hubo. */
export function recentPeakMinutes(rides: CoachRide[], weekStartT: number, weeks = 3): number | null {
  let peak = 0;
  for (let w = 1; w <= weeks; w++) {
    const from = addDays(weekStartT, -7 * w);
    const to = addDays(weekStartT, -7 * (w - 1));
    const min = rides.filter((r) => r.startT >= from && r.startT < to).reduce((s, r) => s + r.movingSec, 0) / 60;
    peak = Math.max(peak, min);
  }
  return peak > 0 ? Math.round(peak) : null;
}

export interface CoachConfig {
  /** Deporte del plan (pedido 15); bici si falta. */
  sport?: TrainSport;
  goal: PlanGoal;
  eventDate: string | null;
  eventKm: number | null;
  minutesByDay: number[];
  offBike: boolean;
}

/** Arma y devuelve el macrociclo desde hoy, con el evento solo si es futuro. */
export function createMacro(cfg: CoachConfig, level: Level, now: number): Macrocycle {
  const eventT = cfg.eventDate ? Date.parse(`${cfg.eventDate}T12:00:00`) : NaN;
  return buildMacrocycle({
    startT: mondayOf(now),
    sport: cfg.sport ?? 'bike',
    goal: cfg.goal,
    level,
    eventT: Number.isFinite(eventT) && eventT >= mondayOf(now) ? eventT : null,
    eventKm: cfg.eventKm,
  });
}

/** Semana del macrociclo en que cae `now`, o `null` si todavía no empezó o ya terminó. */
export function currentWeekOf(macro: Macrocycle, now: number): number | null {
  const w = weekIndex(macro.startT, now);
  return w >= 0 && w < macro.totalWeeks ? w : null;
}

/** La semana en curso, planificada con tu forma al inicio de la semana. */
export function thisWeek(macro: Macrocycle, cfg: CoachConfig, rides: CoachRide[], hr: HrProfile | null, extra: DailyLoad[], now: number): { micro: Microcycle; fitness: Fitness } | null {
  const week = currentWeekOf(macro, now);
  if (week === null) return null;
  const start = addDays(macro.startT, week * 7);
  const fitness = fitnessBefore(rides, hr, extra, start);
  const micro = planMicrocycle({
    macro,
    week,
    ctl: fitness.ctl,
    atl: fitness.atl,
    minutesByDay: cfg.minutesByDay,
    offBike: cfg.offBike,
    prevLoadMinutes: recentPeakMinutes(rides, start),
  });
  return micro ? { micro, fitness } : null;
}

/**
 * Proyección de las semanas `from` a `to` (incluida): cada una parte del CTL esperado después de la
 * anterior, suponiendo que se cumple el plan y llegás descansado. Sirve para ver el mes, el trimestre y el año.
 */
export function projectPlan(macro: Macrocycle, cfg: CoachConfig, from: number, to: number, start: Fitness): Microcycle[] {
  const out: Microcycle[] = [];
  let ctl = start.ctl;
  let prevMinutes: number | null = null;
  for (let w = Math.max(0, from); w <= Math.min(to, macro.totalWeeks - 1); w++) {
    const micro = planMicrocycle({ macro, week: w, ctl, atl: ctl, minutesByDay: cfg.minutesByDay, offBike: cfg.offBike, prevLoadMinutes: prevMinutes });
    if (!micro) break;
    out.push(micro);
    ctl = projectCtl(ctl, micro.targetLoad);
    // Solo los minutos del deporte (la fuerza y la movilidad no cuentan para el tope de volumen).
    const sportMin = micro.sessions.filter((s) => s.where !== 'off').reduce((sum, s) => sum + s.durationMin, 0);
    if (micro.kind === 'carga' || micro.kind === 'impacto') prevMinutes = sportMin;
  }
  return out;
}

/** Etiqueta corta de una semana ("7 dic") para los gráficos. */
export function weekLabel(startT: number): string {
  const d = new Date(startT);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Hoy en AAAA-MM-DD, para buscar la sesión del día. */
export const todayKey = (now: number): string => dateKey(now);
