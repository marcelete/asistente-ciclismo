/**
 * Tiempo estimado para una distancia, ajustando t = a·d^b sobre tus mejores tiempos (b entre 1,0
 * y 1,25: cuanto más largo, más se enlentece el ritmo). Se calcula con tu forma actual (últimos
 * 90 días) y con la histórica.
 */
export interface EffortPoint {
  /** Metros. */
  distance: number;
  /** Segundos. */
  seconds: number;
}

export interface DistanceFit {
  a: number;
  b: number;
  /** La distancia más larga que respalda el ajuste, en metros. */
  maxDistance: number;
}

export const B_MIN = 1.0;
export const B_MAX = 1.25;

/** Ajuste por mínimos cuadrados en escala logarítmica; null con menos de 2 distancias distintas. */
export function fitDistance(points: EffortPoint[]): DistanceFit | null {
  const pts = points.filter((p) => p.distance > 0 && p.seconds > 0);
  if (new Set(pts.map((p) => p.distance)).size < 2) return null;
  const xs = pts.map((p) => Math.log(p.distance));
  const ys = pts.map((p) => Math.log(p.seconds));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const b = Math.min(B_MAX, Math.max(B_MIN, num / den));
  // Con b acotado se recalcula a para que la recta pase por el centro de los datos.
  const a = Math.exp(my - b * mx);
  return { a, b, maxDistance: Math.max(...pts.map((p) => p.distance)) };
}

export interface DistancePrediction {
  distance: number;
  seconds: number;
  /** Más del doble de lo que respaldan tus datos: es una extrapolación. */
  extrapolated: boolean;
}

export function predictTime(fit: DistanceFit, distance: number): DistancePrediction {
  return { distance, seconds: fit.a * distance ** fit.b, extrapolated: distance > fit.maxDistance * 2 };
}

/** Mejor tiempo de cada distancia entre varias salidas (efforts: metros → segundos). */
export function bestEfforts(all: (Record<number, number> | null)[]): EffortPoint[] {
  const best = new Map<number, number>();
  for (const e of all) {
    if (!e) continue;
    for (const [k, v] of Object.entries(e)) {
      const d = Number(k);
      if (Number.isFinite(v) && v > 0 && (!best.has(d) || v < best.get(d)!)) best.set(d, v);
    }
  }
  return [...best.entries()].map(([distance, seconds]) => ({ distance, seconds }));
}
