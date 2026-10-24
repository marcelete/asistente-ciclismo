/** Duraciones estándar de la curva de mejores esfuerzos, en segundos. */
export const STANDARD_DURATIONS_SEC = [5, 10, 30, 60, 300, 600, 1200, 1800, 3600, 7200] as const;

export interface BestEffort {
  durationSec: number;
  /** Mejor promedio de la serie en esa duración. */
  value: number;
  /** Índice (segundo) donde empieza la ventana. */
  startIndex: number;
}

/**
 * Mejor promedio móvil para cada duración sobre una serie a 1 Hz.
 * Las ventanas con algún valor nulo (hueco de datos) se descartan.
 * Complejidad O(n · d) con sumas acumuladas.
 */
export function bestEfforts(
  series: (number | null)[],
  durations: readonly number[] = STANDARD_DURATIONS_SEC,
): BestEffort[] {
  const n = series.length;
  const prefix = new Float64Array(n + 1);
  const nulls = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = series[i];
    prefix[i + 1] = prefix[i] + (v ?? 0);
    nulls[i + 1] = nulls[i] + (v === null ? 1 : 0);
  }
  const out: BestEffort[] = [];
  for (const d of durations) {
    if (d > n) continue;
    let best = -Infinity;
    let bestStart = -1;
    for (let s = 0; s + d <= n; s++) {
      if (nulls[s + d] - nulls[s] > 0) continue;
      const mean = (prefix[s + d] - prefix[s]) / d;
      if (mean > best) {
        best = mean;
        bestStart = s;
      }
    }
    if (bestStart >= 0) out.push({ durationSec: d, value: best, startIndex: bestStart });
  }
  return out;
}
