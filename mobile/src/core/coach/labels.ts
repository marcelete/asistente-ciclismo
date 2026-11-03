import type { Emphasis, MesoKind, MicroKind, PeriodKind, Preparation } from './types';

export const PREPARATION_LABEL: Record<Preparation, string> = {
  fisica: 'Física',
  tecnica: 'Técnica',
  tactica: 'Táctica',
  psicologica: 'Psicológica',
  teorica: 'Teórica',
};

export const MICRO_LABEL: Record<MicroKind, string> = {
  ajuste: 'Ajuste',
  carga: 'Carga',
  impacto: 'Impacto',
  recuperacion: 'Recuperación',
  activacion: 'Activación',
  competencia: 'Competencia',
};

export const MESO_LABEL: Record<MesoKind, string> = {
  introductorio: 'Introductorio',
  desarrollador: 'Desarrollador',
  estabilizador: 'Estabilizador',
  precompetitivo: 'Precompetitivo',
  competitivo: 'Competitivo',
  recuperacion: 'Recuperación',
};

export const PERIOD_LABEL: Record<PeriodKind, string> = {
  general: 'Preparación general',
  especial: 'Preparación especial',
  competitivo: 'Competitivo',
  transicion: 'Transición',
};

export const EMPHASIS_LABEL: Record<Emphasis, string> = {
  base: 'Base aeróbica',
  fuerza: 'Fuerza en subida',
  umbral: 'Umbral',
  vo2: 'Potencia aeróbica',
  especifico: 'Ritmo de evento',
  afinar: 'Afinar',
  regenerar: 'Regenerar',
};

/** Explicación corta de cada tipo de semana, para la ficha del plan. */
export const MICRO_HELP: Record<MicroKind, string> = {
  ajuste: 'Semana para adaptarte: volumen moderado y sin intensidad.',
  carga: 'Semana de trabajo: sube el estímulo sobre lo que ya tolerás.',
  impacto: 'La semana más exigente del bloque. Después toca descargar.',
  recuperacion: 'Semana de descarga: baja el volumen para absorber el entrenamiento.',
  activacion: 'Semana de afinamiento antes del evento: poco volumen y algunos arranques.',
  competencia: 'Semana del evento: salidas cortas y suaves, y a competir.',
};

export const SHORT_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const LONG_DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** "1 h 30 min", "45 min". */
export function minutesText(min: number): string {
  // Menos de un minuto va en segundos: una pausa de 20 s no es "0 min".
  if (min > 0 && min < 0.95) return `${Math.round(min * 60)} s`;
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}
