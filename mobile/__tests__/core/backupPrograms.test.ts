import { buildBackup, parseBackup } from '../../src/core/export/backup';
import type { BackupData } from '../../src/core/export/backup';
import { DEFAULT_SETTINGS, sanitizePlan } from '../../src/data/settings';

const empty = (over: Partial<BackupData> = {}): BackupData => ({
  rides: [],
  profiles: [],
  goals: [],
  settings: DEFAULT_SETTINGS,
  bikes: [],
  bikeParts: [],
  segments: [],
  weather: [],
  awardsSeen: [],
  awardsInit: false,
  programs: { active: null, completed: [] },
  coach: { macro: null, sessions: [], wellness: [] },
  ...over,
});

describe('la fecha del evento del plan', () => {
  it('se conserva al volver a leer los ajustes', () => {
    expect(sanitizePlan({ eventDate: '2027-03-14' }).eventDate).toBe('2027-03-14');
  });
  it('se descarta si no es una fecha AAAA-MM-DD', () => {
    expect(sanitizePlan({ eventDate: '14/03/2027' }).eventDate).toBeNull();
    expect(sanitizePlan({ eventDate: 'dddd-dd-dd' }).eventDate).toBeNull();
  });
});

describe('los programas en el respaldo', () => {
  it('van y vuelven con el programa activo y los terminados', () => {
    const programs = { active: { id: 'first100', startT: 1_700_000_000_000 }, completed: [{ id: 'first50', t: 1_690_000_000_000 }] };
    const parsed = parseBackup(buildBackup(empty({ programs }), '0.6.0', 0));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.programs).toEqual(programs);
  });
  it('un respaldo viejo, sin programas, se lee igual', () => {
    const old = JSON.parse(buildBackup(empty(), '0.5.0', 0)) as Record<string, unknown>;
    delete old.programs;
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.programs).toEqual({ active: null, completed: [] });
  });
  it('descarta lo dañado sin romper la importación', () => {
    const raw = JSON.parse(buildBackup(empty(), '0.6.0', 0)) as Record<string, unknown>;
    raw.programs = { active: { id: 5, startT: 'x' }, completed: [{ id: 'first50' }, { id: 'first50', t: 1 }] };
    const parsed = parseBackup(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.programs).toEqual({ active: null, completed: [{ id: 'first50', t: 1 }] });
  });
});

describe('el entrenador en el respaldo', () => {
  const macro = JSON.stringify({ startT: 1, totalWeeks: 52, mesocycles: [] });
  const coach = {
    macro,
    sessions: [{ date: '2026-11-03', workoutId: 'fondo-z2', status: 'done' as const, rideId: null, rpe: 5, minutes: 60, note: null, doneT: 1 }],
    wellness: [{ date: '2026-11-03', sleep: 4, mood: 4, fatigue: 2 }],
  };
  it('vuelven el plan, las sesiones y el bienestar', () => {
    const parsed = parseBackup(buildBackup(empty({ coach }), '0.6.0', 0));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.coach).toEqual(coach);
  });
  it('un respaldo viejo se lee con el entrenador vacío', () => {
    const old = JSON.parse(buildBackup(empty(), '0.5.0', 0)) as Record<string, unknown>;
    delete old.coach;
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.ok && parsed.data.coach).toEqual({ macro: null, sessions: [], wellness: [] });
  });
  it('descarta lo dañado y lo cuenta', () => {
    const raw = JSON.parse(buildBackup(empty({ coach }), '0.6.0', 0)) as { coach: Record<string, unknown> };
    raw.coach.macro = 'no es json';
    raw.coach.wellness = [{ date: '2026-11-03', sleep: 9, mood: 4, fatigue: 2 }, ...coach.wellness];
    const parsed = parseBackup(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.coach.macro).toBeNull();
      expect(parsed.data.coach.wellness).toEqual(coach.wellness);
      expect(parsed.skipped).toBe(1);
    }
  });
});
