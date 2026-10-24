/**
 * CSV para planillas y para pasarle los datos a una IA: RFC 4180, separador coma, decimal punto,
 * UTF-8 con BOM (Excel lo necesita para mostrar bien las tildes) y fechas ISO con huso horario.
 */

export type CsvValue = string | number | boolean | null | undefined;

export const CSV_BOM = '﻿';

/**
 * Un texto que empieza con = + - @ (o tabulación o retorno) lo toma una planilla como fórmula:
 * se le antepone una comilla simple para que quede como texto.
 */
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  const t = neutralizeFormula(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Arma el CSV completo (con BOM y fin de línea CRLF, como pide el RFC). */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

/** Redondea para el CSV sin dejar ceros ni notación científica. */
export function num(v: number | null | undefined, decimals = 2): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const k = 10 ** decimals;
  return Math.round(v * k) / k;
}

/** Fecha y hora ISO 8601 con el huso horario del teléfono ("2026-10-23T08:15:00-03:00"). */
export function isoLocal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`
  );
}
