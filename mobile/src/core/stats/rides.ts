import type { ElevationStats } from '../elevation/profile';
import type { HrHistogram } from '../load/hrStats';
import type { LiveSnapshot } from '../types';
import { sportOf } from './sport';

/** Lo que se guarda de cada salida en el historial: el resumen, sin las muestras. */
export interface RideRecord {
  id: string;
  fileName: string;
  /** Inicio y fin en milisegundos (epoch). */
  startT: number;
  endT: number;
  /** Metros. */
  distance: number;
  /** Tiempo transcurrido total, en segundos. */
  elapsedSec: number;
  /** Tiempo en movimiento (sin las paradas), en segundos. */
  movingSec: number;
  /** Metros. */
  elevationGain: number;
  elevationLoss: number;
  maxAltitude: number | null;
  minAltitude: number | null;
  /** m/s. */
  maxSpeed: number;
  /**
   * Desnivel y altitudes según el modelo de terreno (Copernicus DEM vía Open-Meteo). Null hasta
   * que se consulta; los campos de arriba son los del GPS.
   */
  dem: ElevationStats | null;
  /** Nombre que le pusiste en el grabador; null si es el automático (la fecha). */
  name: string | null;
  /** Tipo de actividad del grabador ("Ciclismo", "Bicicleta de montaña"…), si lo informa. */
  activityType: string | null;
  /** Frecuencia cardíaca media y máxima, en lpm (null sin sensor). */
  avgHr: number | null;
  maxHr: number | null;
  /** Segundos en cada pulsación: alcanza para zonas y carga con cualquier FC máxima. */
  hrHist: HrHistogram | null;
  /** Mejor tiempo dentro de la salida para cada distancia estándar: metros → segundos. */
  efforts: Record<number, number> | null;
  /** Versión del análisis con que se calculó; las más viejas se recalculan releyendo el GPX. */
  analysis: number;
  /**
   * Cadencia media en movimiento (pedaleos o pasos por minuto), si el GPX la trae. Opcional para
   * que las salidas guardadas antes del pedido 15 sigan valiendo.
   */
  avgCadence?: number | null;
  /** Bici de la salida (null: la que esté por defecto). */
  bikeId?: string | null;
  /** Null: lo decide el tipo de actividad; 1: cuenta como bici; 2: como carrera; 0: no cuenta (ver `sportOf`). */
  countedOverride?: 0 | 1 | 2 | null;
}

/** Datos de la salida que no salen del acumulador en vivo. */
export interface RideExtras {
  name: string | null;
  activityType: string | null;
  hrHist: HrHistogram | null;
  efforts: Record<number, number> | null;
  analysis: number;
  avgCadence: number | null;
}

export function rideFromSummary(
  a: { id: string; fileName: string; startT: number; endT: number },
  s: LiveSnapshot,
  extras: Partial<RideExtras> = {},
): RideRecord {
  return {
    id: a.id,
    fileName: a.fileName,
    startT: a.startT,
    endT: a.endT,
    distance: s.distance,
    elapsedSec: s.elapsedSec,
    movingSec: s.movingSec,
    elevationGain: s.elevationGain,
    elevationLoss: s.elevationLoss,
    maxAltitude: s.maxAltitude,
    minAltitude: s.minAltitude,
    maxSpeed: s.maxSpeed,
    dem: null,
    name: extras.name ?? null,
    activityType: extras.activityType ?? null,
    avgHr: s.avgHr,
    maxHr: s.maxHr,
    hrHist: extras.hrHist ?? null,
    efforts: extras.efforts ?? null,
    analysis: extras.analysis ?? 0,
    avgCadence: extras.avgCadence ?? null,
  };
}

/**
 * El tiempo "de la salida" según la preferencia de pausa automática: con autopausa cuenta solo
 * el tiempo en movimiento; sin ella, el transcurrido.
 */
export function rideTime(r: Pick<RideRecord, 'elapsedSec' | 'movingSec'>, autoPause: boolean): number {
  return autoPause ? r.movingSec : r.elapsedSec;
}

/** Velocidad media de la salida en m/s, con el mismo tiempo que usan los totales. */
export function rideAvgSpeed(r: Pick<RideRecord, 'distance' | 'elapsedSec' | 'movingSec'>, autoPause: boolean): number {
  const t = rideTime(r, autoPause);
  return t > 0 ? r.distance / t : 0;
}

export interface RideElevation {
  gain: number;
  loss: number;
  maxAltitude: number | null;
  minAltitude: number | null;
  source: 'dem' | 'gps';
}

/** Desnivel y altitudes de la salida: los del mapa de terreno si ya están, si no los del GPS. */
export function rideElevation(r: Pick<RideRecord, 'dem' | 'elevationGain' | 'elevationLoss' | 'maxAltitude' | 'minAltitude'>): RideElevation {
  if (r.dem) return { ...r.dem, source: 'dem' };
  return {
    gain: r.elevationGain,
    loss: r.elevationLoss,
    maxAltitude: r.maxAltitude,
    minAltitude: r.minAltitude,
    source: 'gps',
  };
}

/** OpenTracks nombra cada traza con la fecha ("2026-10-19T13:54Z") si no le ponés uno. */
const AUTOMATIC_NAME = /^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}/;

/** El nombre del grabador, o null si es el automático. */
export function customName(name: string | null): string | null {
  if (!name) return null;
  return AUTOMATIC_NAME.test(name.trim()) ? null : name.trim();
}

/** Nombre para mostrar: el tuyo, o uno según la hora de inicio ("Salida de la tarde", "Carrera matutina"). */
export function rideTitle(r: Pick<RideRecord, 'name' | 'startT'> & Partial<Pick<RideRecord, 'activityType' | 'countedOverride'>>): string {
  const own = customName(r.name);
  if (own) return own;
  const what = sportOf({ activityType: r.activityType ?? null, countedOverride: r.countedOverride ?? null }) === 'run' ? 'Carrera' : 'Salida';
  const h = new Date(r.startT).getHours();
  if (h >= 5 && h < 12) return `${what} matutina`;
  if (h >= 12 && h < 14) return `${what} del mediodía`;
  if (h >= 14 && h < 20) return `${what} de la tarde`;
  return `${what} nocturna`;
}

/** Tipo de actividad para mostrar, o null si el grabador no lo sabe. */
export function rideTypeLabel(r: Pick<RideRecord, 'activityType'>): string | null {
  const t = r.activityType?.trim();
  if (!t || /^(unknown|desconocid[oa])$/i.test(t)) return null;
  return t[0].toUpperCase() + t.slice(1);
}
