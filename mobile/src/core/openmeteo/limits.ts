/**
 * Presupuesto propio de consultas a Open-Meteo, por debajo de sus límites gratis (600 por minuto,
 * 5.000 por hora, 10.000 por día). Las pruebas del 23/10/2026 mostraron que cada coordenada cuenta
 * como una consulta y que el clima pesa según los días y las variables que se piden.
 *
 * Todo es puro (sin red ni reloj propio) para poder probarlo con tiempos falsos.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export const WINDOWS = [
  { name: 'minuto', ms: MINUTE_MS, cap: 500 },
  { name: 'hora', ms: HOUR_MS, cap: 4_500 },
] as const;
/** Tope por día UTC. */
export const DAY_CAP = 9_000;

/** Consultas gastadas: [instante, peso]. Solo se guardan las de las últimas 24 horas. */
export type SpendLog = [number, number][];

export interface BudgetCheck {
  ok: boolean;
  /** Si no entra, ms hasta que haya lugar. */
  waitMs: number;
}

const startOfUtcDay = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;

/** Descarta lo que ya no cuenta para ninguna ventana. */
export function prune(log: SpendLog, now: number): SpendLog {
  return log.filter(([t]) => t > now - DAY_MS);
}

/** Cuánto hay que esperar para que `cost` entre en una ventana móvil de `ms` con tope `cap`. */
function movingWait(log: SpendLog, now: number, cost: number, ms: number, cap: number): number {
  const inside = log.filter(([t]) => t > now - ms).sort((a, b) => a[0] - b[0]);
  let total = inside.reduce((s, [, c]) => s + c, 0);
  if (total + cost <= cap) return 0;
  // Se liberan las más viejas primero: se espera hasta que salgan las necesarias.
  for (const [t, c] of inside) {
    total -= c;
    if (total + cost <= cap) return t + ms - now;
  }
  return ms;
}

/** ¿Entra una consulta de peso `cost` ahora? Si no, cuánto falta. */
export function checkBudget(log: SpendLog, now: number, cost: number): BudgetCheck {
  let wait = 0;
  for (const w of WINDOWS) wait = Math.max(wait, movingWait(log, now, cost, w.ms, w.cap));
  const today = log.filter(([t]) => t >= startOfUtcDay(now)).reduce((s, [, c]) => s + c, 0);
  if (today + cost > DAY_CAP) wait = Math.max(wait, startOfUtcDay(now) + DAY_MS - now);
  return { ok: wait <= 0, waitMs: Math.max(0, wait) };
}

export function spend(log: SpendLog, now: number, cost: number): SpendLog {
  return [...prune(log, now), [now, cost]];
}

/** Peso de una consulta de clima: más de 2 semanas o más de 10 variables cuentan como varias. */
export function weatherCost(days: number, variables: number): number {
  const byDays = Math.max(1, days / 14);
  const byVars = Math.max(1, variables / 10);
  return Math.round(byDays * byVars * 10) / 10;
}

export type RateLimitKind = 'minutely' | 'hourly' | 'daily' | 'other';

/** Qué límite pasó, según el texto de la respuesta 429 ("Minutely API request limit exceeded…"). */
export function rateLimitKind(body: string): RateLimitKind {
  const t = body.toLowerCase();
  if (t.includes('minutely')) return 'minutely';
  if (t.includes('hourly')) return 'hourly';
  if (t.includes('daily')) return 'daily';
  return 'other';
}

export interface Backoff {
  until: number;
  failures: number;
}

const MAX_BACKOFF_MS = 60 * MINUTE_MS;

/** Hasta cuándo esperar después de un 429. */
export function backoffAfter429(kind: RateLimitKind, now: number, failures: number): Backoff {
  const f = failures + 1;
  switch (kind) {
    case 'minutely':
      return { until: (Math.floor(now / MINUTE_MS) + 1) * MINUTE_MS + 5_000, failures: f };
    case 'hourly':
      return { until: (Math.floor(now / HOUR_MS) + 1) * HOUR_MS + MINUTE_MS, failures: f };
    case 'daily':
      return { until: startOfUtcDay(now) + DAY_MS + 5 * MINUTE_MS, failures: f };
    default:
      return { until: now + Math.min(MAX_BACKOFF_MS, MINUTE_MS * 2 ** (f - 1)), failures: f };
  }
}

/** Lee lo guardado del presupuesto; lo dañado se descarta. */
export function sanitizeSpendLog(raw: unknown): SpendLog {
  if (!Array.isArray(raw)) return [];
  const out: SpendLog = [];
  for (const e of raw) {
    if (Array.isArray(e) && e.length === 2 && Number.isFinite(e[0]) && Number.isFinite(e[1]) && e[1] > 0) out.push([e[0], e[1]]);
  }
  return out;
}

export function sanitizeBackoff(raw: unknown): Backoff {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    until: typeof b.until === 'number' && Number.isFinite(b.until) ? b.until : 0,
    failures: typeof b.failures === 'number' && Number.isFinite(b.failures) && b.failures >= 0 ? Math.min(b.failures, 20) : 0,
  };
}
