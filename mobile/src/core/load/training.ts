import { computeFitness } from './fitness';
import type { DailyLoad, FitnessPoint } from './fitness';
import { hrTss, hrZone, trimpSegment } from './hr';
import type { HrProfile } from './hr';
import type { HrHistogram } from './hrStats';

/** TRIMP de una salida a partir de los segundos pasados en cada pulsación. */
export function trimpFromHistogram(h: HrHistogram, p: HrProfile): number {
  let total = 0;
  h.s.forEach((sec, i) => {
    if (sec > 0) total += trimpSegment(h.from + i, sec / 60, p);
  });
  return total;
}

/** Carga de la salida (hrTSS: una hora a la FC de umbral vale 100), o null sin FC o sin perfil. */
export function hrLoad(h: HrHistogram | null, p: HrProfile | null): number | null {
  if (!h || !p) return null;
  return hrTss(trimpFromHistogram(h, p), p);
}

/** Segundos en cada zona: el índice 0 es por debajo de la zona 1, del 1 al 5 las zonas. */
export function zoneSeconds(h: HrHistogram, p: HrProfile): number[] {
  const out = [0, 0, 0, 0, 0, 0];
  h.s.forEach((sec, i) => {
    if (sec > 0) out[hrZone(h.from + i, p)] += sec;
  });
  return out;
}

/** Fecha local AAAA-MM-DD (las salidas cuentan en el día en que empezaron, en tu hora). */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dailyLoads(rides: { startT: number; hrHist: HrHistogram | null }[], p: HrProfile): DailyLoad[] {
  const out: DailyLoad[] = [];
  for (const r of rides) {
    const load = hrLoad(r.hrHist, p);
    if (load !== null) out.push({ date: localDateKey(r.startT), load });
  }
  return out;
}

/**
 * Estado físico (CTL), fatiga (ATL) y forma (TSB) de cada día hasta hoy, de los últimos `days`
 * días. La cuenta arranca en la primera salida con FC, así el historial completo pesa en el CTL.
 */
export function fitnessSeries(
  rides: { startT: number; hrHist: HrHistogram | null }[],
  p: HrProfile,
  now: number,
  days = 90,
): FitnessPoint[] {
  const loads = dailyLoads(rides, p);
  if (loads.length === 0) return [];
  const series = computeFitness(loads, { untilDate: localDateKey(now) });
  return series.slice(-days);
}

export interface FormStatus {
  label: string;
  tone: 'good' | 'neutral' | 'warn' | 'bad';
  advice: string;
}

/** Lectura de la forma (TSB) en palabras. */
export function formStatus(tsb: number): FormStatus {
  if (tsb > 15) return { label: 'Muy descansado', tone: 'neutral', advice: 'Llegás fresco a una prueba, pero si dura mucho vas perdiendo estado.' };
  if (tsb > 5) return { label: 'Fresco', tone: 'good', advice: 'Buen momento para un esfuerzo fuerte o una salida larga.' };
  if (tsb >= -10) return { label: 'Equilibrado', tone: 'good', advice: 'La carga y el descanso van parejos.' };
  if (tsb >= -30) return { label: 'Cargado', tone: 'warn', advice: 'Estás entrenando fuerte: es normal sentir cansancio.' };
  return { label: 'Sobrecarga', tone: 'bad', advice: 'Mucha fatiga acumulada: conviene bajar la carga unos días.' };
}

export interface AthleteHr {
  hrMax: number | null;
  hrRest: number | null;
  birthYear: number | null;
  sex: 'male' | 'female' | null;
}

export interface ResolvedHr {
  profile: HrProfile;
  /** De dónde sale la FC máxima: la cargaste, se estimó por tu edad o es la más alta registrada. */
  maxSource: 'perfil' | 'edad' | 'registrada';
  /** La FC de reposo no está cargada y se usa 60 lpm. */
  restEstimated: boolean;
}

/** FC en reposo típica de un adulto activo, para cuando no la cargaste. */
export const DEFAULT_HR_REST = 60;

/**
 * Arma el perfil de FC para zonas y carga. La FC máxima sale del perfil; si no está, de la edad
 * (208 − 0,7 × edad), salvo que ya hayas registrado una más alta; y si no hay edad, de la más
 * alta registrada. Sin ninguna de las tres no hay zonas.
 */
export function resolveHrProfile(a: AthleteHr, observedMax: number | null, now: number): ResolvedHr | null {
  let hrMax = a.hrMax;
  let maxSource: ResolvedHr['maxSource'] = 'perfil';
  if (hrMax === null && a.birthYear !== null) {
    const age = new Date(now).getFullYear() - a.birthYear;
    hrMax = Math.round(208 - 0.7 * age);
    maxSource = 'edad';
    if (observedMax !== null && observedMax > hrMax) {
      hrMax = Math.round(observedMax);
      maxSource = 'registrada';
    }
  }
  if (hrMax === null && observedMax !== null && observedMax >= 140) {
    hrMax = Math.round(observedMax);
    maxSource = 'registrada';
  }
  if (hrMax === null) return null;
  const hrRest = a.hrRest ?? DEFAULT_HR_REST;
  if (hrMax - hrRest < 40) return null;
  return {
    profile: { hrMax, hrRest, sex: a.sex ?? 'male' },
    maxSource,
    restEstimated: a.hrRest === null,
  };
}
