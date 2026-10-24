import type { RideRecord } from '../stats/rides';
import { rideElevation } from '../stats/rides';

/**
 * Programas para seguir, de ciclismo: de 4 a 8 semanas, paso a paso. Cada semana tiene sus
 * sesiones; se tildan solas con las salidas que las cumplen (largo, tiempo y desnivel, con
 * tolerancia). Hay uno activo a la vez y reemplaza al plan semanal mientras dura.
 */
export interface ProgramSession {
  title: string;
  /** Minutos en movimiento mínimos (se acepta un 20 % menos). */
  minMin?: number;
  /** Km mínimos (se acepta un 10 % menos). */
  minKm?: number;
  /** Desnivel mínimo en metros (se acepta un 15 % menos). */
  minGain?: number;
}

export interface ProgramDef {
  id: string;
  name: string;
  description: string;
  weeks: ProgramSession[][];
}

const km = (n: number): ProgramSession => ({ title: `Salida de ${n} km`, minKm: n });
const easy = (min: number): ProgramSession => ({ title: `Rodaje suave de ${min} min`, minMin: min });
const climb = (m: number): ProgramSession => ({ title: `Salida con ${m} m de subida`, minGain: m, minKm: 15 });

export const PROGRAMS: ProgramDef[] = [
  {
    id: 'first50',
    name: 'Tus primeros 50 km',
    description: '6 semanas para llegar a una salida de 50 km.',
    weeks: [
      [easy(40), km(15)],
      [easy(45), km(20)],
      [easy(45), km(25)],
      [easy(50), km(30)],
      [easy(50), km(40)],
      [easy(45), km(50)],
    ],
  },
  {
    id: 'first100',
    name: 'Tus primeros 100 km',
    description: '8 semanas para completar 100 km en una salida.',
    weeks: [
      [easy(60), km(30)],
      [easy(60), km(40)],
      [easy(70), km(50)],
      [easy(70), km(60)],
      [easy(75), km(70)],
      [easy(60), km(80)],
      [easy(60), km(90)],
      [easy(45), km(100)],
    ],
  },
  {
    id: 'climbing',
    name: 'Mejorar en las subidas',
    description: '6 semanas sumando desnivel de a poco.',
    weeks: [
      [easy(45), climb(200)],
      [easy(45), climb(300)],
      [easy(50), climb(400)],
      [easy(50), climb(500)],
      [easy(50), climb(650)],
      [easy(45), climb(800)],
    ],
  },
  {
    id: 'comeback',
    name: 'Volver después de un parate',
    description: '4 semanas para retomar sin lastimarte.',
    weeks: [[easy(30), easy(30)], [easy(40), easy(30)], [easy(45), easy(40)], [easy(60), easy(40)]],
  },
];

export const programById = (id: string): ProgramDef | undefined => PROGRAMS.find((p) => p.id === id);

export interface ActiveProgram {
  id: string;
  startT: number;
}

export interface SessionStatus {
  session: ProgramSession;
  done: boolean;
}

const WEEK_MS = 7 * 86_400_000;

function meets(s: ProgramSession, r: RideRecord): boolean {
  if (s.minKm !== undefined && r.distance / 1000 < s.minKm * 0.9) return false;
  if (s.minMin !== undefined && r.movingSec / 60 < s.minMin * 0.8) return false;
  if (s.minGain !== undefined && rideElevation(r).gain < s.minGain * 0.85) return false;
  return true;
}

/** Estado de cada semana: una salida cumple como mucho una sesión (asignación voraz, la más exigente primero). */
export function programProgress(def: ProgramDef, startT: number, rides: RideRecord[]): { weeks: SessionStatus[][]; done: number; total: number } {
  const weeks = def.weeks.map((sessions, w) => {
    const from = startT + w * WEEK_MS;
    const inWeek = rides.filter((r) => r.startT >= from && r.startT < from + WEEK_MS);
    const used = new Set<string>();
    const order = sessions.map((s, i) => ({ s, i })).sort((a, b) => (b.s.minKm ?? 0) - (a.s.minKm ?? 0) || (b.s.minGain ?? 0) - (a.s.minGain ?? 0));
    const result: SessionStatus[] = sessions.map((s) => ({ session: s, done: false }));
    for (const { s, i } of order) {
      const r = inWeek.find((x) => !used.has(x.id) && meets(s, x));
      if (r) {
        used.add(r.id);
        result[i].done = true;
      }
    }
    return result;
  });
  const total = weeks.reduce((n, w) => n + w.length, 0);
  const done = weeks.reduce((n, w) => n + w.filter((x) => x.done).length, 0);
  return { weeks, done, total };
}

/** Semana del programa en que estamos (0 = primera); puede pasarse del final si no se terminó. */
export function currentWeek(startT: number, now: number): number {
  return Math.max(0, Math.floor((now - startT) / WEEK_MS));
}

/** Terminar el programa: todas las sesiones hechas. */
export const isComplete = (p: { done: number; total: number }) => p.total > 0 && p.done === p.total;
