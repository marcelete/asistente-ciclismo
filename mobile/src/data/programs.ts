import { programById } from '../core/plan/programs';
import type { ActiveProgram } from '../core/plan/programs';
import { loadSetting, saveSetting } from './db';

/** Programa activo y programas terminados. Viven en la tabla de ajustes, así "Borrar todo" los limpia. */
const ACTIVE = 'activeProgram';
const DONE = 'completedPrograms';

export interface CompletedProgram {
  id: string;
  t: number;
}

export function loadActiveProgram(): ActiveProgram | null {
  const raw = loadSetting<unknown>(ACTIVE, null) as Partial<ActiveProgram> | null;
  return raw && typeof raw.id === 'string' && typeof raw.startT === 'number' && programById(raw.id) ? { id: raw.id, startT: raw.startT } : null;
}

export async function startProgram(id: string, startT: number): Promise<void> {
  await saveSetting(ACTIVE, { id, startT });
}

export async function abandonProgram(): Promise<void> {
  await saveSetting(ACTIVE, null);
}

export function loadCompletedPrograms(): CompletedProgram[] {
  const raw = loadSetting<unknown>(DONE, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is CompletedProgram => !!x && typeof x.id === 'string' && typeof x.t === 'number' && !!programById(x.id));
}

export async function completeProgram(id: string, t: number): Promise<void> {
  const done = loadCompletedPrograms().filter((p) => p.id !== id);
  await saveSetting(DONE, [...done, { id, t }]);
  await saveSetting(ACTIVE, null);
}
