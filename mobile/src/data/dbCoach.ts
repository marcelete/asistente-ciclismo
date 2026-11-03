import type { CheckIn } from '../core/coach/readiness';
import type { Macrocycle } from '../core/coach/types';
import { conn } from './db';

/** Plan del entrenador, sesiones hechas, registros de los bloques y bienestar. Todo se borra con "Borrar todo". */

export interface CoachSessionRow {
  date: string;
  workoutId: string;
  status: 'done' | 'skipped';
  rideId: string | null;
  rpe: number | null;
  minutes: number | null;
  note: string | null;
  doneT: number | null;
}

export interface CoachBlockLog {
  date: string;
  workoutId: string;
  block: number;
  seconds: number;
  /** Promedio del valor objetivo (velocidad, FC…) durante el bloque. */
  avgValue: number | null;
  /** Fracción del tiempo dentro de la banda, de 0 a 1. */
  inRange: number | null;
  /** Coeficiente de variación del valor (estabilidad del ritmo). */
  cv: number | null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** El macrociclo guardado, o `null` si no hay o está dañado. */
export function loadMacro(): Macrocycle | null {
  const row = conn().getFirstSync<{ macro: string }>('SELECT macro FROM coach_plan WHERE id = 1');
  if (!row) return null;
  try {
    const m = JSON.parse(row.macro) as Partial<Macrocycle>;
    const ok = isNum(m.startT) && isNum(m.totalWeeks) && Array.isArray(m.mesocycles) && m.mesocycles.every((x) => x && isNum(x.startWeek) && isNum(x.weeks) && Array.isArray(x.micros));
    // Los planes de antes del pedido 15 no tienen deporte: eran de bici.
    return ok ? ({ ...m, sport: m.sport === 'run' ? 'run' : 'bike' } as Macrocycle) : null;
  } catch {
    return null;
  }
}

export function saveMacro(macro: Macrocycle, now: number): void {
  conn().runSync('INSERT OR REPLACE INTO coach_plan (id, macro, created_t) VALUES (1, ?, ?)', [JSON.stringify(macro), now]);
}

export function clearMacro(): void {
  conn().runSync('DELETE FROM coach_plan');
}

interface SessionDbRow {
  date: string;
  workout_id: string;
  status: string;
  ride_id: string | null;
  rpe: number | null;
  minutes: number | null;
  note: string | null;
  done_t: number | null;
}

export function loadCoachSessions(fromDate?: string, toDate?: string): CoachSessionRow[] {
  const rows = conn().getAllSync<SessionDbRow>(
    'SELECT * FROM coach_sessions WHERE date >= ? AND date <= ? ORDER BY date',
    [fromDate ?? '0000-00-00', toDate ?? '9999-99-99'],
  );
  return rows.map((r) => ({
    date: r.date,
    workoutId: r.workout_id,
    status: r.status === 'skipped' ? 'skipped' : 'done',
    rideId: r.ride_id,
    rpe: r.rpe,
    minutes: r.minutes,
    note: r.note,
    doneT: r.done_t,
  }));
}

export function saveCoachSession(s: CoachSessionRow): void {
  conn().runSync(
    'INSERT OR REPLACE INTO coach_sessions (date, workout_id, status, ride_id, rpe, minutes, note, done_t) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [s.date, s.workoutId, s.status, s.rideId, s.rpe, s.minutes, s.note ? s.note.slice(0, 500) : null, s.doneT],
  );
}

export function saveBlockLogs(logs: CoachBlockLog[]): void {
  const d = conn();
  d.withTransactionSync(() => {
    for (const l of logs) {
      d.runSync('INSERT OR REPLACE INTO coach_logs (date, workout_id, block, seconds, avg_value, in_range, cv) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        l.date,
        l.workoutId,
        l.block,
        l.seconds,
        l.avgValue,
        l.inRange,
        l.cv,
      ]);
    }
  });
}

export function loadBlockLogs(date: string, workoutId: string): CoachBlockLog[] {
  return conn()
    .getAllSync<{ date: string; workout_id: string; block: number; seconds: number; avg_value: number | null; in_range: number | null; cv: number | null }>(
      'SELECT * FROM coach_logs WHERE date = ? AND workout_id = ? ORDER BY block',
      [date, workoutId],
    )
    .map((l) => ({ date: l.date, workoutId: l.workout_id, block: l.block, seconds: l.seconds, avgValue: l.avg_value, inRange: l.in_range, cv: l.cv }));
}

/**
 * Bloques de test ya hechos (por ejemplo, el de 30 minutos de correr): fecha y valor medio. Solo
 * los que duraron al menos `minSeconds`, para no tomar un test cortado como nivel.
 */
export function loadTestLogs(workoutId: string, block: number, minSeconds: number): { date: string; avgValue: number }[] {
  return conn().getAllSync<{ date: string; avg_value: number }>(
    'SELECT date, avg_value FROM coach_logs WHERE workout_id = ? AND block = ? AND avg_value IS NOT NULL AND seconds >= ? ORDER BY date',
    [workoutId, block, minSeconds],
  ).map((r) => ({ date: r.date, avgValue: r.avg_value }));
}

export function loadCheckIn(date: string): CheckIn | null {
  const r = conn().getFirstSync<{ sleep: number; mood: number; fatigue: number }>('SELECT sleep, mood, fatigue FROM wellness WHERE date = ?', [date]);
  return r ?? null;
}

export function saveCheckIn(date: string, c: CheckIn): void {
  const v = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
  conn().runSync('INSERT OR REPLACE INTO wellness (date, sleep, mood, fatigue) VALUES (?, ?, ?, ?)', [date, v(c.sleep), v(c.mood), v(c.fatigue)]);
}
