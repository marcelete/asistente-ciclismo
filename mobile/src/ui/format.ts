import { effortLabel } from '../core/efforts/distanceEfforts';

/**
 * Formatos de números y fechas en español rioplatense: coma decimal y punto de miles. Todos
 * devuelven "--" si el valor no es un número válido, en vez de mostrar "NaN".
 */

/** Número con punto de miles y coma decimal: formatNumber(1234.5, 1) → "1.234,5". */
export function formatNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '--';
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  // Sin signo para "-0,0": un valor que redondea a cero no es negativo.
  const sign = n < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? `,${dec}` : ''}`;
}

/** m/s → km/h con un decimal ("25,0"). */
export function formatKmh(mps: number): string {
  return formatNumber(mps * 3.6, 1);
}

/** Segundos por km → "5:32" (null o inválido → "--"). */
export function formatPaceSec(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '--';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Lee un tiempo escrito como "50:00", "1:45:30" o "45" (minutos). Devuelve segundos, o null si
 * no se entiende.
 */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(':').map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/** Segundos → "50:00" o "1:45:30", para volver a mostrar lo que se cargó. */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Ritmo de correr: m/s → "5:32" (min/km). Más lento que 30 min/km o detenido → "--". */
export function formatPace(mps: number): string {
  if (!Number.isFinite(mps) || mps <= 1000 / 1800) return '--';
  return formatPaceSec(1000 / mps);
}

/** Velocidad o ritmo según el deporte: el número y su unidad. */
export function speedFor(sport: 'bike' | 'run', mps: number): { value: string; unit: string } {
  return sport === 'run' ? { value: formatPace(mps), unit: '/km' } : { value: formatKmh(mps), unit: 'km/h' };
}

/**
 * Metros → kilómetros: dos decimales hasta 100 km ("4,17"), uno hasta 1.000 ("142,5") y ninguno
 * después ("1.234"), para que los totales grandes se lean de un vistazo.
 */
export function formatKm(meters: number): string {
  const km = meters / 1000;
  return formatNumber(km, Math.abs(km) < 100 ? 2 : Math.abs(km) < 1000 ? 1 : 0);
}

/** Unidades que se cuentan de a uno: van sin decimales y con singular ("1 salida"). */
const COUNT_UNITS: Record<string, string> = {
  salidas: 'salida',
  carreras: 'carrera',
  días: 'día',
  semanas: 'semana',
  metas: 'meta',
  récords: 'récord',
  veces: 'vez',
};

/**
 * Lo que falta para un premio: "Te falta 1 salida", "Te faltan 3 días", "Te faltan 4,5 km".
 * Las cuentas se redondean hacia arriba; las medidas llevan un decimal si faltan menos de 10.
 */
export function formatRemaining(left: number, unit: string): string {
  const n = Math.max(0, left);
  if (!Number.isFinite(n)) return '--';
  const singular = COUNT_UNITS[unit];
  if (singular) {
    const count = Math.ceil(n);
    return count === 1 ? `Te falta 1 ${singular}` : `Te faltan ${formatNumber(count)} ${unit}`;
  }
  return `Te faltan ${formatNumber(n, n < 10 ? 1 : 0)} ${unit}`.trim();
}

/** Segundos → "h:mm:ss" (o "m:ss" si dura menos de una hora). */
export function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return '--';
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Metros enteros con separador de miles de punto ("1.234"). */
export function formatMeters(m: number | null): string {
  if (m === null || !Number.isFinite(m)) return '--';
  return formatNumber(Math.round(m));
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** Fecha y hora local ("19/10/2026 18:05"). */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Hora local ("18:05"). */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/**
 * Fecha de una salida relativa a hoy: "Hoy · 18:05", "Ayer · 07:30", "lun 19/10 · 18:05" este año
 * y "19/10/2025 · 18:05" en años anteriores.
 */
export function formatRideDate(ms: number, now: number): string {
  const d = new Date(ms);
  const today = new Date(now);
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayStart(today) - dayStart(d)) / 86400000);
  const clock = formatClock(ms);
  if (diffDays === 0) return `Hoy · ${clock}`;
  if (diffDays === 1) return `Ayer · ${clock}`;
  if (d.getFullYear() === today.getFullYear()) {
    return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${clock}`;
  }
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} · ${clock}`;
}

/** Fecha corta sin hora ("19/10/2026"). */
export function formatDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Segundos → "12 h 05 min" para totales largos ("45 min" si dura menos de una hora). */
export function formatHours(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return '--';
  const min = Math.round(Math.max(0, totalSec) / 60);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`;
}

export interface Change {
  /** Porcentaje sin signo ("12 %"): el sentido lo da `dir`, que se muestra con una flecha. */
  text: string;
  dir: 'up' | 'down' | 'same';
}

/** Variación frente a un valor anterior, o null si no hay con qué comparar. */
export function formatChange(now: number, before: number): Change | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${formatNumber(Math.abs(pct))} %`, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'same' };
}

/** Distancia de un mejor tiempo ("1 km", "40 km", "100 km"). */
export function formatEffortDistance(m: number): string {
  return effortLabel(m);
}

/**
 * Lee una cantidad escrita a mano. Acepta coma o punto decimal ("12,5", "12.5") y punto de miles
 * ("1.500" es mil quinientos, como se escribe en Argentina). Devuelve null si no es un número.
 */
export function parseDecimal(text: string): number | null {
  const s = text.trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return Number(s.replace(',', '.'));
  return null;
}

/** Punto cardinal de un rumbo en grados ("NE", "S"…), para decir de dónde sopla el viento. */
export function cardinal(deg: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
