import { DEFAULT_SETTINGS, sanitizeCoach, sanitizeSettings } from '../../src/data/settings';

describe('ajustes del entrenador', () => {
  it('sin ajustes del entrenador se parte del plan semanal viejo', () => {
    const s = sanitizeSettings({ plan: { goal: 'climbing', days: 4, hoursPerWeek: 6, eventDate: '2027-02-01' } });
    expect(s.coach.goal).toBe('climbing');
    expect(s.coach.eventDate).toBe('2027-02-01');
    expect(s.coach.minutesByDay.filter((m) => m > 0)).toHaveLength(4);
    expect(s.coach.minutesByDay.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(6 * 60 - 20);
  });
  it('conserva lo guardado y limita los rangos', () => {
    const c = sanitizeCoach(
      { goal: 'event', eventDate: '2027-05-09', eventKm: 120, minutesByDay: [0, 45, 0, 60, 0, 600, 90], voice: false, cueEverySec: 5, speedTolKmh: 9 },
      DEFAULT_SETTINGS.plan,
    );
    expect(c.goal).toBe('event');
    expect(c.eventDate).toBe('2027-05-09');
    expect(c.eventKm).toBe(120);
    expect(c.minutesByDay).toEqual([0, 45, 0, 60, 0, 480, 90]);
    expect(c.voice).toBe(false);
    expect(c.cueEverySec).toBe(DEFAULT_SETTINGS.coach.cueEverySec);
    expect(c.speedTolKmh).toBe(3);
  });
  it('ignora basura', () => {
    const c = sanitizeCoach({ minutesByDay: 'x', eventKm: -4, eventDate: 'mañana' }, DEFAULT_SETTINGS.plan);
    expect(c.minutesByDay).toHaveLength(7);
    expect(c.eventKm).toBeNull();
    expect(c.eventDate).toBeNull();
  });
});
