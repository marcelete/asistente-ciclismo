import { goalProgress } from '../../src/core/goals/goals';
import { periodBuckets, periodRange, totals } from '../../src/core/stats/periods';
import { records } from '../../src/core/stats/records';
import { DEFAULT_SETTINGS, sanitizeAthlete, sanitizeSettings, totalMass } from '../../src/data/settings';
import { at, makeRide } from '../helpers/ride';

// Miércoles 21/10/2026
const NOW = at(2026, 10, 21, 18);

describe('totales con FC y días activos', () => {
  it('cuenta días distintos y pondera la FC por el tiempo con sensor', () => {
    const t = totals([
      makeRide(at(2026, 10, 19, 7), { avgHr: 130, maxHr: 160, hrHist: { from: 130, s: [3000] } }),
      makeRide(at(2026, 10, 19, 18), { avgHr: 150, maxHr: 175, hrHist: { from: 150, s: [1000] } }),
      makeRide(at(2026, 10, 20)),
    ]);
    expect(t.activeDays).toBe(2);
    expect(t.avgHr).toBeCloseTo((130 * 3000 + 150 * 1000) / 4000, 5);
    expect(t.maxHr).toBe(175);
    expect(t.elevationLoss).toBe(570);
  });

  it('sin sensor no hay FC media', () => {
    expect(totals([makeRide(NOW)]).avgHr).toBeNull();
  });
});

describe('reparto del período para el gráfico', () => {
  it('la semana tiene 7 barras de lunes a domingo', () => {
    const rides = [makeRide(at(2026, 10, 19, 8)), makeRide(at(2026, 10, 19, 18)), makeRide(at(2026, 10, 25, 9))];
    const b = periodBuckets(rides, periodRange('week', NOW));
    expect(b.map((x) => x.label)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    expect(b[0].rides).toBe(2);
    expect(b[0].distance).toBe(40000);
    expect(b[6].rides).toBe(1);
  });

  it('el mes tiene una barra por día y el año una por mes', () => {
    expect(periodBuckets([], periodRange('month', NOW))).toHaveLength(31);
    expect(periodBuckets([], periodRange('month', at(2026, 2, 10)))).toHaveLength(28);
    const year = periodBuckets([makeRide(at(2026, 3, 2))], periodRange('year', NOW));
    expect(year).toHaveLength(12);
    expect(year[2]).toMatchObject({ label: 'M', rides: 1 });
    expect(periodBuckets([], periodRange('day', NOW))).toEqual([]);
  });
});

describe('récords', () => {
  const rides = [
    makeRide(at(2026, 10, 1), { id: 'a', distance: 80000, movingSec: 10000, efforts: { 1000: 100, 20000: 2400 } }),
    makeRide(at(2026, 10, 2), { id: 'b', distance: 30000, movingSec: 3000, maxSpeed: 18, efforts: { 1000: 90 } }),
    // Muy rápida pero corta: no cuenta para la mejor velocidad media.
    makeRide(at(2026, 10, 9), { id: 'c', distance: 5000, movingSec: 300, elevationGain: 900 }),
  ];
  const r = records(rides);

  it('guarda cada récord con su salida', () => {
    expect(r.longestDistance).toMatchObject({ value: 80000, rideId: 'a' });
    expect(r.maxGain).toMatchObject({ value: 900, rideId: 'c' });
    expect(r.maxSpeed).toMatchObject({ value: 18, rideId: 'b' });
    expect(r.longestMoving).toMatchObject({ value: 10000, rideId: 'a' });
    expect(r.fastestAvgSpeed).toMatchObject({ value: 10, rideId: 'b' });
  });

  it('el mejor tiempo es el más bajo de todas las salidas', () => {
    expect(r.bestEfforts[1000]).toMatchObject({ value: 90, rideId: 'b' });
    expect(r.bestEfforts[20000]).toMatchObject({ value: 2400, rideId: 'a' });
  });

  it('la semana y el mes con más kilómetros', () => {
    expect(r.biggestWeek?.distance).toBe(110000);
    expect(r.biggestMonth?.distance).toBe(115000);
  });
});

describe('proyección de las metas', () => {
  it('estima con cuánto terminás y cuánto falta por día', () => {
    // Semana del 19 al 25/10: el miércoles a las 18 h pasó ~39 % de la semana.
    const rides = [makeRide(at(2026, 10, 19), { distance: 40000 })];
    const p = goalProgress({ id: 'g', period: 'week', metric: 'distance', target: 150000 }, rides, NOW, true);
    expect(p.projected!).toBeGreaterThan(95000);
    expect(p.projected!).toBeLessThan(110000);
    // Faltan 110 km en 5 días (miércoles a domingo).
    expect(p.daysLeft).toBe(5);
    expect(p.perDay).toBeCloseTo(22000, 0);
  });

  it('al principio del período todavía no hay proyección', () => {
    const p = goalProgress({ id: 'g', period: 'month', metric: 'rides', target: 10 }, [], at(2026, 10, 1, 12), true);
    expect(p.projected).toBeNull();
  });
});

describe('ajustes nuevos', () => {
  it('el tema y el perfil vuelven al valor por defecto si están mal', () => {
    const s = sanitizeSettings({ theme: 'violeta', athlete: { weightKg: 'mucho', bike: 'tándem', hrMax: 500 } });
    expect(s.theme).toBe('system');
    expect(s.athlete).toEqual(DEFAULT_SETTINGS.athlete);
    expect(sanitizeSettings({ theme: 'dark' }).theme).toBe('dark');
  });

  it('valida el perfil campo por campo', () => {
    const a = sanitizeAthlete({ weightKg: 72.5, bikeKg: 9, bike: 'mtb', bikeModel: ' Venzo Raptor ', birthYear: 1980, sex: 'female', hrMax: 185, hrRest: 52 });
    expect(a).toEqual({
      weightKg: 72.5,
      bikeKg: 9,
      bike: 'mtb',
      bikeModel: 'Venzo Raptor',
      birthDate: null,
      birthYear: 1980,
      sex: 'female',
      hrMax: 185,
      hrRest: 52,
    });
    expect(sanitizeAthlete({ bikeModel: 'x'.repeat(200) }).bikeModel).toHaveLength(60);
    expect(sanitizeAthlete({ bikeModel: '   ' }).bikeModel).toBeNull();
    // Reposo demasiado cerca de la máxima: se descarta el reposo.
    expect(sanitizeAthlete({ hrMax: 130, hrRest: 100 }).hrRest).toBeNull();
    expect(sanitizeAthlete({ birthYear: 1980.5 }).birthYear).toBeNull();
  });

  it('la masa total suma ciclista, bici y equipo', () => {
    expect(totalMass({ ...DEFAULT_SETTINGS.athlete, weightKg: 70, bikeKg: 9 })).toBe(80);
    expect(totalMass({ ...DEFAULT_SETTINGS.athlete, weightKg: 70 })).toBe(81);
    expect(totalMass(DEFAULT_SETTINGS.athlete)).toBeNull();
  });
});
