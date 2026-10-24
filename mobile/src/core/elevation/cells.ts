/**
 * El modelo de terreno de Open-Meteo (Copernicus GLO-90) devuelve el valor de la celda de 3″
 * (unos 90 m) donde cae la coordenada, sin interpolar. Dos puntos de la misma celda tienen la
 * misma altitud, así que alcanza una consulta por celda, y esa altitud se puede guardar para
 * siempre (ver data/dbDem).
 */
export const CELLS_PER_DEGREE = 1200;

export interface Cell {
  cy: number;
  cx: number;
}

/** Celda de una coordenada, calculada sobre la coordenada ya redondeada que se manda. */
export function cellOf(lat: number, lon: number): Cell {
  return { cy: Math.floor(lat * CELLS_PER_DEGREE), cx: Math.floor(lon * CELLS_PER_DEGREE) };
}

export const cellKey = (c: Cell): string => `${c.cy},${c.cx}`;

/** Redondea como se manda a la API (4 decimales). */
export function sentCoord(v: number, decimals = 4): number {
  return Number(v.toFixed(decimals));
}
