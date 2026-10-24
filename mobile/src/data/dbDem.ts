import { cellKey } from '../core/elevation/cells';
import type { Cell } from '../core/elevation/cells';
import { chunk } from '../core/elevation/profile';
import { conn } from './db';

/**
 * Caché de altitud por celda del modelo de terreno. Guarda ubicación aproximada (una celda de
 * ~90 m), así que "Borrar todos mis datos" la vacía. Nunca se guardan celdas de la zona privada,
 * porque esos puntos no se consultan.
 */

/** Altitudes ya conocidas de las celdas pedidas. */
export function getCells(cells: Cell[]): Map<string, number> {
  const out = new Map<string, number>();
  const d = conn();
  for (const part of chunk(cells, 200)) {
    const rows = d.getAllSync<{ cy: number; cx: number; alt: number }>(
      `SELECT cy, cx, alt FROM dem_cells WHERE (cy, cx) IN (VALUES ${part.map(() => '(?, ?)').join(', ')})`,
      part.flatMap((c) => [c.cy, c.cx]),
    );
    for (const r of rows) out.set(cellKey(r), r.alt);
  }
  return out;
}

export async function putCells(cells: (Cell & { alt: number })[]): Promise<void> {
  if (cells.length === 0) return;
  const d = conn();
  d.withTransactionSync(() => {
    for (const c of cells) d.runSync('INSERT OR REPLACE INTO dem_cells (cy, cx, alt) VALUES (?, ?, ?)', [c.cy, c.cx, c.alt]);
  });
}

export function countCells(): number {
  return conn().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM dem_cells')?.n ?? 0;
}
