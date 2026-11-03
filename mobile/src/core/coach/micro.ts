import { planWeek } from '../plan/rules';
import type { SessionKind, WeekPlan } from '../plan/rules';
import { addDays, dateKey } from './dates';
import { mesoAt, weekStart, weeksToEvent } from './periodization';
import { capVolume } from './progression';
import { sessionAu, auToTss } from './srpe';
import type { Block, CoachSession, Emphasis, Level, Macrocycle, Microcycle, MicroKind, WorkoutDef, WorkoutKind } from './types';
import type { TrainSport } from '../stats/sport';
import { blocksMinutes, candidates, testWorkoutId, workoutById } from './workouts';
import { zoneOf } from './zones';

/** Carga por hora de cada tipo de sesión (hrTSS/h): el mismo orden de magnitud que usa `planWeek`. */
const LOAD_PER_HOUR: Record<WorkoutKind, number> = {
  recovery: 30,
  endurance: 50,
  long: 55,
  tempo: 70,
  steady: 65,
  threshold: 85,
  vo2: 90,
  climb: 80,
  sprint: 60,
  test: 85,
  opener: 50,
  strength: 0,
  core: 0,
  mobility: 0,
};

const HARD: WorkoutKind[] = ['tempo', 'steady', 'threshold', 'vo2', 'climb', 'sprint', 'long', 'test'];

/** Esfuerzo percibido típico de cada sesión de afuera, para su carga prevista. */
const OFF_RPE: Partial<Record<WorkoutKind, number>> = { strength: 6, core: 5, mobility: 3 };

const PHASE: Record<MicroKind, WeekPlan['phase']> = {
  ajuste: 'maintain',
  carga: 'build',
  impacto: 'build',
  recuperacion: 'recover',
  activacion: 'taper',
  competencia: 'taper',
};

const MICRO_TITLE: Record<MicroKind, string> = {
  ajuste: 'ajuste',
  carga: 'carga',
  impacto: 'impacto',
  recuperacion: 'recuperación',
  activacion: 'activación',
  competencia: 'competencia',
};

/** Qué tipos de sesión usa cada tipo de salida del planificador semanal, según el énfasis del bloque. */
function kindsFor(session: SessionKind, emphasis: Emphasis): WorkoutKind[] {
  if (session === 'long') return ['long'];
  if (session === 'recovery') return ['recovery'];
  if (session === 'endurance') return emphasis === 'especifico' ? ['steady', 'endurance'] : ['endurance'];
  const table: Record<Emphasis, WorkoutKind[]> = {
    base: ['tempo'],
    fuerza: ['climb'],
    umbral: ['threshold'],
    vo2: session === 'intervals' ? ['vo2'] : ['threshold'],
    especifico: ['steady', 'threshold'],
    afinar: session === 'intervals' ? ['sprint', 'vo2'] : ['tempo'],
    regenerar: ['endurance'],
  };
  return table[emphasis];
}

export interface MicroInput {
  macro: Macrocycle;
  /** Semana (desde 0) dentro del macrociclo. */
  week: number;
  ctl: number;
  atl: number;
  /** Minutos disponibles cada día, 0 = lunes … 6 = domingo. */
  minutesByDay: number[];
  /** Incluir sesiones de fuerza, core y movilidad. */
  offBike: boolean;
  /** Minutos de la última semana de carga, para limitar el crecimiento. */
  prevLoadMinutes: number | null;
}

const MIN_SESSION = 20;
const round5 = (n: number) => Math.round(n / 5) * 5;

function mainZone(blocks: Block[], sport: TrainSport): number {
  let best: Block | null = null;
  for (const b of blocks) if (b.role === 'work' && (!best || b.durationSec > best.durationSec)) best = b;
  return best ? zoneOf(best.intensity, sport) : 0;
}

/** Deporte del plan: los guardados antes del pedido 15 son de bici. */
export const macroSport = (macro: Macrocycle): TrainSport => macro.sport ?? 'bike';

/**
 * Correr: tope de minutos por sesión según el nivel (el impacto se tolera de a poco). La larga
 * tiene su propio tope; en bici no hay más tope que el tiempo disponible.
 */
function runCap(level: Level, long: boolean): number {
  if (long) return level === 0 ? 75 : level === 1 ? 110 : 150;
  return level === 0 ? 50 : level === 1 ? 70 : 90;
}

/** Velocidad típica del evento si no se sabe más: 22 km/h en bici y 10 km/h corriendo (6:00 por km). */
const EVENT_KMH: Record<TrainSport, number> = { bike: 22, run: 10 };

function bikeLoad(w: WorkoutDef, minutes: number): number {
  return Math.round((LOAD_PER_HOUR[w.kind] * minutes) / 60);
}

function offLoad(w: WorkoutDef, minutes: number): number {
  return Math.round(auToTss(sessionAu(OFF_RPE[w.kind] ?? 4, minutes)));
}

function pick(kinds: WorkoutKind[], level: Level, minutes: number, rotation: number, sport: TrainSport): WorkoutDef {
  let list = candidates(kinds, level, minutes, sport);
  if (list.length === 0) list = candidates(['endurance'], level, minutes, sport);
  if (list.length === 0) list = candidates(['endurance'], level, 999, sport);
  if (list.length === 0) list = candidates(['endurance'], 0, 999, sport);
  return list[rotation % list.length];
}

function toSession(macro: Macrocycle, week: number, day: number, w: WorkoutDef, minutes: number): CoachSession {
  const capped = w.where === 'run' ? Math.min(minutes, runCap(macro.level, w.kind === 'long')) : minutes;
  const clamped = Math.max(Math.min(capped, w.maxMin), Math.min(w.minMin, capped));
  const blocks = w.build(clamped);
  return {
    date: dateKey(addDays(weekStart(macro, week), day)),
    day,
    workoutId: w.id,
    name: w.name,
    kind: w.kind,
    where: w.where,
    durationMin: Math.round(w.where === 'off' ? clamped : blocksMinutes(blocks)),
    targetLoad: w.where === 'off' ? offLoad(w, clamped) : bikeLoad(w, clamped),
    preparations: w.preparations,
    zone: w.where === 'off' ? 0 : mainZone(blocks, w.where === 'run' ? 'run' : 'bike'),
  };
}

function eventSession(macro: Macrocycle, week: number, day: number): CoachSession {
  const sport = macroSport(macro);
  const minutes = macro.eventKm ? Math.round((macro.eventKm / EVENT_KMH[sport]) * 60) : sport === 'run' ? 60 : 180;
  return {
    date: dateKey(addDays(weekStart(macro, week), day)),
    day,
    workoutId: 'event',
    name: sport === 'run' ? 'Carrera' : 'Evento',
    kind: 'event',
    where: sport,
    durationMin: minutes,
    targetLoad: Math.round((55 * minutes) / 60),
    preparations: ['fisica', 'tactica', 'psicologica'],
    zone: 3,
  };
}

/** Semana de entrenamiento: reparte la carga con `planWeek` y arma cada día con la biblioteca de sesiones. */
export function planMicrocycle(i: MicroInput): Microcycle | null {
  const { macro, week } = i;
  const sport = macroSport(macro);
  const activity = sport === 'run' ? 'carrera' : 'salida';
  const meso = mesoAt(macro, week);
  if (!meso) return null;
  const idx = week - meso.startWeek;
  let kind = meso.micros[idx];
  const why: string[] = [];
  const base = {
    week,
    startT: weekStart(macro, week),
    mesoIndex: meso.index,
    mesoKind: meso.kind,
    emphasis: meso.emphasis,
  };

  const days = i.minutesByDay.map((m, d) => (m >= MIN_SESSION ? d : -1)).filter((d) => d >= 0);
  if (days.length === 0) {
    return { ...base, kind, targetLoad: 0, sessions: [], why: ['No indicaste días con tiempo disponible: sumalos para recibir sesiones.'] };
  }

  // Los días de fuerza, core y movilidad se reservan antes de repartir la bici: los primeros de la semana,
  // así el día siguiente es una salida suave y no una sesión dura.
  const light = kind === 'recuperacion' || kind === 'activacion' || kind === 'competencia';
  const offCount = i.offBike && days.length >= 3 ? (macro.level >= 1 && !light && days.length >= 6 ? 2 : 1) : 0;
  const offDays = days.slice(0, offCount);
  const bikeDays = days.slice(offCount);

  const tsb = i.ctl - i.atl;
  let phase = PHASE[kind];
  if (phase === 'build' && tsb < -25) {
    phase = 'recover';
    why.push(`Tu forma está en ${Math.round(tsb)} (mucha fatiga): esta semana descarga en lugar de cargar (recuperación y supercompensación).`);
  }
  why.push(`Semana de ${MICRO_TITLE[kind]} del bloque ${meso.kind} (periodización).`);

  const plan = planWeek({
    ctl: i.ctl,
    atl: i.atl,
    goal: macro.goal,
    availableDays: bikeDays,
    hoursPerWeek: i.minutesByDay.reduce((s, m, d) => s + (bikeDays.includes(d) ? m : 0), 0) / 60,
    weeksToEvent: weeksToEvent(macro, week) ?? undefined,
    maxRamp: macro.level === 0 ? 3 : kind === 'impacto' ? 5 : 4,
    phaseOverride: phase,
  });

  let sessionPlan = plan.sessions.map((s) => ({ ...s, durationMin: Math.min(s.durationMin, i.minutesByDay[s.day]) }));

  if (phase === 'build') {
    const total = sessionPlan.reduce((s, x) => s + x.durationMin, 0);
    const cap = capVolume(i.prevLoadMinutes, total);
    if (cap.capped) {
      const k = cap.minutes / total;
      sessionPlan = sessionPlan.map((s) => ({ ...s, durationMin: Math.max(MIN_SESSION, round5(s.durationMin * k)) }));
      why.push('El volumen sube como máximo un 10 % sobre la semana de carga anterior (progresión).');
    }
  }

  const sessions: CoachSession[] = [];
  const isEventWeek = kind === 'competencia' && macro.eventT !== null;
  const eventDay = isEventWeek ? (new Date(macro.eventT as number).getDay() + 6) % 7 : -1;

  for (const [n, s] of sessionPlan.entries()) {
    if (isEventWeek && Math.abs(s.day - eventDay) <= 1) continue;
    if (isEventWeek && s.day > eventDay) continue;
    const short = isEventWeek ? Math.min(s.durationMin, 40) : s.durationMin;
    const kinds: WorkoutKind[] = isEventWeek || kind === 'activacion' ? (n === sessionPlan.length - 2 ? ['opener'] : ['endurance']) : kindsFor(s.kind, meso.emphasis);
    sessions.push(toSession(macro, week, s.day, pick(kinds, macro.level, short, week + n, sport), short));
  }
  if (isEventWeek) {
    sessions.push(eventSession(macro, week, eventDay));
    why.push(
      `Esta semana se compite: pocas ${activity === 'carrera' ? 'carreras' : 'salidas'} cortas y suaves, y el evento (táctica: ritmo parejo y guardar para el final).`,
    );
  }

  // Test al empezar cada bloque (individualización): 20 minutos en bici, 30 corriendo. Reemplaza una sesión que no es larga.
  const testable = kind === 'ajuste' || kind === 'carga' || kind === 'impacto';
  if (idx === 0 && testable && meso.kind !== 'competitivo') {
    // El test es duro: reemplaza una sesión dura y, si no hay, una suave que no quede pegada a otra dura.
    const fits = (s: CoachSession) => s.where === sport && s.kind !== 'long' && s.kind !== 'event' && i.minutesByDay[s.day] >= (sport === 'run' ? 45 : 50);
    const isHard = (s: CoachSession) => HARD.includes(s.kind as WorkoutKind);
    const nextToHard = (s: CoachSession) => sessions.some((o) => o !== s && isHard(o) && Math.abs(o.day - s.day) === 1);
    let slot = sessions.findIndex((s) => fits(s) && isHard(s));
    if (slot < 0) slot = sessions.findIndex((s) => fits(s) && !nextToHard(s));
    const test = workoutById(testWorkoutId(sport));
    if (slot >= 0 && test) {
      sessions[slot] = toSession(macro, week, sessions[slot].day, test, Math.min(75, i.minutesByDay[sessions[slot].day]));
      why.push(
        `Test de ${sport === 'run' ? 30 : 20} minutos al empezar el bloque: sirve para ajustar tus zonas a tu nivel actual (individualización).`,
      );
    }
  }

  // Correr, principiantes: nunca dos días seguidos corriendo, para que huesos y tendones asimilen el impacto.
  if (sport === 'run' && macro.level === 0) {
    sessions.sort((a, b) => a.day - b.day);
    let removed = 0;
    for (let k = 1; k < sessions.length; k++) {
      const prev = sessions[k - 1];
      const cur = sessions[k];
      if (prev.where !== 'run' || cur.where !== 'run' || cur.day - prev.day !== 1) continue;
      // Se saca la que no es el evento ni la larga.
      const drop = cur.kind === 'event' || cur.kind === 'long' ? k - 1 : k;
      if (sessions[drop].kind === 'event') continue;
      sessions.splice(drop, 1);
      removed++;
      k--;
    }
    if (removed > 0) why.push('Recién empezás a correr: entre carrera y carrera queda un día sin impacto (recuperación y progresión).');
  }

  if (meso.emphasis === 'base' && kind !== 'recuperacion') {
    why.push('Bloque de base: casi todo en zonas 1 y 2 y solo un poco de ritmo firme (distribución 80/20, especificidad).');
  }

  addOffBike(sessions, macro, week, light, offDays, eventDay, i.minutesByDay, why);
  sessions.sort((a, b) => a.day - b.day);

  const targetLoad = sessions.reduce((s, x) => s + x.targetLoad, 0);
  return { ...base, kind: phase === 'recover' && PHASE[kind] === 'build' ? 'recuperacion' : kind, targetLoad, sessions, why };
}

function addOffBike(
  sessions: CoachSession[],
  macro: Macrocycle,
  week: number,
  light: boolean,
  offDays: number[],
  eventDay: number,
  minutesByDay: number[],
  why: string[],
) {
  const rotation: string[] = light ? ['movilidad'] : ['fuerza-piernas', 'core-estabilidad', 'movilidad'];
  let added = 0;
  for (const [n, day] of offDays.entries()) {
    // Nada de fuerza el día del evento ni el anterior.
    if (eventDay >= 0 && (day === eventDay || day === eventDay - 1)) continue;
    const w = workoutById(rotation[(week + n) % rotation.length]);
    if (!w) continue;
    sessions.push(toSession(macro, week, day, w, Math.min(w.maxMin, minutesByDay[day], light ? 20 : 35)));
    added++;
  }
  if (added > 0) {
    why.push(
      macroSport(macro) === 'run'
        ? 'Fuerza, core y movilidad en días sin carrera: piernas y tendones más fuertes previenen lesiones (preparación física).'
        : 'Fuerza, core y movilidad en días sin salida y antes de una salida suave (preparación física).',
    );
  }
}
