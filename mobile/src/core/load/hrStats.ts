/** Rango de FC creíble, en latidos por minuto: lo de afuera es un error del sensor. */
export const MIN_VALID_HR = 30;
export const MAX_VALID_HR = 240;

/** Un hueco mayor entre dos lecturas de FC no se cuenta entero (sensor desconectado). */
const MAX_HR_GAP_SEC = 10;

/**
 * Segundos pasados en cada pulsación: `s[i]` son los segundos a `from + i` lpm. Alcanza para
 * calcular las zonas, la FC media y la carga (TRIMP) con cualquier FC máxima o de reposo, sin
 * volver a leer el GPX.
 */
export interface HrHistogram {
  from: number;
  s: number[];
}

export function isValidHr(hr: number | null | undefined): hr is number {
  return typeof hr === 'number' && Number.isFinite(hr) && hr >= MIN_VALID_HR && hr <= MAX_VALID_HR;
}

/**
 * Acumula la frecuencia cardíaca de una salida, muestra a muestra. Cada lectura pesa el tiempo
 * desde la anterior (hasta 10 s), así una grabación irregular no sesga la media. La máxima usa la
 * mediana de las últimas 3 lecturas para ignorar picos aislados del sensor.
 */
export class HrAccumulator {
  private lastT: number | null = null;
  private weighted = 0;
  private seconds = 0;
  private max: number | null = null;
  private window: number[] = [];
  private readonly bins = new Map<number, number>();
  /** Última lectura válida. */
  current: number | null = null;

  push(t: number, hr: number | null): void {
    if (!isValidHr(hr)) return;
    if (this.lastT !== null && t <= this.lastT) return;
    if (this.lastT !== null) {
      const w = Math.min((t - this.lastT) / 1000, MAX_HR_GAP_SEC);
      this.weighted += hr * w;
      this.seconds += w;
      const bpm = Math.round(hr);
      this.bins.set(bpm, (this.bins.get(bpm) ?? 0) + w);
    }
    this.lastT = t;
    this.current = hr;
    this.window.push(hr);
    if (this.window.length > 3) this.window.shift();
    if (this.window.length === 3) {
      const med = [...this.window].sort((a, b) => a - b)[1];
      if (this.max === null || med > this.max) this.max = med;
    }
  }

  get average(): number | null {
    return this.seconds > 0 ? this.weighted / this.seconds : null;
  }

  get maximum(): number | null {
    // Con menos de 3 lecturas no hay mediana: vale la mayor que haya.
    if (this.max === null && this.window.length > 0) return Math.max(...this.window);
    return this.max;
  }

  /** Segundos con dato de FC. */
  get duration(): number {
    return this.seconds;
  }

  histogram(): HrHistogram | null {
    if (this.bins.size === 0) return null;
    const keys = [...this.bins.keys()];
    const from = Math.min(...keys);
    const to = Math.max(...keys);
    const s = new Array<number>(to - from + 1).fill(0);
    for (const [bpm, sec] of this.bins) s[bpm - from] = Math.round(sec * 10) / 10;
    return { from, s };
  }
}

/** Segundos totales de un histograma. */
export function histogramSeconds(h: HrHistogram): number {
  return h.s.reduce((a, b) => a + b, 0);
}

/** FC media de un histograma, o null si está vacío. */
export function histogramAverage(h: HrHistogram): number | null {
  let sum = 0;
  let sec = 0;
  h.s.forEach((v, i) => {
    sum += (h.from + i) * v;
    sec += v;
  });
  return sec > 0 ? sum / sec : null;
}

/** Valida un histograma leído de la base: lo dañado se descarta en vez de romper los cálculos. */
export function sanitizeHistogram(raw: unknown): HrHistogram | null {
  if (!raw || typeof raw !== 'object') return null;
  const { from, s } = raw as { from?: unknown; s?: unknown };
  if (typeof from !== 'number' || !Number.isInteger(from) || from < MIN_VALID_HR || from > MAX_VALID_HR) return null;
  if (!Array.isArray(s) || s.length === 0 || from + s.length - 1 > MAX_VALID_HR) return null;
  if (!s.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return null;
  return { from, s: s as number[] };
}
