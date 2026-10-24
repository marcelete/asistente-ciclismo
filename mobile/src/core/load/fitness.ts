export interface DailyLoad {
  /** Fecha en formato AAAA-MM-DD. */
  date: string;
  /** Carga del día (suma de hrTSS de todas las salidas). */
  load: number;
}

export interface FitnessPoint {
  date: string;
  load: number;
  /** Fitness crónico (constante de 42 días). */
  ctl: number;
  /** Fatiga aguda (constante de 7 días). */
  atl: number;
  /** Forma = CTL - ATL del día anterior. */
  tsb: number;
}

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

const DAY_MS = 24 * 3600 * 1000;

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Calcula CTL, ATL y TSB día por día con medias móviles exponenciales. Los días sin entrenar
 * (sin entrada) cuentan como carga 0, de modo que la forma decae con el descanso.
 * `loads` puede venir desordenado y con varias entradas por día.
 */
export function computeFitness(
  loads: DailyLoad[],
  opts: { untilDate?: string; initialCtl?: number; initialAtl?: number } = {},
): FitnessPoint[] {
  if (loads.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const l of loads) byDay.set(l.date, (byDay.get(l.date) ?? 0) + l.load);

  const days = [...byDay.keys()].sort();
  const start = Date.parse(`${days[0]}T00:00:00Z`);
  const end = Date.parse(`${opts.untilDate ?? days[days.length - 1]}T00:00:00Z`);

  const out: FitnessPoint[] = [];
  let ctl = opts.initialCtl ?? 0;
  let atl = opts.initialAtl ?? 0;
  for (let t = start; t <= end; t += DAY_MS) {
    const date = dayKey(t);
    const load = byDay.get(date) ?? 0;
    const tsb = ctl - atl;
    ctl += (load - ctl) / CTL_DAYS;
    atl += (load - atl) / ATL_DAYS;
    out.push({ date, load, ctl, atl, tsb });
  }
  return out;
}
