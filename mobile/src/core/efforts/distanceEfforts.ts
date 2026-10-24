/** Distancias de los mejores tiempos, en metros. */
export const EFFORT_DISTANCES_M = [1000, 5000, 10000, 20000, 40000, 50000, 100000] as const;

/** Velocidad máxima creíble (m/s): una ventana más rápida que esto es un error de datos. */
const MAX_PLAUSIBLE_SPEED = 28;

interface Timed {
  d: number;
  t: number | null;
}

/**
 * Mejor tiempo (en segundos, paradas incluidas) para recorrer cada distancia dentro de la salida.
 * Entre dos puntos del perfil el tiempo se interpola en línea recta; con ese modelo la ventana
 * más rápida siempre empieza o termina en un punto, así que alcanza con probar esas dos familias.
 * Devuelve solo las distancias que entran en la salida.
 */
export function fastestDistances(
  points: Timed[],
  distances: readonly number[] = EFFORT_DISTANCES_M,
): Record<number, number> {
  const D: number[] = [];
  const T: number[] = [];
  for (const p of points) {
    if (p.t === null) continue;
    // Se descartan retrocesos (datos dañados) para que la interpolación sea monótona.
    if (D.length > 0 && (p.d < D[D.length - 1] || p.t < T[T.length - 1])) continue;
    D.push(p.d);
    T.push(p.t);
  }
  const out: Record<number, number> = {};
  const n = D.length;
  if (n < 2) return out;
  const total = D[n - 1] - D[0];

  // Tiempo en la distancia x, buscando desde el índice `from` (los recorridos son crecientes).
  const timeAt = (x: number, from: number): { t: number; k: number } => {
    let k = from;
    while (k < n - 2 && D[k + 1] < x) k++;
    const span = D[k + 1] - D[k];
    const f = span > 0 ? (x - D[k]) / span : 0;
    return { t: T[k] + (T[k + 1] - T[k]) * f, k };
  };

  for (const L of distances) {
    if (L > total) continue;
    let best = Infinity;
    // Ventanas que empiezan en un punto.
    let k = 0;
    for (let i = 0; i < n && D[i] + L <= D[n - 1]; i++) {
      const end = timeAt(D[i] + L, Math.max(k, i));
      k = end.k;
      best = Math.min(best, end.t - T[i]);
    }
    // Ventanas que terminan en un punto.
    k = 0;
    for (let j = 0; j < n; j++) {
      if (D[j] - L < D[0]) continue;
      const start = timeAt(D[j] - L, k);
      k = start.k;
      best = Math.min(best, T[j] - start.t);
    }
    if (Number.isFinite(best) && best >= L / MAX_PLAUSIBLE_SPEED) out[L] = Math.round(best * 10) / 10;
  }
  return out;
}

/** Valida los mejores tiempos leídos de la base. */
export function sanitizeEfforts(raw: unknown): Record<number, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const d = Number(k);
    if (Number.isInteger(d) && d > 0 && typeof v === 'number' && Number.isFinite(v) && v > 0) out[d] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}
