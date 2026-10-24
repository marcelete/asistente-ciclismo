import { planWeek } from '../../src/core/plan/rules';
import type { PlanInput } from '../../src/core/plan/rules';

const base: PlanInput = {
  ctl: 40,
  atl: 40,
  goal: 'general',
  availableDays: [0, 2, 3, 5, 6],
  hoursPerWeek: 10,
};

describe('planWeek', () => {
  it('en fase de construcción sube la carga y pone la sesión larga en el último día', () => {
    const p = planWeek(base);
    expect(p.phase).toBe('build');
    expect(p.sessions).toHaveLength(5);
    expect(p.sessions[p.sessions.length - 1]).toMatchObject({ day: 6, kind: 'long' });
    // Más que mantener el CTL actual (40 · 7 = 280).
    expect(p.targetLoad).toBeGreaterThan(260);
  });

  it('no junta dos sesiones duras seguidas', () => {
    const p = planWeek({ ...base, goal: 'climbing' });
    const hard = p.sessions.map((s, i) => (s.kind === 'intervals' || s.kind === 'tempo' ? i : -1)).filter((i) => i >= 0);
    expect(hard.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < hard.length; i++) expect(hard[i] - hard[i - 1]).toBeGreaterThan(1);
    expect(p.sessions.some((s) => s.kind === 'intervals')).toBe(true);
  });

  it('con mucha fatiga pasa a recuperación y baja la carga', () => {
    const fresh = planWeek(base);
    const tired = planWeek({ ...base, ctl: 40, atl: 75 });
    expect(tired.phase).toBe('recover');
    expect(tired.targetLoad).toBeLessThan(fresh.targetLoad * 0.7);
    expect(tired.sessions.every((s) => s.kind !== 'tempo' && s.kind !== 'intervals')).toBe(true);
  });

  it('la semana previa a un evento reduce el volumen', () => {
    const taper = planWeek({ ...base, goal: 'event', weeksToEvent: 1 });
    expect(taper.phase).toBe('taper');
    expect(taper.targetLoad).toBeLessThan(planWeek(base).targetLoad * 0.7);
  });

  it('respeta las horas disponibles', () => {
    const p = planWeek({ ...base, ctl: 90, atl: 90, hoursPerWeek: 4 });
    const minutes = p.sessions.reduce((s, x) => s + x.durationMin, 0);
    expect(minutes).toBeLessThanOrEqual(4 * 60 + 5 * 5);
    expect(p.notes.join(' ')).toMatch(/horas disponibles/);
  });

  it('sin días disponibles no inventa sesiones', () => {
    const p = planWeek({ ...base, availableDays: [] });
    expect(p.sessions).toEqual([]);
  });
});
