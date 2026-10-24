import type { EnergyEstimate } from '../analysis/profileMetrics';
import { EFFORT_DISTANCES_M } from '../efforts/distanceEfforts';
import { hrLoad, zoneSeconds } from '../load/training';
import type { HrProfile } from '../load/hr';
import { rideAvgSpeed, rideElevation } from '../stats/rides';
import type { RideRecord } from '../stats/rides';
import { isoLocal, num } from './csv';
import type { CsvValue } from './csv';

/**
 * Un único lugar define cada columna de cada CSV: nombre, unidad, descripción y cómo se calcula.
 * De acá salen tanto los CSV como el diccionario de columnas del LEEME.txt, así no se desfasan.
 */
export interface Column<Row, Ctx> {
  name: string;
  unit: string;
  description: string;
  value: (row: Row, ctx: Ctx) => CsvValue;
}

/** Lo que hace falta además de la salida para armar su fila. */
export interface RideExportContext {
  autoPause: boolean;
  /** Perfil de FC para la carga y las zonas; null si no hay datos suficientes. */
  hr: HrProfile | null;
  /** Si la salida cuenta como salida en bici (fase 3); por defecto todas. */
  counted?: (r: RideRecord) => boolean;
  /** Nombre de la bici de la salida (fase 3). */
  bikeName?: (r: RideRecord) => string | null;
  /** Potencia y energía estimadas con el perfil de la salida. */
  energy?: (r: RideRecord) => EnergyEstimate | null;
  /** Cantidad de subidas detectadas. */
  climbCount?: (r: RideRecord) => number | null;
  /** Clima y viento de la salida (fase 8). */
  weather?: (r: RideRecord) => { tempC: number | null; windMs: number | null; windDirDeg: number | null } | null;
  /** Recorrido equivalente (fase 7) y logros (fase 5). */
  routeId?: (r: RideRecord) => string | null;
  awards?: (r: RideRecord) => string | null;
}

const m2km = (m: number | null) => (m === null ? null : num(m / 1000, 3));
const ms2kmh = (v: number) => num(v * 3.6, 2);

function effortColumns(): Column<RideRecord, RideExportContext>[] {
  return EFFORT_DISTANCES_M.map((d) => ({
    name: `mejor_${d / 1000}km_seg`,
    unit: 's',
    description: `Mejor tiempo dentro de la salida para ${d / 1000} km seguidos. Vacío si la salida es más corta.`,
    value: (r) => num(r.efforts?.[d] ?? null, 1),
  }));
}

export const RIDE_COLUMNS: Column<RideRecord, RideExportContext>[] = [
  { name: 'id', unit: '', description: 'Identificador de la salida (sirve para cruzar con logros.csv y segmentos.csv).', value: (r) => r.id },
  { name: 'inicio', unit: 'fecha ISO', description: 'Fecha y hora de inicio, con huso horario.', value: (r) => isoLocal(r.startT) },
  { name: 'fin', unit: 'fecha ISO', description: 'Fecha y hora de fin, con huso horario.', value: (r) => isoLocal(r.endT) },
  { name: 'nombre', unit: '', description: 'Nombre que le pusiste en el grabador; vacío si es el automático.', value: (r) => r.name },
  { name: 'tipo', unit: '', description: 'Tipo de actividad del grabador (Ciclismo, Caminata…).', value: (r) => r.activityType },
  {
    name: 'cuenta',
    unit: 'sí/no',
    description: 'Si cuenta como salida en bici. Las que no cuentan no suman a totales, rachas, metas ni récords.',
    value: (r, c) => (c.counted ? c.counted(r) : true),
  },
  { name: 'bici', unit: '', description: 'Nombre de la bici de la salida.', value: (r, c) => c.bikeName?.(r) ?? null },
  { name: 'distancia_km', unit: 'km', description: 'Distancia recorrida.', value: (r) => m2km(r.distance) },
  { name: 'tiempo_total_seg', unit: 's', description: 'Tiempo transcurrido total, con las paradas.', value: (r) => num(r.elapsedSec, 0) },
  { name: 'tiempo_mov_seg', unit: 's', description: 'Tiempo en movimiento, sin las paradas.', value: (r) => num(r.movingSec, 0) },
  {
    name: 'vel_media_kmh',
    unit: 'km/h',
    description: 'Distancia sobre el tiempo de la salida (en movimiento si la pausa automática está prendida, total si no).',
    value: (r, c) => ms2kmh(rideAvgSpeed(r, c.autoPause)),
  },
  { name: 'vel_max_kmh', unit: 'km/h', description: 'Velocidad máxima (los picos del GPS pueden exagerarla).', value: (r) => ms2kmh(r.maxSpeed) },
  {
    name: 'desnivel_pos_m',
    unit: 'm',
    description: 'Desnivel positivo acumulado: el del mapa de terreno si ya se consultó, si no el del GPS.',
    value: (r) => num(rideElevation(r).gain, 0),
  },
  { name: 'desnivel_neg_m', unit: 'm', description: 'Desnivel negativo acumulado (misma fuente).', value: (r) => num(rideElevation(r).loss, 0) },
  {
    name: 'fuente_desnivel',
    unit: '',
    description: '"dem" si el desnivel viene del mapa de terreno, "gps" si viene del GPS.',
    value: (r) => rideElevation(r).source,
  },
  { name: 'desnivel_pos_gps_m', unit: 'm', description: 'Desnivel positivo según el GPS.', value: (r) => num(r.elevationGain, 0) },
  { name: 'desnivel_pos_mapa_m', unit: 'm', description: 'Desnivel positivo según el mapa de terreno; vacío si todavía no se consultó.', value: (r) => num(r.dem?.gain ?? null, 0) },
  { name: 'altitud_max_m', unit: 'm', description: 'Altitud máxima.', value: (r) => num(rideElevation(r).maxAltitude, 0) },
  { name: 'altitud_min_m', unit: 'm', description: 'Altitud mínima.', value: (r) => num(rideElevation(r).minAltitude, 0) },
  { name: 'fc_media', unit: 'lpm', description: 'Frecuencia cardíaca media. Vacío sin sensor.', value: (r) => num(r.avgHr, 0) },
  { name: 'fc_max', unit: 'lpm', description: 'Frecuencia cardíaca máxima registrada.', value: (r) => num(r.maxHr, 0) },
  {
    name: 'carga',
    unit: 'hrTSS',
    description: 'Carga de entrenamiento por FC: una hora a la FC de umbral vale 100. Vacío sin FC o sin perfil.',
    value: (r, c) => num(hrLoad(r.hrHist, c.hr), 1),
  },
  ...[1, 2, 3, 4, 5].map(
    (z): Column<RideRecord, RideExportContext> => ({
      name: `seg_zona${z}`,
      unit: 's',
      description: `Segundos en la zona ${z} de FC (reserva de FC; límites en perfil.csv).`,
      value: (r, c) => (r.hrHist && c.hr ? num(zoneSeconds(r.hrHist, c.hr)[z], 0) : null),
    }),
  ),
  { name: 'potencia_media_w', unit: 'W', description: 'Potencia media estimada con un modelo físico (no hay medidor de potencia).', value: (r, c) => num(c.energy?.(r)?.avgPower ?? null, 0) },
  { name: 'trabajo_kj', unit: 'kJ', description: 'Trabajo mecánico estimado.', value: (r, c) => num(c.energy?.(r)?.workKj ?? null, 0) },
  { name: 'kcal', unit: 'kcal', description: 'Energía gastada aproximada (24 % de eficiencia muscular).', value: (r, c) => num(c.energy?.(r)?.kcal ?? null, 0) },
  { name: 'subidas', unit: '', description: 'Cantidad de subidas detectadas.', value: (r, c) => c.climbCount?.(r) ?? null },
  ...effortColumns(),
  { name: 'temperatura_c', unit: '°C', description: 'Temperatura media durante la salida (clima de la ciudad elegida).', value: (r, c) => num(c.weather?.(r)?.tempC ?? null, 1) },
  { name: 'viento_ms', unit: 'm/s', description: 'Velocidad media del viento durante la salida.', value: (r, c) => num(c.weather?.(r)?.windMs ?? null, 1) },
  { name: 'viento_dir_grados', unit: '°', description: 'Dirección de la que sopla el viento (0 = norte).', value: (r, c) => num(c.weather?.(r)?.windDirDeg ?? null, 0) },
  { name: 'recorrido', unit: '', description: 'Identificador del recorrido equivalente (salidas por el mismo camino comparten valor).', value: (r, c) => c.routeId?.(r) ?? null },
  { name: 'logros', unit: '', description: 'Premios y victorias de la salida, separados por " | ".', value: (r, c) => c.awards?.(r) ?? null },
];

/** Descripción de una tabla para el LEEME. */
export function describeColumns<Row, Ctx>(cols: Column<Row, Ctx>[]): string {
  return cols.map((c) => `  ${c.name}${c.unit ? ` [${c.unit}]` : ''}: ${c.description}`).join('\n');
}

export function rowOf<Row, Ctx>(cols: Column<Row, Ctx>[], row: Row, ctx: Ctx): CsvValue[] {
  return cols.map((c) => c.value(row, ctx));
}
