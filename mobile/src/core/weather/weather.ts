/**
 * Clima de cada salida con datos por hora de Open-Meteo (archivo histórico). Pura: arma los
 * pedidos por meses enteros (no revela los días exactos que saliste), lee la respuesta y promedia
 * las horas que cubre cada salida.
 */
import { weatherCost } from '../openmeteo/limits';

export const HOURLY_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'surface_pressure',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
] as const;

/** Rango máximo de un pedido y cantidad máxima de pedidos por pasada. */
export const MAX_RANGE_DAYS = 366;
export const MAX_REQUESTS_PER_PASS = 6;
/** Los días más nuevos que esto vienen del pronóstico: el mes se vuelve a pedir una vez pasado el plazo. */
export const PROVISIONAL_DAYS = 7;
/** Una salida a más de esta distancia de la ciudad no se consulta. */
export const FAR_KM = 50;
/** Lo que falta se reintenta a los 7 días. */
export const RETRY_MS = 7 * 86_400_000;

const DAY_MS = 86_400_000;

export type WeatherStatus = 'ok' | 'provisional' | 'far' | 'missing';

export interface WeatherData {
  tempC: number | null;
  humidity: number | null;
  /** Presión en la superficie, hPa. */
  pressureHpa: number | null;
  /** Viento medio en m/s y de dónde sopla (0 = norte, 90 = este). */
  windMs: number | null;
  windDirDeg: number | null;
  gustMs: number | null;
}

export interface WeatherRow {
  rideId: string;
  status: WeatherStatus;
  data: WeatherData | null;
  fetchedT: number;
}

export const monthStart = (t: number): number => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

const dateStr = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export interface WeatherRequest {
  /** AAAA-MM-DD, inclusive. */
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  /** Peso en el presupuesto de Open-Meteo. */
  cost: number;
}

/**
 * Agrupa los meses que hacen falta en rangos contiguos de hasta 366 días. El último mes llega
 * hasta `today`. Devuelve como máximo 6 pedidos (lo demás queda para la próxima pasada).
 */
export function buildRequests(rideTimes: number[], today: number): WeatherRequest[] {
  const months = [...new Set(rideTimes.map(monthStart))].sort((a, b) => a - b);
  const out: WeatherRequest[] = [];
  let cur: { s: number; e: number } | null = null;
  const nextMonth = (m: number) => {
    const d = new Date(m);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  };
  const flush = () => {
    if (!cur) return;
    const endMs = Math.min(cur.e - DAY_MS, today);
    const days = Math.max(1, Math.round((endMs - cur.s) / DAY_MS) + 1);
    out.push({ start: dateStr(cur.s), end: dateStr(endMs), startMs: cur.s, endMs, cost: weatherCost(days, HOURLY_VARIABLES.length) });
    cur = null;
  };
  for (const m of months) {
    const end = nextMonth(m);
    if (cur && m === cur.e && end - cur.s <= MAX_RANGE_DAYS * DAY_MS) cur.e = end;
    else {
      flush();
      cur = { s: m, e: end };
    }
  }
  flush();
  return out.slice(0, MAX_REQUESTS_PER_PASS);
}

export interface Hourly {
  /** Instantes en ms (UTC). */
  t: number[];
  temp: (number | null)[];
  hum: (number | null)[];
  pres: (number | null)[];
  wind: (number | null)[];
  dir: (number | null)[];
  gust: (number | null)[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Lee la respuesta del archivo histórico (con `timezone=GMT`); null si no tiene la forma esperada. */
export function parseHourly(json: unknown): Hourly | null {
  const h = (json as { hourly?: Record<string, unknown> } | null)?.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  const n = h.time.length;
  const col = (k: string): (number | null)[] => (Array.isArray(h[k]) && h[k].length === n ? (h[k] as unknown[]).map(num) : new Array(n).fill(null));
  const t = (h.time as unknown[]).map((x) => (typeof x === 'string' ? Date.parse(`${x}:00Z`) : NaN));
  if (t.some((x) => !Number.isFinite(x))) return null;
  return {
    t,
    temp: col('temperature_2m'),
    hum: col('relative_humidity_2m'),
    pres: col('surface_pressure'),
    wind: col('wind_speed_10m'),
    dir: col('wind_direction_10m'),
    gust: col('wind_gusts_10m'),
  };
}

const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Promedio de dirección con vectores (350° y 10° dan 0°, no 180°), ponderado por la velocidad. */
function meanDirection(dirs: (number | null)[], speeds: (number | null)[]): number | null {
  let x = 0;
  let y = 0;
  let any = false;
  dirs.forEach((d, i) => {
    if (d === null) return;
    const w = speeds[i] ?? 1;
    x += w * Math.sin((d * Math.PI) / 180);
    y += w * Math.cos((d * Math.PI) / 180);
    any = true;
  });
  if (!any || (x === 0 && y === 0)) return null;
  return (Math.atan2(x, y) * 180) / Math.PI + (Math.atan2(x, y) < 0 ? 360 : 0);
}

/** Clima durante la salida: promedio de las horas que toca (de la que contiene el inicio a la que contiene el fin). */
export function weatherForRide(h: Hourly, startT: number, endT: number): WeatherData | null {
  const HOUR = 3_600_000;
  const first = Math.floor(startT / HOUR) * HOUR;
  const last = Math.floor(Math.max(startT, endT) / HOUR) * HOUR;
  const idx: number[] = [];
  h.t.forEach((t, i) => {
    if (t >= first && t <= last) idx.push(i);
  });
  if (idx.length === 0) return null;
  const pick = (a: (number | null)[]) => idx.map((i) => a[i]);
  const data: WeatherData = {
    tempC: mean(pick(h.temp)),
    humidity: mean(pick(h.hum)),
    pressureHpa: mean(pick(h.pres)),
    windMs: mean(pick(h.wind)),
    windDirDeg: meanDirection(pick(h.dir), pick(h.wind)),
    gustMs: mean(pick(h.gust)),
  };
  return data.tempC === null && data.windMs === null ? null : data;
}

/** Un mes con días de menos de 7 días viene del pronóstico: se vuelve a pedir pasado el plazo. */
export function isProvisional(rideT: number, fetchedT: number): boolean {
  return fetchedT - rideT < PROVISIONAL_DAYS * DAY_MS;
}

export interface WeatherNeed {
  rideId: string;
  startT: number;
  endT: number;
  /** Distancia del inicio de la salida a la ciudad, en km (null si no se sabe). */
  distanceKm: number | null;
}

/**
 * Qué salidas hay que consultar: las que no tienen clima, las provisorias que ya pasaron el
 * plazo y las que faltaron hace más de 7 días. Las de más de 50 km de la ciudad se marcan "far"
 * sin consultar (se calcula en el celular).
 */
export function pickNeeds(
  rides: WeatherNeed[],
  rows: Map<string, WeatherRow>,
  now: number,
): { fetch: WeatherNeed[]; far: WeatherNeed[] } {
  const fetch: WeatherNeed[] = [];
  const far: WeatherNeed[] = [];
  for (const r of rides) {
    const row = rows.get(r.rideId);
    if (row?.status === 'ok' || row?.status === 'far') continue;
    if (row?.status === 'provisional' && now - r.startT < PROVISIONAL_DAYS * DAY_MS) continue;
    if (row?.status === 'missing' && now - row.fetchedT < RETRY_MS) continue;
    if (r.distanceKm !== null && r.distanceKm > FAR_KM) far.push(r);
    else fetch.push(r);
  }
  return { fetch, far };
}

export function sanitizeWeatherData(raw: unknown): WeatherData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    tempC: num(o.tempC),
    humidity: num(o.humidity),
    pressureHpa: num(o.pressureHpa),
    windMs: num(o.windMs),
    windDirDeg: num(o.windDirDeg),
    gustMs: num(o.gustMs),
  };
}
