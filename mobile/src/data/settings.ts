import type { BikeType } from '../core/analysis/profileMetrics';
import type { ReminderSettings } from '../core/goals/reminders';
import type { PlanGoal } from '../core/plan/rules';
import { isValidBirthDate } from '../core/profile/birthDate';
import { sanitizeSport } from '../core/stats/sport';
import type { TrainSport } from '../core/stats/sport';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Datos del ciclista y la bici para las zonas de FC, la carga y la potencia estimada. */
export interface Athlete {
  /** Kilos. */
  weightKg: number | null;
  bikeKg: number | null;
  bike: BikeType;
  /** Marca y modelo de la bici, solo para mostrar ("Trek Domane AL 2"). */
  bikeModel: string | null;
  /** Fecha de nacimiento (AAAA-MM-DD). `birthYear` sale de ella; quien cargó solo el año antes la deja vacía. */
  birthDate: string | null;
  birthYear: number | null;
  sex: 'male' | 'female' | null;
  /** Latidos por minuto. */
  hrMax: number | null;
  hrRest: number | null;
}

/** Ciudad elegida para el clima (coordenadas redondeadas a 2 decimales: nunca la de una salida). */
export interface City {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}

/** Datos que se cargan en la pantalla del plan semanal. */
export interface PlanSettings {
  goal: PlanGoal;
  /** Días por semana disponibles para entrenar. */
  days: number;
  hoursPerWeek: number;
  /** Fecha del evento (AAAA-MM-DD) o null. */
  eventDate: string | null;
}

/** Datos del entrenador (pestaña Entrenar): objetivo, tiempo disponible y avisos en vivo. */
export interface CoachSettings {
  goal: PlanGoal;
  /** Fecha del evento (AAAA-MM-DD) o null. */
  eventDate: string | null;
  /** Distancia del evento en km o null. */
  eventKm: number | null;
  /** Minutos disponibles cada día, 0 = lunes … 6 = domingo (menos de 20 cuenta como día libre). */
  minutesByDay: number[];
  /** Sumar sesiones de fuerza, core y movilidad. */
  offBike: boolean;
  /** Avisos en vivo: voz, pitidos y vibración. */
  voice: boolean;
  beeps: boolean;
  vibrate: boolean;
  /** Segundos mínimos entre dos avisos iguales. */
  cueEverySec: number;
  /** Tolerancia al mantener la velocidad, en km/h a cada lado. */
  speedTolKmh: number;
  /** Correr: tolerancia al mantener el ritmo, en segundos por km a cada lado. */
  paceTolSec: number;
  /** Correr: banda de pasos por minuto para la técnica. */
  cadenceMin: number;
  cadenceMax: number;
  /** Correr: una marca reciente para calcular el ritmo de umbral (null si no cargaste ninguna). */
  runRace: RunRace | null;
}

/** Una carrera o prueba hecha: distancia, tiempo y fecha. */
export interface RunRace {
  km: number;
  sec: number;
  /** AAAA-MM-DD. */
  date: string;
}

/** Copia de los datos hacia una carpeta (ver services/exporter). */
export interface BackupSettings {
  folderUri: string | null;
  auto: boolean;
  includeTracks: boolean;
  includePoints: boolean;
  hideEnds: boolean;
}

export interface Settings {
  /** Pausa automática: el tiempo de la salida cuenta solo mientras te movés. */
  autoPause: boolean;
  reminders: ReminderSettings;
  /** Carpeta de exportación de OpenTracks elegida por última vez (permiso persistente de Android). */
  folderUri: string | null;
  /** Consultar la altitud del terreno en Open-Meteo (manda coordenadas redondeadas, sin inicio ni final). */
  demOnline: boolean;
  /** Tema de la app: el del sistema, o siempre claro u oscuro. */
  theme: ThemePreference;
  athlete: Athlete;
  /** Sonidos de la app (el modo silencio del teléfono siempre se respeta). */
  sounds: boolean;
  haptics: boolean;
  /** Festejos con confeti al superar un récord o ganar un premio. */
  celebrations: boolean;
  /** Mapa de fondo con mosaicos de OpenStreetMap (OSM ve tu IP y la zona que mirás). */
  mapTiles: boolean;
  /** Los mapas dibujan la traza sin los 300 m de cada punta y avisan "Inicio y final ocultos". */
  hideMapEnds: boolean;
  /** Clima de cada salida desde Open-Meteo (manda la coordenada de la ciudad, nunca la de la salida). */
  weatherOnline: boolean;
  /** La pantalla de bienvenida (perfil, bici y ciudad) ya se mostró. */
  onboardingDone: boolean;
  city: City | null;
  plan: PlanSettings;
  coach: CoachSettings;
  /** Deporte que se está mirando y entrenando: bici o correr (pedido 15). */
  sport: TrainSport;
  backup: BackupSettings;
}

export const DEFAULT_ATHLETE: Athlete = {
  weightKg: null,
  bikeKg: null,
  bike: 'road',
  bikeModel: null,
  birthDate: null,
  birthYear: null,
  sex: null,
  hrMax: null,
  hrRest: null,
};

export const DEFAULT_SETTINGS: Settings = {
  autoPause: true,
  reminders: { enabled: false, hour: 19, minute: 0, streaks: true, goals: true },
  folderUri: null,
  demOnline: true,
  theme: 'system',
  athlete: DEFAULT_ATHLETE,
  sounds: true,
  haptics: true,
  celebrations: true,
  mapTiles: true,
  hideMapEnds: false,
  weatherOnline: true,
  onboardingDone: false,
  city: null,
  sport: 'bike',
  plan: { goal: 'general', days: 3, hoursPerWeek: 4, eventDate: null },
  coach: {
    goal: 'general',
    eventDate: null,
    eventKm: null,
    minutesByDay: [0, 80, 0, 80, 0, 80, 0],
    offBike: true,
    voice: true,
    beeps: true,
    vibrate: true,
    cueEverySec: 25,
    speedTolKmh: 1,
    paceTolSec: 10,
    cadenceMin: 165,
    cadenceMax: 185,
    runRace: null,
  },
  backup: { folderUri: null, auto: false, includeTracks: true, includePoints: false, hideEnds: true },
};

/** Rangos aceptados de cada dato del perfil. */
export const ATHLETE_LIMITS = {
  weightKg: { min: 30, max: 200 },
  bikeKg: { min: 4, max: 40 },
  birthYear: { min: 1920, max: 2016 },
  hrMax: { min: 120, max: 230 },
  hrRest: { min: 30, max: 100 },
} as const;

const BIKES: BikeType[] = ['road', 'gravel', 'mtb', 'urban'];

/** Largo máximo del modelo de la bici. */
export const MAX_MODEL_LENGTH = 60;

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
const numOrNull = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

/** Perfil validado campo por campo; lo inválido queda vacío. */
export function sanitizeAthlete(raw: unknown): Athlete {
  const a = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const L = ATHLETE_LIMITS;
  const hrMax = numOrNull(a.hrMax, L.hrMax.min, L.hrMax.max);
  let hrRest = numOrNull(a.hrRest, L.hrRest.min, L.hrRest.max);
  // Con menos de 40 lpm entre reposo y máxima las zonas no tienen sentido: se descarta el reposo.
  if (hrMax !== null && hrRest !== null && hrMax - hrRest < 40) hrRest = null;
  const birthDate = isValidBirthDate(a.birthDate, L.birthYear.min, L.birthYear.max) ? a.birthDate : null;
  // Con fecha, el año sale de ella; sin fecha se conserva el año que se cargó antes.
  const birthYear = birthDate !== null ? Number(birthDate.slice(0, 4)) : numOrNull(a.birthYear, L.birthYear.min, L.birthYear.max);
  const model = typeof a.bikeModel === 'string' ? a.bikeModel.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_MODEL_LENGTH) : '';
  return {
    weightKg: numOrNull(a.weightKg, L.weightKg.min, L.weightKg.max),
    bikeKg: numOrNull(a.bikeKg, L.bikeKg.min, L.bikeKg.max),
    bike: BIKES.includes(a.bike as BikeType) ? (a.bike as BikeType) : DEFAULT_ATHLETE.bike,
    bikeModel: model || null,
    birthDate,
    birthYear: birthYear !== null && Number.isInteger(birthYear) ? birthYear : null,
    sex: a.sex === 'male' || a.sex === 'female' ? a.sex : null,
    hrMax,
    hrRest,
  };
}

const PLAN_GOALS: PlanGoal[] = ['endurance', 'climbing', 'general', 'event'];

const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';

/** Ciudad validada; las coordenadas se redondean a 2 decimales. */
export function sanitizeCity(raw: unknown): City | null {
  const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!c) return null;
  const name = text(c.name, 80);
  const lat = numOrNull(c.lat, -90, 90);
  const lon = numOrNull(c.lon, -180, 180);
  if (!name || lat === null || lon === null) return null;
  return {
    name,
    region: text(c.region, 80),
    country: text(c.country, 80),
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
  };
}

export function sanitizePlan(raw: unknown): PlanSettings {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS.plan;
  const date = typeof p.eventDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.eventDate) ? p.eventDate : null;
  return {
    goal: PLAN_GOALS.includes(p.goal as PlanGoal) ? (p.goal as PlanGoal) : d.goal,
    days: int(p.days, 1, 7, d.days),
    hoursPerWeek: int(p.hoursPerWeek, 1, 30, d.hoursPerWeek),
    eventDate: date,
  };
}

/** Minutos por día del plan viejo (días por semana y horas): los reparte entre los días de `daysFor`. */
function legacyMinutes(plan: PlanSettings): number[] {
  const presets: Record<number, number[]> = { 1: [5], 2: [1, 5], 3: [1, 3, 5], 4: [0, 2, 4, 5], 5: [0, 1, 3, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
  const days = presets[plan.days] ?? presets[3];
  const each = Math.max(20, Math.min(240, Math.round((plan.hoursPerWeek * 60) / days.length / 5) * 5));
  return Array.from({ length: 7 }, (_, d) => (days.includes(d) ? each : 0));
}

/**
 * Ajustes del entrenador. Si todavía no hay (ajustes de una versión anterior), se parte del plan
 * semanal viejo: mismo objetivo, fecha del evento y tiempo disponible.
 */
export function sanitizeCoach(raw: unknown, legacy: PlanSettings): CoachSettings {
  const hasRaw = !!raw && typeof raw === 'object';
  const c = hasRaw ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS.coach;
  const goal = PLAN_GOALS.includes(c.goal as PlanGoal) ? (c.goal as PlanGoal) : hasRaw ? d.goal : legacy.goal;
  const date = typeof c.eventDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.eventDate) ? c.eventDate : hasRaw ? null : legacy.eventDate;
  const m = Array.isArray(c.minutesByDay) && c.minutesByDay.length === 7 ? c.minutesByDay : null;
  const minutes = m ? m.map((x) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(480, Math.round(x))) : 0)) : legacyMinutes(legacy);
  const tol = typeof c.speedTolKmh === 'number' && Number.isFinite(c.speedTolKmh) ? Math.min(3, Math.max(0.5, Math.round(c.speedTolKmh * 2) / 2)) : d.speedTolKmh;
  return {
    goal,
    eventDate: date,
    eventKm: numOrNull(c.eventKm, 1, 1000),
    minutesByDay: minutes,
    offBike: bool(c.offBike, d.offBike),
    voice: bool(c.voice, d.voice),
    beeps: bool(c.beeps, d.beeps),
    vibrate: bool(c.vibrate, d.vibrate),
    cueEverySec: int(c.cueEverySec, 10, 300, d.cueEverySec),
    speedTolKmh: tol,
    paceTolSec: int(c.paceTolSec, 5, 30, d.paceTolSec),
    ...sanitizeCadence(c.cadenceMin, c.cadenceMax),
    runRace: sanitizeRunRace(c.runRace),
  };
}

/** Banda de pasos por minuto: entre 120 y 220, con al menos 5 de ancho. */
function sanitizeCadence(lo: unknown, hi: unknown): { cadenceMin: number; cadenceMax: number } {
  const d = DEFAULT_SETTINGS.coach;
  const a = int(lo, 120, 220, d.cadenceMin);
  const b = int(hi, 120, 220, d.cadenceMax);
  return b - a >= 5 ? { cadenceMin: a, cadenceMax: b } : { cadenceMin: d.cadenceMin, cadenceMax: d.cadenceMax };
}

/** Límites de una marca de carrera: de 1 a 100 km y un ritmo entre 2:30 y 15:00 por km. */
export const RUN_RACE_LIMITS = { km: { min: 1, max: 100 }, paceSec: { min: 150, max: 900 } } as const;

export function sanitizeRunRace(raw: unknown): RunRace | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!r) return null;
  const km = numOrNull(r.km, RUN_RACE_LIMITS.km.min, RUN_RACE_LIMITS.km.max);
  const sec = typeof r.sec === 'number' && Number.isFinite(r.sec) ? Math.round(r.sec) : null;
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  if (km === null || sec === null || date === null) return null;
  const pace = sec / km;
  if (pace < RUN_RACE_LIMITS.paceSec.min || pace > RUN_RACE_LIMITS.paceSec.max) return null;
  return { km: Math.round(km * 1000) / 1000, sec, date };
}

export function sanitizeBackup(raw: unknown): BackupSettings {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS.backup;
  return {
    folderUri: typeof b.folderUri === 'string' && b.folderUri.startsWith('content://') ? b.folderUri : null,
    auto: bool(b.auto, d.auto),
    includeTracks: bool(b.includeTracks, d.includeTracks),
    includePoints: bool(b.includePoints, d.includePoints),
    hideEnds: bool(b.hideEnds, d.hideEnds),
  };
}

/**
 * Arma los ajustes a partir de lo guardado en la base, campo por campo: lo que falta o no tiene
 * el tipo y el rango esperados vuelve al valor por defecto.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const r = s.reminders && typeof s.reminders === 'object' ? (s.reminders as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    autoPause: bool(s.autoPause, d.autoPause),
    reminders: {
      enabled: bool(r.enabled, d.reminders.enabled),
      hour: int(r.hour, 0, 23, d.reminders.hour),
      minute: int(r.minute, 0, 59, d.reminders.minute),
      streaks: bool(r.streaks, d.reminders.streaks),
      goals: bool(r.goals, d.reminders.goals),
    },
    folderUri: typeof s.folderUri === 'string' && s.folderUri.startsWith('content://') ? s.folderUri : null,
    demOnline: bool(s.demOnline, d.demOnline),
    theme: s.theme === 'light' || s.theme === 'dark' || s.theme === 'system' ? s.theme : d.theme,
    athlete: sanitizeAthlete(s.athlete),
    sounds: bool(s.sounds, d.sounds),
    haptics: bool(s.haptics, d.haptics),
    celebrations: bool(s.celebrations, d.celebrations),
    mapTiles: bool(s.mapTiles, d.mapTiles),
    hideMapEnds: bool(s.hideMapEnds, d.hideMapEnds),
    weatherOnline: bool(s.weatherOnline, d.weatherOnline),
    onboardingDone: bool(s.onboardingDone, d.onboardingDone),
    city: sanitizeCity(s.city),
    plan: sanitizePlan(s.plan),
    coach: sanitizeCoach(s.coach, sanitizePlan(s.plan)),
    sport: sanitizeSport(s.sport),
    backup: sanitizeBackup(s.backup),
  };
}

/** Masa total para la potencia: ciclista, bici y ~1 kg de ropa y caramañola. */
export function totalMass(a: Athlete): number | null {
  if (a.weightKg === null) return null;
  return a.weightKg + (a.bikeKg ?? 10) + 1;
}
