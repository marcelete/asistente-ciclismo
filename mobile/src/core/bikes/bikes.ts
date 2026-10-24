import type { BikeType } from '../analysis/profileMetrics';
import { BIKE_PRESETS } from '../analysis/profileMetrics';
import type { RideRecord } from '../stats/rides';

/** Una bici del ciclista (hay una por defecto, que se asigna a cada salida que entra). */
export interface Bike {
  id: string;
  name: string;
  type: BikeType;
  weightKg: number | null;
  /** Rodado: "700c", "650b", "29", "27.5", "26" o "20". */
  wheel: string | null;
  /** Ancho de cubierta en mm. */
  tireMm: number | null;
  retired: boolean;
  isDefault: boolean;
  createdT: number;
}

/** Componente de la bici con aviso opcional a los N km (cadena, cubiertas, pastillas…). */
export interface BikePart {
  id: string;
  bikeId: string;
  name: string;
  /** Km de la bici cuando se puso el componente. */
  startKm: number;
  startT: number;
  alertKm: number | null;
}

export const WHEELS: { value: string; label: string }[] = [
  { value: '700c', label: '700c' },
  { value: '650b', label: '650b' },
  { value: '26', label: '26"' },
  { value: '20', label: '20"' },
];

export const BIKE_TYPE_LABEL: Record<BikeType, string> = { road: 'Ruta', gravel: 'Gravel', mtb: 'Montaña', urban: 'Urbana' };

/** Límites aceptados. */
export const BIKE_LIMITS = {
  weightKg: { min: 4, max: 40 },
  tireMm: { min: 18, max: 120 },
} as const;
export const MAX_BIKE_NAME = 60;

/**
 * Resistencia a la rodadura (Crr) según el ancho de cubierta en asfalto. Más ancho es menos
 * rígido y rueda un poco peor; las MTB suman por los tacos. Sin ancho cargado se usa el valor
 * típico de cada tipo de bici.
 */
export function rollingResistance(type: BikeType, tireMm: number | null): number {
  if (tireMm === null) return BIKE_PRESETS[type].crr;
  let crr: number;
  if (tireMm <= 28) crr = 0.0045;
  else if (tireMm <= 35) crr = 0.005;
  else if (tireMm <= 45) crr = 0.0055;
  else if (tireMm <= 55) crr = 0.0065;
  else crr = 0.008;
  return type === 'mtb' ? crr + 0.001 : crr;
}

/** "700×45" para mostrar; vacío si falta algún dato. */
export function tireLabel(b: Pick<Bike, 'wheel' | 'tireMm'>): string | null {
  if (b.tireMm === null) return null;
  const w = b.wheel === '700c' ? '700' : b.wheel === '650b' ? '650' : b.wheel;
  return w ? `${w}×${b.tireMm}` : `${b.tireMm} mm`;
}

/** La bici de una salida: la asignada, o la que está por defecto. */
export function bikeOfRide(r: Pick<RideRecord, 'bikeId'>, bikes: Bike[]): Bike | null {
  return bikes.find((b) => b.id === r.bikeId) ?? bikes.find((b) => b.isDefault) ?? null;
}

export interface BikeTotals {
  km: number;
  rides: number;
  first: number | null;
  last: number | null;
}

/** Km, salidas y fechas de cada bici. Recibe solo las salidas que cuentan. */
export function totalsByBike(rides: RideRecord[], bikes: Bike[]): Map<string, BikeTotals> {
  const out = new Map<string, BikeTotals>();
  for (const b of bikes) out.set(b.id, { km: 0, rides: 0, first: null, last: null });
  for (const r of rides) {
    const b = bikeOfRide(r, bikes);
    if (!b) continue;
    const t = out.get(b.id)!;
    t.km += r.distance / 1000;
    t.rides += 1;
    t.first = t.first === null ? r.startT : Math.min(t.first, r.startT);
    t.last = t.last === null ? r.startT : Math.max(t.last, r.startT);
  }
  return out;
}

/** Km de la bici al momento de poner un componente nuevo (el total de hoy). */
export const currentKm = (totals: Map<string, BikeTotals>, bikeId: string): number => totals.get(bikeId)?.km ?? 0;

export interface PartStatus {
  part: BikePart;
  /** Km recorridos con el componente. */
  km: number;
  /** Si pasó el aviso a los N km. */
  due: boolean;
}

export function partStatus(parts: BikePart[], totals: Map<string, BikeTotals>): PartStatus[] {
  return parts.map((p) => {
    const km = Math.max(0, currentKm(totals, p.bikeId) - p.startKm);
    return { part: p, km, due: p.alertKm !== null && km >= p.alertKm };
  });
}

/** Parámetros del modelo de potencia para una bici (con el peso del ciclista). */
export function energyParams(
  weightKg: number | null,
  bike: Pick<Bike, 'type' | 'weightKg' | 'tireMm'> | null,
  fallback: { bike: BikeType; bikeKg: number | null },
): { massKg: number; bike: BikeType; crr: number } | null {
  if (weightKg === null) return null;
  const type = bike?.type ?? fallback.bike;
  const bikeKg = bike?.weightKg ?? fallback.bikeKg ?? 10;
  // Ciclista + bici + ~1 kg de ropa y caramañola.
  return { massKg: weightKg + bikeKg + 1, bike: type, crr: rollingResistance(type, bike?.tireMm ?? null) };
}
