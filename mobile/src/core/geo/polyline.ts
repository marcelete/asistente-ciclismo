export interface LatLon {
  lat: number;
  lon: number;
}

export interface XY {
  x: number;
  y: number;
}

/**
 * Proyección plana local (equirectangular) alrededor de un punto de referencia. Para distancias
 * de pocos kilómetros el error es despreciable y permite usar geometría simple en metros.
 */
export class LocalProjection {
  private readonly kLat = 110574;
  private readonly kLon: number;

  constructor(
    private readonly lat0: number,
    private readonly lon0: number,
  ) {
    this.kLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  }

  toXY(p: LatLon): XY {
    return { x: (p.lon - this.lon0) * this.kLon, y: (p.lat - this.lat0) * this.kLat };
  }
}

/** Distancias acumuladas (m) a lo largo de una polilínea en el plano. */
export function cumulativeLengths(pts: XY[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) {
    out.push(out[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return out;
}

export interface Projected {
  /** Distancia del punto a la polilínea, en metros. */
  distance: number;
  /** Posición a lo largo de la polilínea del punto más cercano, en metros. */
  along: number;
}

/** Punto más cercano de una polilínea a `p`. `cum` son las distancias acumuladas de `pts`. */
export function projectOnPolyline(p: XY, pts: XY[], cum: number[]): Projected {
  let best: Projected = { distance: Infinity, along: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < best.distance) best = { distance: d, along: cum[i] + t * Math.sqrt(len2) };
  }
  return best;
}

/** Remuestrea una polilínea cada `stepM` metros. */
export function resamplePolyline(pts: XY[], stepM: number): XY[] {
  if (pts.length < 2) return pts.slice();
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1];
  const out: XY[] = [];
  let j = 0;
  for (let d = 0; d <= total; d += stepM) {
    while (j < pts.length - 2 && cum[j + 1] < d) j++;
    const span = cum[j + 1] - cum[j];
    const f = span === 0 ? 0 : (d - cum[j]) / span;
    out.push({ x: pts[j].x + (pts[j + 1].x - pts[j].x) * f, y: pts[j].y + (pts[j + 1].y - pts[j].y) * f });
  }
  return out;
}

/** Grilla que guarda, por celda, los tramos de una polilínea que pasan a menos de `cell` metros. */
export type SegmentGrid = { cell: number; cells: Map<string, number[]> };

const cellKeyOf = (x: number, y: number, cell: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;

export function buildSegmentGrid(pts: XY[], cell: number): SegmentGrid {
  const cells = new Map<string, number[]>();
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const x0 = Math.floor((Math.min(a.x, b.x) - cell) / cell);
    const x1 = Math.floor((Math.max(a.x, b.x) + cell) / cell);
    const y0 = Math.floor((Math.min(a.y, b.y) - cell) / cell);
    const y1 = Math.floor((Math.max(a.y, b.y) + cell) / cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = `${cx},${cy}`;
        const list = cells.get(k);
        if (list) list.push(i);
        else cells.set(k, [i]);
      }
    }
  }
  return { cell, cells };
}

/** ¿Hay algún tramo de la polilínea a `tol` metros o menos de `p`? (la grilla se armó con cell = tol). */
export function withinTolerance(p: XY, pts: XY[], grid: SegmentGrid, tol: number): boolean {
  const list = grid.cells.get(cellKeyOf(p.x, p.y, grid.cell));
  if (!list) return false;
  for (const i of list) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= tol) return true;
  }
  return false;
}
