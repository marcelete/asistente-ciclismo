import { LiveStats } from './live/LiveStats';
import type { LiveStatsOptions } from './live/LiveStats';
import type { LiveSnapshot, Sample } from './types';

/**
 * Resumen de una salida completa: pasa todas las muestras por el mismo acumulador que usa la
 * pantalla en vivo, así los números en vivo y los del historial siempre coinciden.
 */
export function summarizeTrack(samples: Sample[], opts: Partial<LiveStatsOptions> = {}): LiveSnapshot {
  const live = new LiveStats(opts);
  for (const s of samples) live.push(s);
  return live.snapshot();
}
