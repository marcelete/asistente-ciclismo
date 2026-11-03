/**
 * Catálogo de premios (insignias). La clave de cada una es `badge:<familia>:<umbral>`, estable
 * aunque cambie el orden en que llegan las salidas. Los niveles (bronce, plata, oro y platino)
 * salen de la posición del umbral dentro de su familia. Cada deporte tiene sus premios (pedido 15):
 * las claves de correr llevan el prefijo `run:` y algunas familias cambian de umbrales y textos.
 */
import type { TrainSport } from '../stats/sport';

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';
export const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'platinum'];
export const TIER_LABEL: Record<Tier, string> = { bronze: 'Bronce', silver: 'Plata', gold: 'Oro', platinum: 'Platino' };

export type AwardMetric =
  | 'km'
  | 'gain'
  | 'rides'
  | 'rideKm'
  | 'rideGain'
  | 'rideHours'
  | 'streakDays'
  | 'streakWeeks'
  | 'goals'
  | 'avgSpeed'
  | 'monthKm'
  | 'records'
  | 'bikeKm'
  | 'route'
  | 'cold'
  | 'heat'
  | 'wind'
  | 'daypart';

export interface BadgeFamily {
  id: AwardMetric;
  /** Cómo se llama la familia en la vitrina. */
  label: string;
  unit: string;
  thresholds: number[];
  /** Título del premio para un umbral. */
  title: (th: number) => string;
  /** Si el umbral depende de la altitud (hay que esperar al mapa de terreno antes de festejarlo). */
  usesGain?: boolean;
}

const n = (v: number) => v.toLocaleString('es-AR');

const MOUNTAINS: Record<number, string> = {
  2790: 'Cerro Champaquí',
  4806: 'Mont Blanc',
  6961: 'Aconcagua',
  8849: 'Everest',
  17698: 'Dos veces el Everest',
  100000: 'Línea de Kármán',
};

export const FAMILIES: BadgeFamily[] = [
  {
    id: 'km',
    label: 'Kilómetros totales',
    unit: 'km',
    thresholds: [100, 250, 500, 1000, 2500, 5000, 10000, 20000, 40075],
    title: (t) => (t === 40075 ? 'Vuelta al mundo: 40.075 km' : `${n(t)} km en total`),
  },
  {
    id: 'gain',
    label: 'Desnivel total',
    unit: 'm',
    thresholds: [1000, 2790, 4806, 6961, 8849, 17698, 50000, 100000],
    title: (t) => (MOUNTAINS[t] ? `${MOUNTAINS[t]} (${n(t)} m de subida)` : `${n(t)} m de subida`),
    usesGain: true,
  },
  {
    id: 'rides',
    label: 'Cantidad de salidas',
    unit: 'salidas',
    thresholds: [1, 10, 25, 50, 100, 250, 500, 900, 1000],
    title: (t) => (t === 1 ? 'Tu primera salida' : `Salida número ${n(t)}`),
  },
  {
    id: 'rideKm',
    label: 'Salida larga',
    unit: 'km',
    thresholds: [20, 50, 100, 160, 200],
    title: (t) => `Una salida de ${t} km`,
  },
  {
    id: 'rideGain',
    label: 'Salida con subida',
    unit: 'm',
    thresholds: [500, 1000, 2000],
    title: (t) => `${n(t)} m de subida en una salida`,
    usesGain: true,
  },
  {
    id: 'rideHours',
    label: 'Salida de muchas horas',
    unit: 'h',
    thresholds: [2, 3, 4, 6],
    title: (t) => `${t} horas pedaleando en una salida`,
  },
  {
    id: 'streakDays',
    label: 'Racha de días',
    unit: 'días',
    thresholds: [3, 7, 14, 30],
    title: (t) => `${t} días seguidos`,
  },
  {
    id: 'streakWeeks',
    label: 'Racha de semanas',
    unit: 'semanas',
    thresholds: [4, 8, 12, 26, 52],
    title: (t) => `${t} semanas seguidas`,
  },
  {
    id: 'goals',
    label: 'Metas cumplidas',
    unit: 'metas',
    thresholds: [1, 5, 10, 25],
    title: (t) => (t === 1 ? 'Tu primera meta cumplida' : `${t} metas cumplidas`),
  },
  {
    id: 'daypart',
    label: 'Horarios',
    unit: '',
    thresholds: [1, 2],
    // 1 = madrugador, 2 = nocturno.
    title: (t) => (t === 1 ? 'Madrugador: salida antes de las 7' : 'Nocturno: salida después de las 21'),
  },
  {
    id: 'avgSpeed',
    label: 'Velocidad media (salidas de 20 km o más)',
    unit: 'km/h',
    thresholds: [20, 25, 30],
    title: (t) => `${t} km/h de media en 20 km o más`,
  },
  {
    id: 'monthKm',
    label: 'Kilómetros en un mes',
    unit: 'km',
    thresholds: [200, 500, 1000],
    title: (t) => `${n(t)} km en un mes`,
  },
  {
    id: 'records',
    label: 'Récords superados',
    unit: 'récords',
    thresholds: [1, 10, 50],
    title: (t) => (t === 1 ? 'Tu primer récord superado' : `${t} récords superados`),
  },
  {
    id: 'route',
    label: 'Mismo recorrido',
    unit: 'veces',
    thresholds: [5, 10, 25],
    title: (t) => `Hiciste el mismo recorrido ${t} veces`,
  },
  {
    id: 'cold',
    label: 'Frío',
    unit: '°C',
    // El valor es cuánto bajo de 10 °C hizo: 5 = salida con 5 °C o menos, 10 = con 0 °C o menos.
    thresholds: [5, 10],
    title: (t) => `Salida con ${10 - t} °C o menos`,
  },
  {
    id: 'heat',
    label: 'Calor',
    unit: '°C',
    thresholds: [32, 38],
    title: (t) => `Salida con ${t} °C o más`,
  },
  {
    id: 'wind',
    label: 'Viento',
    unit: 'km/h',
    thresholds: [30, 45],
    title: (t) => `Salida con viento de ${t} km/h o más`,
  },
  {
    id: 'bikeKm',
    label: 'Kilómetros con una bici',
    unit: 'km',
    thresholds: [1000, 5000, 10000],
    title: (t) => `${n(t)} km con la misma bici`,
  },
];

/** Ritmo "m:ss" de una velocidad en km/h. */
const paceOf = (kmh: number) => {
  const sec = Math.round(3600 / kmh);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

const RUN_DISTANCE_NAME: Record<number, string> = { 21.1: 'Media maratón', 42.2: 'Maratón' };

/** Cambios de las familias para correr; las que no están quedan iguales (salvo `bikeKm`, que no va). */
const RUN_FAMILIES: Partial<Record<AwardMetric, Partial<BadgeFamily>>> = {
  km: { thresholds: [50, 100, 250, 500, 1000, 2500, 5000, 10000], title: (t) => `${n(t)} km corridos en total` },
  rides: {
    label: 'Cantidad de carreras',
    unit: 'carreras',
    thresholds: [1, 10, 25, 50, 100, 250, 500, 1000],
    title: (t) => (t === 1 ? 'Tu primera carrera' : `Carrera número ${n(t)}`),
  },
  rideKm: {
    label: 'Carrera larga',
    thresholds: [5, 10, 21.1, 30, 42.2],
    title: (t) => (RUN_DISTANCE_NAME[t] ? `${RUN_DISTANCE_NAME[t]}: ${n(t)} km` : `Una carrera de ${n(t)} km`),
  },
  rideGain: { label: 'Carrera con subida', thresholds: [200, 500, 1000], title: (t) => `${n(t)} m de subida en una carrera` },
  rideHours: { label: 'Carrera de muchas horas', thresholds: [1, 1.5, 2, 3], title: (t) => `${n(t)} ${t === 1 ? 'hora' : 'horas'} corriendo en una carrera` },
  daypart: { title: (t) => (t === 1 ? 'Madrugador: carrera antes de las 7' : 'Nocturno: carrera después de las 21') },
  avgSpeed: {
    label: 'Ritmo medio (carreras de 5 km o más)',
    unit: 'km/h',
    // 6:00, 5:00 y 4:30 por km.
    thresholds: [10, 12, 13.334],
    title: (t) => `Ritmo de ${paceOf(t)} por km en 5 km o más`,
  },
  monthKm: { thresholds: [50, 100, 200, 300], title: (t) => `${n(t)} km corridos en un mes` },
  cold: { title: (t) => `Carrera con ${10 - t} °C o menos` },
  heat: { title: (t) => `Carrera con ${t} °C o más` },
  wind: { title: (t) => `Carrera con viento de ${t} km/h o más` },
};

/** Familias de premios de un deporte. */
export function familiesFor(sport: TrainSport): BadgeFamily[] {
  if (sport === 'bike') return FAMILIES;
  return FAMILIES.filter((f) => f.id !== 'bikeKm').map((f) => ({ ...f, ...RUN_FAMILIES[f.id] }));
}

export const familyOf = (id: AwardMetric, sport: TrainSport = 'bike'): BadgeFamily => familiesFor(sport).find((f) => f.id === id)!;

/** Prefijo de las claves de un deporte: las de bici quedan como antes del pedido 15. */
export const sportKeyPrefix = (sport: TrainSport) => (sport === 'run' ? 'run:' : '');

export const badgeKey = (family: AwardMetric, threshold: number, sport: TrainSport = 'bike') => `${sportKeyPrefix(sport)}badge:${family}:${threshold}`;

/** Nivel de un umbral según su posición dentro de la familia. */
export function tierOf(family: BadgeFamily, threshold: number): Tier {
  const i = family.thresholds.indexOf(threshold);
  if (i < 0) return 'bronze';
  return TIERS[Math.min(3, Math.floor((i / family.thresholds.length) * 4))];
}
