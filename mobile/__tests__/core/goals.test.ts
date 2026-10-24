import { goalProgress, newlyCompleted } from '../../src/core/goals/goals';
import type { Goal } from '../../src/core/goals/goals';
import { formatGoalAmount, planReminders } from '../../src/core/goals/reminders';
import type { ReminderSettings } from '../../src/core/goals/reminders';
import type { RideRecord } from '../../src/core/stats/rides';
import { at, makeRide } from '../helpers/ride';

const ride = (t: number, distance = 20000): RideRecord => makeRide(t, { distance });

const weeklyKm: Goal = { id: 'g1', period: 'week', metric: 'distance', target: 100000 };
const SETTINGS: ReminderSettings = { enabled: true, hour: 19, minute: 0, streaks: true, goals: true };

describe('metas', () => {
  it('calcula el progreso y si va atrasada respecto de un ritmo parejo', () => {
    // Jueves 22/10 a la noche: pasó más de la mitad de la semana con 40 km de 100.
    const rides = [ride(at(2026, 10, 19)), ride(at(2026, 10, 21))];
    const p = goalProgress(weeklyKm, rides, at(2026, 10, 22, 20), true);
    expect(p.value).toBe(40000);
    expect(p.remaining).toBe(60000);
    expect(p.behind).toBe(true);
    expect(p.done).toBe(false);
    expect(p.daysLeft).toBe(4);
  });

  it('el tiempo cuenta en movimiento o transcurrido según la autopausa', () => {
    const g: Goal = { id: 't', period: 'month', metric: 'time', target: 10 * 3600 };
    const rides = [ride(at(2026, 10, 2))];
    expect(goalProgress(g, rides, at(2026, 10, 19), true).value).toBe(3000);
    expect(goalProgress(g, rides, at(2026, 10, 19), false).value).toBe(3600);
  });

  it('detecta las metas que se cumplen con una salida nueva', () => {
    const before = [ride(at(2026, 10, 19), 90000)];
    const after = [...before, ride(at(2026, 10, 20), 15000)];
    expect(newlyCompleted([weeklyKm], before, after, at(2026, 10, 20, 20), true)).toEqual([weeklyKm]);
    expect(newlyCompleted([weeklyKm], after, after, at(2026, 10, 20, 20), true)).toEqual([]);
  });

  it('formatea las cantidades', () => {
    expect(formatGoalAmount('distance', 42500)).toBe('42,5 km');
    expect(formatGoalAmount('distance', 80000)).toBe('80 km');
    expect(formatGoalAmount('distance', 4500)).toBe('4,5 km');
    expect(formatGoalAmount('time', 8100)).toBe('2 h 15 min');
    expect(formatGoalAmount('rides', 1)).toBe('1 salida');
  });
});

describe('recordatorios', () => {
  it('avisa de una meta atrasada a la hora elegida y deja de avisar si está cumplida', () => {
    const now = at(2026, 10, 22, 12); // jueves
    const plan = planReminders([ride(at(2026, 10, 19))], [weeklyKm], SETTINGS, true, now, 3);
    expect(plan.map((r) => new Date(r.at).getHours())).toEqual([19, 19, 19]);
    expect(plan[0].body).toContain('te faltan 80 km');

    const done = planReminders([ride(at(2026, 10, 19), 120000)], [weeklyKm], { ...SETTINGS, streaks: false }, true, now, 3);
    expect(done).toEqual([]);
  });

  it('avisa la racha diaria solo el día que está en riesgo', () => {
    const rides = [at(2026, 10, 17), at(2026, 10, 18)].map((t) => ride(t));
    const plan = planReminders(rides, [], SETTINGS, true, at(2026, 10, 19, 8), 3);
    expect(plan).toHaveLength(1);
    expect(plan[0].body).toContain('2 días seguidos');
  });

  it('no programa nada si están desactivados o si la hora ya pasó', () => {
    expect(planReminders([], [weeklyKm], { ...SETTINGS, enabled: false }, true, at(2026, 10, 22), 7)).toEqual([]);
    const plan = planReminders([], [weeklyKm], SETTINGS, true, at(2026, 10, 25, 20), 1);
    expect(plan).toEqual([]);
  });
});
