import type { HrProfile } from '../load/hr';
import type { HrHistogram } from '../load/hrStats';
import { zoneSeconds } from '../load/training';
import { dateKey } from './dates';
import type { CoachSession } from './types';

export type SessionStatus = 'done' | 'partial' | 'missed' | 'pending';

/** Tolerancias del cumplimiento: el mismo criterio que los programas cortos (tiempo −20 %). */
export const TIME_TOLERANCE = 0.8;
/** Con frecuencia cardíaca, el tiempo en la zona principal tiene que llegar a esta fracción de lo previsto. */
export const ZONE_SHARE = 0.4;

export interface DoneRide {
  startT: number;
  movingSec: number;
  hrHist: HrHistogram | null;
  /** Deporte de la salida; bici si falta. Una sesión de correr solo se cumple corriendo. */
  sport?: 'bike' | 'run';
}

/** Una sesión guiada que terminaste con la app (no necesita FC). */
export interface GuidedLog {
  date: string;
  workoutId: string;
  seconds: number;
}

export interface SessionResult {
  session: CoachSession;
  status: SessionStatus;
}

function zoneMinutes(h: HrHistogram | null, hr: HrProfile | null, zone: number): number | null {
  if (!h || !hr || zone < 1 || zone > 5) return null;
  return zoneSeconds(h, hr)[zone] / 60;
}

/**
 * Empareja las sesiones previstas con lo que hiciste. Una sesión se cumple si ese día hubo una salida
 * (o una sesión guiada) con el 80 % del tiempo previsto y, cuando hay FC, el 40 % del tiempo en la zona
 * principal. Con menos del 40 % del tiempo queda como no hecha, entre medio como parcial.
 */
export function matchSessions(sessions: CoachSession[], rides: DoneRide[], logs: GuidedLog[], hr: HrProfile | null, now: number): SessionResult[] {
  const today = dateKey(now);
  return sessions.map((session) => {
    const guided = logs.filter((l) => l.date === session.date && (l.workoutId === session.workoutId || session.where === 'off'));
    const rides1 = session.where !== 'off' ? rides.filter((r) => dateKey(r.startT) === session.date && (r.sport ?? 'bike') === session.where) : [];
    const minutes = Math.max(0, ...rides1.map((r) => r.movingSec / 60), ...guided.map((l) => l.seconds / 60));
    if (minutes <= 0) return { session, status: session.date >= today ? 'pending' : 'missed' };

    const ratio = minutes / session.durationMin;
    let status: SessionStatus = ratio >= TIME_TOLERANCE ? 'done' : ratio >= 0.4 ? 'partial' : 'missed';
    if (status === 'done' && session.where !== 'off' && guided.length === 0) {
      // Sin FC no se puede comprobar la zona; con FC, si pasaste muy poco tiempo en la zona queda parcial.
      const mins = rides1.map((r) => zoneMinutes(r.hrHist, hr, session.zone)).filter((m): m is number => m !== null);
      const expected = session.durationMin * (session.zone >= 3 ? 0.4 : 0.6);
      if (mins.length > 0 && session.zone > 0 && Math.max(...mins) < expected * ZONE_SHARE) status = 'partial';
    }
    return { session, status };
  });
}

/** Cumplimiento de la semana de 0 a 1, ponderado por la carga de cada sesión. Las pendientes no cuentan. */
export function weekCompliance(results: SessionResult[]): number {
  let planned = 0;
  let got = 0;
  for (const r of results) {
    if (r.status === 'pending') continue;
    const w = Math.max(1, r.session.targetLoad);
    planned += w;
    got += r.status === 'done' ? w : r.status === 'partial' ? w * 0.5 : 0;
  }
  return planned === 0 ? 1 : got / planned;
}
