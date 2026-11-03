export const DAY_MS = 86_400_000;

/** Suma días de calendario en hora local (no cambia la hora cuando hay cambio de horario). */
export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Medianoche local del día de `t`. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Días de calendario entre dos instantes (b - a), contando por día local. */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

/** Fecha local AAAA-MM-DD. */
export function dateKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lunes a las 00:00 locales de la semana de `t`. */
export function mondayOf(t: number): number {
  const d = new Date(startOfDay(t));
  return addDays(d.getTime(), -((d.getDay() + 6) % 7));
}

/** Número de semana (desde 0) de `t` respecto del inicio `startT` (un lunes). */
export function weekIndex(startT: number, t: number): number {
  return Math.floor(daysBetween(startT, t) / 7);
}
