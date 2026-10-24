/** Fecha de nacimiento: se escribe como DD/MM/AAAA y se guarda como AAAA-MM-DD. */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ¿Existe ese día en el calendario? (31/02 no existe.) */
function isRealDay(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** Deja solo los dígitos (hasta 8) y pone las barras mientras se escribe: "25031990" → "25/03/1990". */
export function maskBirthDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** AAAA-MM-DD → DD/MM/AAAA ('' si no es una fecha válida). */
export function birthDateToText(iso: string | null): string {
  const m = iso ? ISO.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** ¿`iso` es AAAA-MM-DD, existe en el calendario y su año está entre los dos límites? */
export function isValidBirthDate(iso: unknown, minYear: number, maxYear: number): iso is string {
  const m = typeof iso === 'string' ? ISO.exec(iso) : null;
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return year >= minYear && year <= maxYear && isRealDay(year, month, day);
}

/**
 * Lee lo escrito en el campo. Vacío es "no lo cargo" (sin error); incompleto, inexistente, futuro o
 * fuera de rango devuelve el error a mostrar.
 */
export function parseBirthDate(
  text: string,
  nowMs: number,
  minYear: number,
  maxYear: number,
): { iso: string | null; error: string | null } {
  const t = text.trim();
  if (t === '') return { iso: null, error: null };
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return { iso: null, error: 'Escribila como día/mes/año, por ejemplo 25/03/1990.' };
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isRealDay(year, month, day)) return { iso: null, error: 'Esa fecha no existe.' };
  if (year < minYear || year > maxYear) return { iso: null, error: `El año tiene que estar entre ${minYear} y ${maxYear}.` };
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (iso > new Date(nowMs).toISOString().slice(0, 10)) return { iso: null, error: 'La fecha no puede ser futura.' };
  return { iso, error: null };
}

/** Años cumplidos a la fecha `nowMs` (hora local del teléfono); null si no hay fecha válida. */
export function ageOn(iso: string | null, nowMs: number): number | null {
  const m = iso ? ISO.exec(iso) : null;
  if (!m) return null;
  const now = new Date(nowMs);
  let age = now.getFullYear() - Number(m[1]);
  const beforeBirthday = now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]));
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}
