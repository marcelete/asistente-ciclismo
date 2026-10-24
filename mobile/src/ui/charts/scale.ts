/** Paso "redondo" (1, 2, 2,5 o 5 × 10ⁿ) para que las marcas del eje caigan en números fáciles de leer. */
function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * Rango del eje vertical con marcas redondas que contienen a todos los valores. `minSpan` evita
 * que un perfil casi llano se vea como una montaña (por ejemplo, 10 m de altitud como mínimo).
 */
export function niceScale(values: (number | null)[], { minSpan = 1, count = 3, zero = false } = {}): Scale {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return { min: 0, max: 1, ticks: [0, 1] };
  if (zero) lo = Math.min(0, lo);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = zero ? Math.min(0, mid - minSpan / 2) : mid - minSpan / 2;
    hi = lo + minSpan;
  }
  const step = niceStep((hi - lo) / count);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { min, max: max > min ? max : min + step, ticks };
}

/**
 * Índices a dibujar cuando hay muchos más puntos que píxeles: uno de cada `k`, pero conservando
 * en cada tramo el máximo y el mínimo, así no se pierden la cima ni el fondo del perfil.
 */
export function decimate(values: (number | null)[], maxPoints: number): number[] {
  const n = values.length;
  if (n <= maxPoints || maxPoints < 4) return Array.from({ length: n }, (_, i) => i);
  const bucket = Math.ceil(n / (maxPoints / 2));
  const out: number[] = [];
  for (let s = 0; s < n; s += bucket) {
    const e = Math.min(n, s + bucket);
    let lo = -1;
    let hi = -1;
    for (let i = s; i < e; i++) {
      const v = values[i];
      if (v === null) continue;
      if (lo < 0 || v < values[lo]!) lo = i;
      if (hi < 0 || v > values[hi]!) hi = i;
    }
    if (lo < 0) out.push(s);
    else if (lo === hi) out.push(lo);
    else out.push(Math.min(lo, hi), Math.max(lo, hi));
  }
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

/** Índice del valor de `xs` (creciente) más cercano a `x`. */
export function nearestIndex(xs: number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1] - x) <= Math.abs(xs[lo] - x)) return lo - 1;
  return lo;
}

/** Qué etiquetas del eje x mostrar para que no se pisen: todas si son pocas, si no algunas. */
export function labelEvery(count: number, maxLabels: number): number {
  return count <= maxLabels ? 1 : Math.ceil(count / maxLabels);
}
