import { addDays, mondayOf } from '../../../src/core/coach/dates';
import { avgHoursPerWeek, createMacro, currentWeekOf, fitnessBefore, levelFromRides, projectPlan, recentPeakMinutes, thisWeek } from '../../../src/core/coach/state';
import type { CoachConfig, CoachRide } from '../../../src/core/coach/state';
import { at } from '../../helpers/ride';

const now = at(2026, 11, 4); // miércoles
const cfg: CoachConfig = { goal: 'general', eventDate: null, eventKm: null, minutesByDay: [0, 60, 0, 60, 0, 90, 120], offBike: false };

/** Una hora diaria durante `days` días antes de `now`. */
const rides = (days: number, min = 60): CoachRide[] =>
  Array.from({ length: days }, (_, i) => ({ startT: addDays(now, -(i + 1)), movingSec: min * 60, hrHist: null }));

describe('forma y nivel', () => {
  it('sin salidas todo es cero y el nivel es principiante', () => {
    expect(fitnessBefore([], null, [], now)).toMatchObject({ ctl: 0, atl: 0 });
    expect(levelFromRides([], null, [], now)).toBe(0);
  });
  it('con salidas sin FC estima la carga y la fatiga sube más rápido que la forma', () => {
    const f = fitnessBefore(rides(30), null, [], now);
    expect(f.estimated).toBe(true);
    expect(f.ctl).toBeGreaterThan(10);
    expect(f.atl).toBeGreaterThan(f.ctl);
  });
  it('suma la carga de las sesiones de afuera de la bici', () => {
    const base = fitnessBefore(rides(10), null, [], now);
    const withExtra = fitnessBefore(rides(10), null, [{ date: '2026-11-02', load: 80 }], now);
    expect(withExtra.atl).toBeGreaterThan(base.atl);
  });
  it('calcula horas por semana y el pico reciente de minutos', () => {
    expect(avgHoursPerWeek(rides(56, 60), now, 8)).toBeCloseTo(7, 0);
    const monday = mondayOf(now);
    expect(recentPeakMinutes([], monday)).toBeNull();
    expect(recentPeakMinutes(rides(21, 60), monday)).toBeGreaterThan(0);
  });
});

describe('plan en curso', () => {
  const macro = createMacro(cfg, 1, now);

  it('el macrociclo empieza el lunes de esta semana', () => {
    expect(macro.startT).toBe(mondayOf(now));
    expect(currentWeekOf(macro, now)).toBe(0);
    expect(currentWeekOf(macro, addDays(now, 7 * 60))).toBeNull();
    expect(currentWeekOf(macro, addDays(now, -10))).toBeNull();
  });
  it('un evento pasado se ignora y uno futuro se respeta', () => {
    expect(createMacro({ ...cfg, eventDate: '2026-01-01' }, 1, now).eventWeek).toBeNull();
    expect(createMacro({ ...cfg, goal: 'event', eventDate: '2027-02-06', eventKm: 100 }, 1, now).eventWeek).toBe(13);
  });
  it('la semana actual trae sesiones y el porqué', () => {
    const w = thisWeek(macro, cfg, rides(20), null, [], now);
    expect(w).not.toBeNull();
    expect(w!.micro.sessions.length).toBeGreaterThan(0);
    expect(w!.micro.why.length).toBeGreaterThan(0);
  });
  it('proyecta el año sin huecos y con la carga acotada', () => {
    const f = fitnessBefore(rides(20), null, [], mondayOf(now));
    const weeks = projectPlan(macro, cfg, 0, 51, f);
    expect(weeks).toHaveLength(52);
    expect(weeks.map((w) => w.week)).toEqual(Array.from({ length: 52 }, (_, i) => i));
    for (const w of weeks) {
      expect(Number.isFinite(w.targetLoad)).toBe(true);
      expect(w.targetLoad).toBeLessThan(2000);
    }
    expect(JSON.stringify(weeks)).not.toMatch(/NaN|undefined/);
  });
});
