import type { PlanGoal } from '../plan/rules';
import type { TrainSport } from '../stats/sport';
import { addDays, weekIndex } from './dates';
import { loadWeeksBeforeRecovery } from './progression';
import type { Emphasis, Level, Macrocycle, MesoKind, Mesocycle, MicroKind, PeriodKind } from './types';

/** Semanas del macrociclo cuando no hay evento: un año. */
export const YEAR_WEEKS = 52;
/** Un trimestre: el bloque de trabajo cuando no hay evento. */
export const QUARTER_WEEKS = 12;

export interface MacroInput {
  /** Lunes a las 00:00 locales de la primera semana. */
  startT: number;
  /** Deporte del plan; bici si falta. */
  sport?: TrainSport;
  goal: PlanGoal;
  level: Level;
  eventT?: number | null;
  eventKm?: number | null;
}

/** Parte `weeks` en mesociclos de 3 a 6 semanas, de unas 4 en lo posible. */
export function splitWeeks(weeks: number): number[] {
  if (weeks <= 0) return [];
  if (weeks <= 6) return [weeks];
  const parts = Math.round(weeks / 4);
  const base = Math.floor(weeks / parts);
  const extra = weeks - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Microciclos de un mesociclo: semanas de carga y una de recuperación al final (3:1, o 2:1 si recién
 * empezás). La última semana de carga de un bloque desarrollador es de impacto.
 */
function microsFor(kind: MesoKind, weeks: number, level: Level, first: boolean): MicroKind[] {
  if (kind === 'recuperacion') return Array<MicroKind>(weeks).fill('recuperacion');
  const k = loadWeeksBeforeRecovery(level);
  const out: MicroKind[] = [];
  let loads = 0;
  for (let i = 0; i < weeks; i++) {
    if (i === 0 && (first || kind === 'introductorio')) {
      out.push('ajuste');
    } else if (loads >= k) {
      out.push('recuperacion');
      loads = 0;
    } else {
      out.push('carga');
      loads++;
    }
  }
  // Un bloque de 3 semanas o más siempre cierra descargando; si no, queda como estaba.
  if (weeks >= 3 && out[weeks - 1] !== 'recuperacion') out[weeks - 1] = 'recuperacion';
  if (kind === 'desarrollador' && weeks >= 4) {
    const lastLoad = out.lastIndexOf('carga');
    if (lastLoad > 0) out[lastLoad] = 'impacto';
  }
  return out;
}

function emphasisFor(kind: MesoKind, period: PeriodKind, goal: PlanGoal, level: Level, indexInPeriod: number): Emphasis {
  if (kind === 'recuperacion') return 'regenerar';
  if (kind === 'competitivo') return 'afinar';
  if (kind === 'precompetitivo') return 'especifico';
  if (period === 'general' || kind === 'introductorio') return 'base';
  // Período especial: primero la capacidad que pide el objetivo, después se estabiliza con más intensidad.
  if (kind === 'estabilizador') return level >= 1 ? 'vo2' : 'umbral';
  if (goal === 'climbing') return indexInPeriod % 2 === 0 ? 'fuerza' : 'umbral';
  return 'umbral';
}

interface PeriodSpec {
  period: PeriodKind;
  weeks: number;
}

function mesoKindFor(period: PeriodKind, indexInPeriod: number, level: Level, firstOfAll: boolean): MesoKind {
  switch (period) {
    case 'general':
      return indexInPeriod === 0 && (level === 0 || firstOfAll) ? 'introductorio' : 'desarrollador';
    case 'especial':
      return indexInPeriod % 2 === 0 ? 'desarrollador' : 'estabilizador';
    case 'competitivo':
      return 'competitivo';
    case 'transicion':
      return 'recuperacion';
  }
}

/** Reparte las semanas antes del evento: general ~45 %, especial ~30 %, el resto precompetitivo y el afinamiento. */
function eventPeriods(weeksBefore: number): { general: number; especial: number; precompetitivo: number; taper: number } {
  const taper = weeksBefore >= 10 ? 2 : weeksBefore >= 2 ? 1 : 0;
  let general = Math.round(weeksBefore * 0.45);
  let especial = Math.round(weeksBefore * 0.3);
  let precompetitivo = weeksBefore - taper - general - especial;
  if (precompetitivo < 0) {
    especial += precompetitivo;
    precompetitivo = 0;
    if (especial < 0) {
      general += especial;
      especial = 0;
    }
  }
  return { general, especial, precompetitivo, taper };
}

/**
 * Arma el macrociclo: con evento va del inicio hasta el evento más una semana de transición
 * (general → especial → precompetitivo → afinamiento → competencia); sin evento son 52 semanas en
 * trimestres de 12 (mitad general, mitad especial) con una transición al final.
 */
export function buildMacrocycle(input: MacroInput): Macrocycle {
  const { startT, goal, level } = input;
  const eventWeekRaw = input.eventT ? weekIndex(startT, input.eventT) : null;
  const hasEvent = eventWeekRaw !== null && eventWeekRaw >= 0;
  const eventWeek = hasEvent ? eventWeekRaw : null;

  const specs: PeriodSpec[] = [];
  let taper = 0;
  let totalWeeks: number;
  if (eventWeek !== null) {
    const p = eventPeriods(eventWeek);
    taper = p.taper;
    specs.push({ period: 'general', weeks: p.general }, { period: 'especial', weeks: p.especial });
    specs.push({ period: 'competitivo', weeks: p.precompetitivo }); // precompetitivo
    totalWeeks = eventWeek + 2;
  } else {
    const quarters = Math.floor((YEAR_WEEKS - 4) / QUARTER_WEEKS);
    for (let q = 0; q < quarters; q++) {
      const general = level === 0 ? 8 : 6;
      specs.push({ period: 'general', weeks: general }, { period: 'especial', weeks: QUARTER_WEEKS - general });
    }
    specs.push({ period: 'transicion', weeks: YEAR_WEEKS - quarters * QUARTER_WEEKS });
    totalWeeks = YEAR_WEEKS;
  }

  const mesocycles: Mesocycle[] = [];
  let week = 0;
  const counters: Partial<Record<PeriodKind, number>> = {};
  const push = (kind: MesoKind, period: PeriodKind, weeks: number, micros?: MicroKind[]) => {
    const idx = counters[period] ?? 0;
    counters[period] = idx + 1;
    mesocycles.push({
      index: mesocycles.length,
      kind,
      period,
      emphasis: emphasisFor(kind, period, goal, level, idx),
      startWeek: week,
      weeks,
      micros: micros ?? microsFor(kind, weeks, level, mesocycles.length === 0),
    });
    week += weeks;
  };

  for (const spec of specs) {
    // En un macrociclo con evento, el período "competitivo" de esta lista es el precompetitivo.
    const precomp = eventWeek !== null && spec.period === 'competitivo';
    for (const [i, w] of splitWeeks(spec.weeks).entries()) {
      const kind = precomp ? 'precompetitivo' : mesoKindFor(spec.period, i, level, mesocycles.length === 0);
      push(kind, spec.period, w);
    }
  }

  if (eventWeek !== null) {
    // Afinamiento y evento: 'activación' y después 'competencia'.
    const micros: MicroKind[] = [...Array<MicroKind>(taper).fill('activacion'), 'competencia'];
    push('competitivo', 'competitivo', micros.length, micros);
    push('recuperacion', 'transicion', 1);
  }

  return {
    startT,
    totalWeeks: Math.max(totalWeeks, week),
    sport: input.sport ?? 'bike',
    goal,
    level,
    eventT: input.eventT ?? null,
    eventKm: input.eventKm ?? null,
    eventWeek,
    mesocycles,
  };
}

/** El mesociclo que contiene esa semana, o `null` si el macrociclo ya terminó o no empezó. */
export function mesoAt(macro: Macrocycle, week: number): Mesocycle | null {
  return macro.mesocycles.find((m) => week >= m.startWeek && week < m.startWeek + m.weeks) ?? null;
}

export function microAt(macro: Macrocycle, week: number): MicroKind | null {
  const m = mesoAt(macro, week);
  return m ? m.micros[week - m.startWeek] : null;
}

/** Semanas que faltan para el evento desde la semana `week` (0 si es esa), o `null` sin evento. */
export function weeksToEvent(macro: Macrocycle, week: number): number | null {
  return macro.eventWeek === null ? null : Math.max(0, macro.eventWeek - week);
}

/** Lunes de la semana `week` del macrociclo. */
export function weekStart(macro: Macrocycle, week: number): number {
  return addDays(macro.startT, week * 7);
}
