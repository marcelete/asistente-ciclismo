import { periodRange, ridesIn, totals } from '../stats/periods';
import type { RideRecord } from '../stats/rides';

/** Km totales que se festejan como hitos. */
const MILESTONES_KM = [100, 250, 500, 1000, 2500, 5000, 10000, 20000, 40075];

const dayNumber = (now: number) => Math.floor(now / 86_400_000);

const km = (m: number) => Math.round(m / 1000).toLocaleString('es-AR');

/**
 * Un "dato del día" con los números del ciclista para la pantalla de inicio. Recibe solo las
 * salidas en bici. Sin salidas no hay dato. El dato cambia de un día a otro.
 */
export function funFact(rides: RideRecord[], now: number): string | null {
  if (rides.length === 0) return null;
  const all = totals(rides);
  const week = totals(ridesIn(rides, periodRange('week', now)));
  const facts: string[] = [];

  const next = MILESTONES_KM.find((m) => m * 1000 > all.distance);
  if (next !== undefined) facts.push(`Te faltan ${km(next * 1000 - all.distance)} km para los ${next.toLocaleString('es-AR')} km.`);
  facts.push(`Ya sumás ${km(all.distance)} km en ${all.rides} ${all.rides === 1 ? 'salida' : 'salidas'}.`);
  if (week.rides > 0) facts.push(`Esta semana llevás ${km(week.distance)} km en ${week.rides} ${week.rides === 1 ? 'salida' : 'salidas'}.`);
  if (all.elevationGain > 0) facts.push(`Subiste ${Math.round(all.elevationGain).toLocaleString('es-AR')} m en total.`);

  return facts[dayNumber(now) % facts.length];
}

/** Consejos livianos que rotan mientras carga la app. */
export const TIPS = [
  'Inflá las cubiertas antes de salir: se nota más que cualquier componente.',
  'La mejor subida es la que ya terminaste.',
  'Un poco de viento en contra hoy es viento a favor mañana.',
  'Tomá agua antes de tener sed.',
  'Las bajadas no se regalan: se ganan subiendo.',
  'Ajustá el asiento: tus rodillas te lo van a agradecer.',
  'Si no está en el GPX, no pasó. (Pero igual te creemos.)',
  'Cadena limpia, cadena feliz.',
  'El casco, siempre. Sin excusas.',
  'Una salida corta también suma a la racha.',
];

/** Un consejo por segundo de espera, en orden pero arrancando por uno distinto cada día. */
export function tipAt(index: number, now: number): string {
  return TIPS[(index + dayNumber(now)) % TIPS.length];
}
