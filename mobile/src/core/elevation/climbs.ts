export interface Climb {
  startIndex: number;
  endIndex: number;
  /** Distancia acumulada al inicio y al final, en metros. */
  startDist: number;
  endDist: number;
  length: number;
  gain: number;
  /** Pendiente media como porcentaje (5 = 5 %). */
  avgGrade: number;
  /** Pendiente máxima sostenida en ~200 m, como porcentaje. */
  maxGrade: number;
}

export interface ClimbOptions {
  /** Desnivel mínimo para considerarlo una subida, en metros. */
  minGain: number;
  /** Pendiente media mínima, en %. */
  minGrade: number;
  /** Longitud mínima, en metros. */
  minLength: number;
  /** Umbral pico-valle para separar tramos, en metros (por encima del ruido de altitud). */
  swing: number;
  /** Una bajada menor a este desnivel entre dos subidas las une en una sola, en metros. */
  mergeDrop: number;
}

export const DEFAULT_CLIMB_OPTIONS: ClimbOptions = {
  minGain: 30,
  minGrade: 3,
  minLength: 500,
  swing: 8,
  mergeDrop: 15,
};

/** Índices de picos y valles alternados (filtro zigzag con umbral `swing`). */
function turningPoints(alt: number[], swing: number): number[] {
  if (alt.length < 2) return [];
  // Empates: un valle usa el último índice de la meseta (donde empieza la subida) y un pico
  // el primero (donde termina), para que los límites de la subida no incluyan tramos llanos.
  const pts: number[] = [];
  let dir = 0;
  let extIdx = 0;
  let loIdx = 0;
  let hiIdx = 0;
  for (let i = 1; i < alt.length; i++) {
    if (dir === 0) {
      if (alt[i] <= alt[loIdx]) loIdx = i;
      if (alt[i] > alt[hiIdx]) hiIdx = i;
      if (alt[hiIdx] - alt[loIdx] >= swing) {
        if (i === hiIdx) {
          pts.push(loIdx);
          dir = 1;
        } else {
          pts.push(hiIdx);
          dir = -1;
        }
        extIdx = i;
      }
      continue;
    }
    if (dir === 1) {
      if (alt[i] > alt[extIdx]) extIdx = i;
      else if (alt[extIdx] - alt[i] >= swing) {
        pts.push(extIdx);
        dir = -1;
        extIdx = i;
      }
    } else {
      if (alt[i] <= alt[extIdx]) extIdx = i;
      else if (alt[i] - alt[extIdx] >= swing) {
        pts.push(extIdx);
        dir = 1;
        extIdx = i;
      }
    }
  }
  if (dir === 0) return [];
  pts.push(extIdx);
  return pts;
}

/**
 * Detecta subidas a partir de la distancia acumulada y la altitud suavizada.
 * Une subidas separadas por bajadas pequeñas y descarta las cortas o suaves.
 */
export function detectClimbs(
  dist: number[],
  alt: number[],
  options: Partial<ClimbOptions> = {},
): Climb[] {
  const o = { ...DEFAULT_CLIMB_OPTIONS, ...options };
  const pts = turningPoints(alt, o.swing);
  if (pts.length < 2) return [];

  // Tramos valle → pico.
  const legs: { s: number; e: number }[] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    if (alt[pts[k + 1]] > alt[pts[k]]) legs.push({ s: pts[k], e: pts[k + 1] });
  }
  // Unir subidas separadas por una bajada chica.
  const merged: { s: number; e: number }[] = [];
  for (const leg of legs) {
    const prev = merged[merged.length - 1];
    if (prev && alt[prev.e] - alt[leg.s] <= o.mergeDrop && alt[leg.e] > alt[prev.e]) {
      prev.e = leg.e;
    } else {
      merged.push({ ...leg });
    }
  }

  const climbs: Climb[] = [];
  for (const m of merged) {
    const length = dist[m.e] - dist[m.s];
    const gain = alt[m.e] - alt[m.s];
    if (length <= 0) continue;
    const avgGrade = (gain / length) * 100;
    if (gain < o.minGain || avgGrade < o.minGrade || length < o.minLength) continue;
    climbs.push({
      startIndex: m.s,
      endIndex: m.e,
      startDist: dist[m.s],
      endDist: dist[m.e],
      length,
      gain,
      avgGrade,
      maxGrade: maxSustainedGrade(dist, alt, m.s, m.e, 200),
    });
  }
  return climbs;
}

/** Mayor pendiente medida sobre ventanas de `windowM` metros dentro de [s, e]. */
function maxSustainedGrade(dist: number[], alt: number[], s: number, e: number, windowM: number): number {
  let best = 0;
  let j = s;
  for (let i = s; i <= e; i++) {
    while (j < e && dist[j] - dist[i] < windowM) j++;
    const run = dist[j] - dist[i];
    if (run >= windowM * 0.8) best = Math.max(best, ((alt[j] - alt[i]) / run) * 100);
  }
  return best;
}
