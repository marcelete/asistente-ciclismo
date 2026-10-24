import { LocalProjection, buildSegmentGrid, resamplePolyline, withinTolerance } from '../geo/polyline';
import type { LatLon, XY } from '../geo/polyline';

export interface RouteSimilarityOptions {
  /** Distancia máxima a la otra traza para contar un punto como coincidente, en metros. */
  tolerance: number;
  /** Separación de los puntos de comparación, en metros. */
  step: number;
}

export const DEFAULT_ROUTE_OPTIONS: RouteSimilarityOptions = { tolerance: 40, step: 50 };

/**
 * Porción de los puntos de `a` que están a menos de `tol` metros de la polilínea `b`. Usa una
 * grilla espacial de tramos de `b`: da el mismo resultado que recorrerlos todos, pero sin el costo O(n·m).
 */
function coverage(a: XY[], b: XY[], tol: number): number {
  if (a.length === 0 || b.length < 2) return 0;
  const grid = buildSegmentGrid(b, tol);
  let hit = 0;
  for (const p of a) if (withinTolerance(p, b, grid, tol)) hit++;
  return hit / a.length;
}

/**
 * Similitud entre dos recorridos (0 a 1): la menor de las dos coberturas mutuas. Vale cerca de 1
 * solo si cada traza queda dentro de la otra, es decir, hicieron el mismo camino. Una salida
 * que contiene a otra más corta como parte de su recorrido da un valor bajo.
 */
export function routeSimilarity(
  a: LatLon[],
  b: LatLon[],
  options: Partial<RouteSimilarityOptions> = {},
): number {
  const o = { ...DEFAULT_ROUTE_OPTIONS, ...options };
  if (a.length < 2 || b.length < 2) return 0;
  const proj = new LocalProjection(a[0].lat, a[0].lon);
  const pa = resamplePolyline(a.map((p) => proj.toXY(p)), o.step);
  const pb = resamplePolyline(b.map((p) => proj.toXY(p)), o.step);
  return Math.min(coverage(pa, pb, o.tolerance), coverage(pb, pa, o.tolerance));
}

/** Dos recorridos se consideran el mismo si su similitud llega a `threshold`. */
export function isSameRoute(
  a: LatLon[],
  b: LatLon[],
  threshold = 0.9,
  options: Partial<RouteSimilarityOptions> = {},
): boolean {
  return routeSimilarity(a, b, options) >= threshold;
}
