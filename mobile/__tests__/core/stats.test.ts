import { daysLeft, periodLabel, periodRange, rideCounts, totalsIn } from '../../src/core/stats/periods';
import { rideTime } from '../../src/core/stats/rides';
import { streak } from '../../src/core/stats/streaks';
import { at, makeRide as ride } from '../helpers/ride';

// Lunes 19/10/2026
const NOW = at(2026, 10, 19, 18);

describe('períodos', () => {
  it('la semana va de lunes a domingo', () => {
    const w = periodRange('week', at(2026, 10, 25)); // domingo
    expect(w.start).toBe(new Date(2026, 9, 19).getTime());
    expect(w.end).toBe(new Date(2026, 9, 26).getTime());
    expect(periodLabel(w)).toBe('19/10 al 25/10/2026');
  });

  it('navega a períodos anteriores', () => {
    expect(periodLabel(periodRange('month', NOW, -1))).toBe('septiembre de 2026');
    expect(periodLabel(periodRange('month', at(2026, 1, 15), -1))).toBe('diciembre de 2025');
    expect(periodLabel(periodRange('year', NOW, -2))).toBe('2024');
    expect(periodLabel(periodRange('day', NOW, -1))).toBe('domingo 18/10/2026');
  });

  it('cuenta los días que quedan incluyendo hoy', () => {
    expect(daysLeft(periodRange('week', NOW), NOW)).toBe(7);
    expect(daysLeft(periodRange('month', NOW), NOW)).toBe(13);
  });

  it('cuenta salidas por día, semana, mes y año', () => {
    const rides = [
      ride(at(2026, 10, 19, 7)),
      ride(at(2026, 10, 19, 17)),
      ride(at(2026, 10, 18)), // domingo: semana anterior
      ride(at(2026, 10, 2)),
      ride(at(2026, 3, 1)),
      ride(at(2025, 12, 31)),
    ];
    expect(rideCounts(rides, NOW)).toEqual({ day: 2, week: 2, month: 4, year: 5 });
  });

  it('suma totales y guarda los máximos del período', () => {
    const rides = [
      ride(at(2026, 10, 5), { elevationGain: 900, maxAltitude: 1200, distance: 60000 }),
      ride(at(2026, 10, 6)),
      ride(at(2026, 9, 6), { elevationGain: 5000 }), // otro mes
    ];
    const t = totalsIn(rides, periodRange('month', NOW));
    expect(t.rides).toBe(2);
    expect(t.distance).toBe(80000);
    expect(t.elevationGain).toBe(1100);
    expect(t.maxRideGain).toBe(900);
    expect(t.maxAltitude).toBe(1200);
    expect(t.elapsedSec).toBe(7200);
    expect(t.movingSec).toBe(6000);
  });

  it('el tiempo de una salida depende de la autopausa', () => {
    const r = ride(NOW);
    expect(rideTime(r, true)).toBe(3000);
    expect(rideTime(r, false)).toBe(3600);
  });
});

describe('rachas', () => {
  it('la racha diaria sigue viva si hoy todavía no saliste', () => {
    const rides = [at(2026, 10, 16), at(2026, 10, 17), at(2026, 10, 18)].map((t) => ride(t));
    const s = streak(rides, 'day', NOW);
    expect(s).toEqual({ current: 3, best: 3, doneThisPeriod: false });
  });

  it('se corta si falta un día y recuerda la mejor', () => {
    const rides = [1, 2, 3, 4, 10, 11, 17].map((d) => ride(at(2026, 10, d)));
    const s = streak(rides, 'day', NOW);
    expect(s.current).toBe(0);
    expect(s.best).toBe(4);
  });

  it('la racha semanal cuenta semanas seguidas con al menos una salida', () => {
    const rides = [at(2026, 9, 30), at(2026, 10, 7), at(2026, 10, 14), at(2026, 10, 19, 8)].map((t) => ride(t));
    const s = streak(rides, 'week', NOW);
    expect(s).toEqual({ current: 4, best: 4, doneThisPeriod: true });
  });
});
