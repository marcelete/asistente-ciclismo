import { backoffAfter429, checkBudget, rateLimitKind, sanitizeBackoff, sanitizeSpendLog, spend } from '../core/openmeteo/limits';
import type { Backoff, SpendLog } from '../core/openmeteo/limits';
import { loadSetting, saveSetting } from '../data/db';
import { log } from './log';

/**
 * Cliente común de Open-Meteo (altitud, clima y búsqueda de ciudad). Lleva un presupuesto propio
 * de consultas por debajo de los límites gratis y, si igual llega un 429, espera según el motivo.
 * Las dos cosas se guardan en la base, así que valen aunque cierres la app.
 *
 * Privacidad: la URL (con coordenadas) nunca se registra; ver core/log/redact.
 */

const BUDGET_KEY = 'openMeteoBudget';
const BACKOFF_KEY = 'openMeteoBackoff';

/** Tiempo máximo por consulta; sin esto una red colgada deja todo trabado hasta reiniciar. */
const TIMEOUT_MS = 15_000;

/** Esperas de hasta este tiempo se aguardan acá; si es más, la tarea se deja para después. */
const MAX_INLINE_WAIT_MS = 15_000;

/** Hay que esperar hasta `until` antes de volver a consultar (límite propio o 429 de Open-Meteo). */
export class OpenMeteoWait extends Error {
  constructor(public until: number) {
    super('Open-Meteo: hay que esperar para seguir consultando');
    this.name = 'OpenMeteoWait';
  }
}

export class OpenMeteoCancelled extends Error {
  constructor() {
    super('Consulta cancelada');
    this.name = 'OpenMeteoCancelled';
  }
}

export interface OmOptions {
  /** Peso de la consulta en el presupuesto: coordenadas pedidas, o el peso del clima. */
  cost: number;
  isCancelled?: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const readBudget = (): SpendLog => sanitizeSpendLog(loadSetting<unknown>(BUDGET_KEY, []));
const readBackoff = (): Backoff => sanitizeBackoff(loadSetting<unknown>(BACKOFF_KEY, {}));

/** "sigue a las 14:05" para mostrar hasta cuándo hay que esperar. */
export function formatUntil(until: number): string {
  const d = new Date(until);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Hasta cuándo está frenado Open-Meteo (por un 429 anterior), o null si se puede consultar. */
export function waitingUntil(now: number = Date.now()): number | null {
  const b = readBackoff();
  return b.until > now ? b.until : null;
}

/** GET con presupuesto, espera ante el 429 y timeout. Devuelve el JSON de la respuesta. */
export async function omGet(url: string, opts: OmOptions): Promise<unknown> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const cancelled = () => opts.isCancelled?.() ?? false;

  const back = readBackoff();
  if (back.until > now()) throw new OpenMeteoWait(back.until);

  // Presupuesto propio: si no entra y falta poco, se espera acá; si falta mucho, queda para después.
  let log_ = readBudget();
  const check = checkBudget(log_, now(), opts.cost);
  if (!check.ok) {
    if (check.waitMs > MAX_INLINE_WAIT_MS) throw new OpenMeteoWait(now() + check.waitMs);
    let left = check.waitMs;
    while (left > 0) {
      if (cancelled()) throw new OpenMeteoCancelled();
      const step = Math.min(1000, left);
      await sleep(step);
      left -= step;
    }
    log_ = readBudget();
  }
  if (cancelled()) throw new OpenMeteoCancelled();
  // Se anota antes de mandar: una consulta que falla a medias igual pudo contar del lado de ellos.
  await saveSetting(BUDGET_KEY, spend(log_, now(), opts.cost));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } catch {
    throw new Error(ctrl.signal.aborted ? 'Open-Meteo no respondió a tiempo' : 'Sin conexión con Open-Meteo');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    const body = await res.text().catch(() => '');
    const kind = rateLimitKind(body);
    const next = backoffAfter429(kind, now(), back.failures);
    await saveSetting(BACKOFF_KEY, next);
    log('warn', 'dem', `Open-Meteo respondió 429 (${kind}); sigue a las ${formatUntil(next.until)}`);
    throw new OpenMeteoWait(next.until);
  }
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
  if (back.failures > 0) await saveSetting(BACKOFF_KEY, { until: 0, failures: 0 });
  return res.json();
}
