import type { PlanGoal } from '../plan/rules';
import type { TrainSport } from '../stats/sport';

/** Dónde se hace una sesión: en la bici, corriendo o fuera (fuerza, core, movilidad). */
export type WorkoutWhere = 'bike' | 'run' | 'off';

/** Las cinco preparaciones del deportista. */
export type Preparation = 'fisica' | 'tecnica' | 'tactica' | 'psicologica' | 'teorica';

/** 0 = principiante, 1 = intermedio, 2 = avanzado. */
export type Level = 0 | 1 | 2;

/** Cuánto esfuerzo pide un bloque, en términos relativos a la persona (se baja a números en `zones.ts`). */
export type Intensity =
  | { type: 'zone'; zone: 1 | 2 | 3 | 4 | 5 }
  /** Fracción del umbral: del FTP estimado en bici, de la velocidad de umbral al correr. */
  | { type: 'ftp'; min: number; max: number }
  /** Correr: pasos por minuto dentro de la banda de técnica (ajustes). */
  | { type: 'cadence' }
  /** Esfuerzo percibido de 1 a 10. */
  | { type: 'rpe'; min: number; max: number }
  | { type: 'free' };

export type BlockRole = 'warmup' | 'work' | 'recovery' | 'cooldown';

export interface Block {
  label: string;
  role: BlockRole;
  durationSec: number;
  intensity: Intensity;
  /** Consejo que se dice en voz alta al empezar el bloque. */
  cue?: string;
}

export type WorkoutKind =
  | 'recovery'
  | 'endurance'
  | 'long'
  | 'tempo'
  | 'steady'
  | 'threshold'
  | 'vo2'
  | 'climb'
  | 'sprint'
  | 'test'
  | 'opener'
  | 'strength'
  | 'core'
  | 'mobility';

export interface WorkoutDef {
  id: string;
  name: string;
  kind: WorkoutKind;
  where: WorkoutWhere;
  preparations: Preparation[];
  minLevel: Level;
  /** Nivel máximo (correr y caminar es solo para principiantes); sin dato, cualquiera. */
  maxLevel?: Level;
  /** Duraciones (min) entre las que la sesión se puede armar. */
  minMin: number;
  maxMin: number;
  /** Relación trabajo:pausa, para los textos. */
  density: string | null;
  description: string;
  /** Arma los bloques para una duración total en minutos. */
  build: (totalMin: number) => Block[];
}

/** Un objetivo con números de la persona: lo que la pantalla en vivo compara con lo que va pasando. */
export interface Target {
  /** `speed` va siempre en km/h; al correr la unidad `min/km` hace que se muestre y se diga como ritmo. */
  kind: 'speed' | 'hr' | 'power' | 'rpe' | 'cadence';
  min: number;
  max: number;
  unit: string;
}

export type PeriodKind = 'general' | 'especial' | 'competitivo' | 'transicion';
export type MesoKind = 'introductorio' | 'desarrollador' | 'estabilizador' | 'precompetitivo' | 'competitivo' | 'recuperacion';
export type MicroKind = 'ajuste' | 'carga' | 'impacto' | 'recuperacion' | 'activacion' | 'competencia';
export type Emphasis = 'base' | 'fuerza' | 'umbral' | 'vo2' | 'especifico' | 'afinar' | 'regenerar';

export interface Mesocycle {
  index: number;
  kind: MesoKind;
  period: PeriodKind;
  emphasis: Emphasis;
  /** Semana (desde el inicio del macrociclo) en que empieza. */
  startWeek: number;
  weeks: number;
  micros: MicroKind[];
}

export interface Macrocycle {
  /** Lunes a las 00:00 locales en que empieza la semana 0. */
  startT: number;
  totalWeeks: number;
  /** Deporte del plan (pedido 15). Los planes guardados antes no lo tienen: son de bici. */
  sport?: TrainSport;
  goal: PlanGoal;
  level: Level;
  eventT: number | null;
  eventKm: number | null;
  /** Semana del evento, si hay. */
  eventWeek: number | null;
  mesocycles: Mesocycle[];
}

export interface CoachSession {
  /** Fecha local AAAA-MM-DD. */
  date: string;
  /** 0 = lunes … 6 = domingo. */
  day: number;
  /** `WorkoutDef.id`, o `event` para el evento. */
  workoutId: string;
  name: string;
  kind: WorkoutKind | 'event';
  where: WorkoutWhere;
  durationMin: number;
  /** Carga prevista en hrTSS (en las de afuera de la bici, el equivalente de RPE × minutos). */
  targetLoad: number;
  preparations: Preparation[];
  /** Zona de FC principal (1 a 5), 0 si no aplica. */
  zone: number;
}

export interface Microcycle {
  week: number;
  startT: number;
  kind: MicroKind;
  mesoIndex: number;
  mesoKind: MesoKind;
  emphasis: Emphasis;
  targetLoad: number;
  sessions: CoachSession[];
  /** Por qué la semana quedó así, citando el principio. */
  why: string[];
}
