import { detectClimbs } from '../elevation/climbs';
import type { Climb } from '../elevation/climbs';
import { smoothMovingAverage } from '../elevation/gain';
import { medianFilter } from '../elevation/profile';
import type { ProfilePoint } from '../elevation/profile';
import { bearingDegrees } from '../geo/distance';
import { airDensity, estimatePower } from '../power/model';

export type AltitudeSource = 'dem' | 'gps';

export interface AltitudeSeries {
  /** Altitud limpia (sin picos ni ruido) en cada punto del perfil. */
  values: number[];
  source: AltitudeSource;
}

/**
 * Altitud del perfil para graficar y medir pendientes: la del mapa de terreno si está completa,
 * si no la del GPS. El mapa casi no tiene ruido y alcanza con sacar los picos de edificios; el
 * GPS necesita un suavizado más largo.
 */
export function altitudeSeries(points: ProfilePoint[]): AltitudeSeries | null {
  if (points.length === 0) return null;
  if (points.every((p) => p.dem !== null)) {
    return { values: smoothMovingAverage(medianFilter(points.map((p) => p.dem!), 5), 3), source: 'dem' };
  }
  if (points.every((p) => p.gps !== null)) {
    return { values: smoothMovingAverage(medianFilter(points.map((p) => p.gps!), 5), 7), source: 'gps' };
  }
  return null;
}

/** Pendiente en cada punto, en %, medida sobre ~200 m centrados (null en los bordes). */
export function gradeSeries(points: ProfilePoint[], alt: number[], halfWindow = 2): (number | null)[] {
  return points.map((_, i) => {
    const a = Math.max(0, i - halfWindow);
    const b = Math.min(points.length - 1, i + halfWindow);
    const run = points[b].d - points[a].d;
    if (run < 50) return null;
    return ((alt[b] - alt[a]) / run) * 100;
  });
}

/** Velocidad mínima para considerar que un tramo es en movimiento, en m/s. */
const MOVING_SPEED = 1;

/**
 * Velocidad en cada punto, en m/s, sobre ~200 m centrados. Vale 0 en las paradas y null en los
 * perfiles viejos que no guardaron el tiempo.
 */
export function speedSeries(points: ProfilePoint[], halfWindow = 2): (number | null)[] {
  return points.map((_, i) => {
    const a = Math.max(0, i - halfWindow);
    const b = Math.min(points.length - 1, i + halfWindow);
    const ta = points[a].t;
    const tb = points[b].t;
    if (ta === null || tb === null || tb <= ta) return null;
    const v = (points[b].d - points[a].d) / (tb - ta);
    return v < MOVING_SPEED ? 0 : v;
  });
}

export interface ClimbDetail extends Climb {
  /** Segundos que llevó la subida (null sin tiempos en el perfil). */
  durationSec: number | null;
  /** Velocidad de ascenso, en metros por hora. */
  vam: number | null;
  /** Velocidad media en la subida, m/s. */
  avgSpeed: number | null;
  /** Categoría como en las carreras: "4", "3", "2", "1" o "HC"; null si es una subida menor. */
  category: string | null;
}

/** Categoría por largo × pendiente (el mismo criterio que usan las apps de ciclismo). */
export function climbCategory(lengthM: number, avgGradePct: number): string | null {
  const score = lengthM * avgGradePct;
  if (score >= 80000) return 'HC';
  if (score >= 64000) return '1';
  if (score >= 32000) return '2';
  if (score >= 16000) return '3';
  if (score >= 8000) return '4';
  return null;
}

/** Subidas de la salida con su tiempo, VAM y categoría. */
export function climbsFromProfile(points: ProfilePoint[], alt?: AltitudeSeries | null): ClimbDetail[] {
  const series = alt === undefined ? altitudeSeries(points) : alt;
  if (!series || points.length < 3) return [];
  const climbs = detectClimbs(
    points.map((p) => p.d),
    series.values,
    // La altitud del GPS es más ruidosa: hace falta más oscilación para separar un tramo.
    series.source === 'gps' ? { swing: 10 } : {},
  );
  return climbs.map((c) => {
    const ts = points[c.startIndex].t;
    const te = points[c.endIndex].t;
    const durationSec = ts !== null && te !== null && te > ts ? te - ts : null;
    return {
      ...c,
      durationSec,
      vam: durationSec ? (c.gain / durationSec) * 3600 : null,
      avgSpeed: durationSec ? c.length / durationSec : null,
      category: climbCategory(c.length, c.avgGrade),
    };
  });
}

export type BikeType = 'road' | 'gravel' | 'mtb' | 'urban';

/** Rodadura y área frontal típicas de cada bici, con el ciclista en su posición habitual. */
export const BIKE_PRESETS: Record<BikeType, { crr: number; cdA: number }> = {
  road: { crr: 0.0045, cdA: 0.32 },
  gravel: { crr: 0.006, cdA: 0.36 },
  mtb: { crr: 0.009, cdA: 0.42 },
  urban: { crr: 0.0065, cdA: 0.5 },
};

/** Clima durante la salida, para afinar la densidad del aire y el viento en contra. */
export interface EnergyEnv {
  tempC: number | null;
  humidity: number | null;
  /** Presión en la superficie, hPa, a la altitud media de la salida. */
  pressureHpa: number | null;
  windMs: number | null;
  /** De dónde sopla el viento: 0 = norte, 90 = este. */
  windDirDeg: number | null;
}

/** El viento a la altura del ciclista es más débil que el medido a 10 m. */
export const WIND_AT_RIDER = 0.7;

/** Viento en contra (m/s, negativo si es a favor) para un tramo con rumbo `headingDeg`. */
export function headwindFor(env: Pick<EnergyEnv, 'windMs' | 'windDirDeg'>, headingDeg: number): number {
  if (env.windMs === null || env.windDirDeg === null) return 0;
  return env.windMs * WIND_AT_RIDER * Math.cos(((env.windDirDeg - headingDeg) * Math.PI) / 180);
}

/** Presión a la altitud `altM`, partiendo de la medida a la altitud `refM` (atmósfera estándar). */
export function pressureAt(pressureRefHpa: number, refM: number, altM: number): number {
  const f = (h: number) => 1 - 2.25577e-5 * Math.max(-500, Math.min(9000, h));
  return pressureRefHpa * Math.pow(f(altM) / f(refM), 5.25588);
}

export interface EnergyEstimate {
  /** Potencia media estimada en movimiento, en watts (los tramos sin pedalear cuentan como 0). */
  avgPower: number;
  /** Trabajo mecánico en kilojoules. */
  workKj: number;
  /** Energía gastada aproximada, en kilocalorías (≈ kJ con un 24 % de eficiencia muscular). */
  kcal: number;
  /** Segundos en movimiento usados en el cálculo. */
  movingSec: number;
}

/** Densidad del aire a cierta altitud con una atmósfera estándar a 15 °C. */
export function airDensityAt(altitudeM: number): number {
  const pressure = 1013.25 * Math.pow(1 - 2.25577e-5 * Math.max(-500, Math.min(9000, altitudeM)), 5.25588);
  return airDensity(15, pressure);
}

/**
 * Potencia y energía estimadas con el modelo físico (rodadura, pendiente y aire), tramo a tramo
 * del perfil. No hay medidor de potencia ni datos de viento: es una estimación. Devuelve null si
 * el perfil no tiene tiempos o no hubo movimiento.
 */
export function estimateEnergy(
  points: ProfilePoint[],
  opts: { massKg: number; bike: BikeType; /** Resistencia a la rodadura de las cubiertas; si falta, la típica del tipo de bici. */ crr?: number; env?: EnergyEnv | null },
  alt?: AltitudeSeries | null,
): EnergyEstimate | null {
  if (points.length < 2 || opts.massKg <= 0) return null;
  const series = alt === undefined ? altitudeSeries(points) : alt;
  const altitudes = series?.values ?? points.map(() => 0);
  const { cdA } = BIKE_PRESETS[opts.bike];
  const crr = opts.crr ?? BIKE_PRESETS[opts.bike].crr;
  const env = opts.env ?? null;
  const meanAlt = altitudes.reduce((a, b) => a + b, 0) / altitudes.length;
  let work = 0;
  let moving = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.t === null || b.t === null) continue;
    const dd = b.d - a.d;
    const dt = b.t - a.t;
    if (dd <= 0 || dt <= 0) continue;
    const v = dd / dt;
    if (v < MOVING_SPEED || v > 28) continue;
    const grade = Math.max(-0.25, Math.min(0.25, (altitudes[i] - altitudes[i - 1]) / dd));
    const p = estimatePower(
      {
        massKg: opts.massKg,
        crr,
        cdA,
        drivetrainEff: 0.97,
        rho:
          env && env.pressureHpa !== null
            ? airDensity(env.tempC ?? 15, pressureAt(env.pressureHpa, meanAlt, altitudes[i]), env.humidity ?? 50)
            : airDensityAt(altitudes[i]),
      },
      { speed: v, grade, headwind: env ? headwindFor(env, bearingDegrees(a.lat, a.lon, b.lat, b.lon)) : 0 },
    );
    work += p * dt;
    moving += dt;
  }
  if (moving <= 0) return null;
  const workKj = work / 1000;
  return { avgPower: work / moving, workKj, kcal: workKj / (4.184 * 0.24), movingSec: moving };
}
