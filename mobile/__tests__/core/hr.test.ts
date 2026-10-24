import { LiveStats } from '../../src/core/live/LiveStats';
import { HrAccumulator, histogramAverage, histogramSeconds, sanitizeHistogram } from '../../src/core/load/hrStats';
import { trimpFromSeries } from '../../src/core/load/hr';
import type { HrProfile } from '../../src/core/load/hr';
import { formStatus, hrLoad, localDateKey, fitnessSeries, resolveHrProfile, trimpFromHistogram, zoneSeconds } from '../../src/core/load/training';
import { syntheticRide } from '../../src/core/sim/synthetic';
import { makeRide } from '../helpers/ride';

const T0 = Date.UTC(2026, 9, 18, 12);

describe('frecuencia cardíaca de una salida', () => {
  it('la media pondera el tiempo entre lecturas', () => {
    const h = new HrAccumulator();
    h.push(T0, 100);
    h.push(T0 + 1000, 100); // 1 s a 100
    h.push(T0 + 4000, 160); // 3 s a 160
    expect(h.average).toBeCloseTo((100 * 1 + 160 * 3) / 4, 5);
    expect(h.duration).toBe(4);
  });

  it('un hueco largo del sensor pesa como mucho 10 s', () => {
    const h = new HrAccumulator();
    h.push(T0, 120);
    h.push(T0 + 600_000, 120);
    expect(h.duration).toBe(10);
  });

  it('ignora lecturas imposibles y un pico aislado en la máxima', () => {
    const h = new HrAccumulator();
    [130, 0, 131, 250, 132, 199, 133, 134].forEach((hr, i) => h.push(T0 + i * 1000, hr));
    // 0 y 250 son errores del sensor; 199 es un pico de una sola muestra.
    expect(h.maximum).toBeLessThan(140);
    expect(h.average).toBeGreaterThan(129);
  });

  it('arma el histograma de segundos por pulsación', () => {
    const h = new HrAccumulator();
    for (let i = 0; i <= 10; i++) h.push(T0 + i * 1000, i < 6 ? 140 : 150);
    const hist = h.histogram()!;
    expect(hist.from).toBe(140);
    expect(hist.s).toHaveLength(11);
    expect(histogramSeconds(hist)).toBe(10);
    expect(hist.s[0]).toBe(5);
    expect(hist.s[10]).toBe(5);
    expect(histogramAverage(hist)).toBe(145);
  });

  it('LiveStats informa la FC media y máxima', () => {
    const live = new LiveStats();
    for (const s of syntheticRide({ durationSec: 600, speed: 7, hr: (t) => (t < 300 ? 130 : 150) })) live.push(s);
    const snap = live.snapshot();
    expect(snap.avgHr).toBeCloseTo(140, 0);
    expect(snap.maxHr).toBe(150);
    expect(live.hrHistogram()).not.toBeNull();
  });

  it('sin sensor no hay FC', () => {
    const live = new LiveStats();
    for (const s of syntheticRide({ durationSec: 60, speed: 7 })) live.push(s);
    expect(live.snapshot()).toMatchObject({ avgHr: null, maxHr: null });
    expect(live.hrHistogram()).toBeNull();
  });

  it('valida el histograma guardado', () => {
    expect(sanitizeHistogram({ from: 120, s: [1, 2, 3] })).toEqual({ from: 120, s: [1, 2, 3] });
    expect(sanitizeHistogram({ from: 120, s: [1, -2] })).toBeNull();
    expect(sanitizeHistogram({ from: 'x', s: [1] })).toBeNull();
    expect(sanitizeHistogram(null)).toBeNull();
  });
});

describe('carga y zonas', () => {
  const p: HrProfile = { hrMax: 190, hrRest: 60, sex: 'male' };

  it('el TRIMP del histograma coincide con el de la serie', () => {
    const series = Array.from({ length: 3600 }, () => 150);
    const fromSeries = trimpFromSeries(series, 1, p);
    const fromHist = trimpFromHistogram({ from: 150, s: [3600] }, p);
    expect(fromHist).toBeCloseTo(fromSeries, 6);
  });

  it('una hora a la FC de umbral vale 100 de carga', () => {
    const thr = Math.round(60 + 0.85 * 130);
    expect(hrLoad({ from: thr, s: [3600] }, p)!).toBeCloseTo(100, -1);
    expect(hrLoad(null, p)).toBeNull();
  });

  it('reparte el tiempo en zonas', () => {
    // Reserva 130: zona 2 empieza en 60 + 0,6·130 = 138 y la zona 4 en 164.
    const z = zoneSeconds({ from: 140, s: [60, ...new Array(24).fill(0), 30] }, p);
    expect(z[2]).toBe(60);
    expect(z[4]).toBe(30);
    expect(z.reduce((a, b) => a + b, 0)).toBe(90);
  });

  it('la FC máxima sale del perfil, de la edad o de la más alta registrada', () => {
    const now = new Date(2026, 9, 21).getTime();
    expect(resolveHrProfile({ hrMax: 185, hrRest: 55, birthYear: null, sex: null }, 170, now)).toMatchObject({
      profile: { hrMax: 185, hrRest: 55 },
      maxSource: 'perfil',
      restEstimated: false,
    });
    // 46 años: 208 − 0,7 × 46 ≈ 176.
    expect(resolveHrProfile({ hrMax: null, hrRest: null, birthYear: 1980, sex: 'male' }, 150, now)).toMatchObject({
      profile: { hrMax: 176, hrRest: 60 },
      maxSource: 'edad',
      restEstimated: true,
    });
    // Si ya registraste una más alta que la estimada, manda la registrada.
    expect(resolveHrProfile({ hrMax: null, hrRest: null, birthYear: 1980, sex: null }, 183, now)?.maxSource).toBe(
      'registrada',
    );
    expect(resolveHrProfile({ hrMax: null, hrRest: null, birthYear: null, sex: null }, 120, now)).toBeNull();
  });

  it('la forma se lee en palabras', () => {
    expect(formStatus(20).label).toBe('Muy descansado');
    expect(formStatus(0).label).toBe('Equilibrado');
    expect(formStatus(-20).tone).toBe('warn');
    expect(formStatus(-40).tone).toBe('bad');
  });

  it('el estado de forma usa la fecha local y llega hasta hoy', () => {
    const day = (d: number, h = 8) => new Date(2026, 9, d, h).getTime();
    const rides = [makeRide(day(1), { hrHist: { from: 150, s: [3600] } }), makeRide(day(10), { hrHist: { from: 150, s: [3600] } })];
    const series = fitnessSeries(rides, p, day(20, 23));
    expect(series[0].date).toBe('2026-10-01');
    expect(series[series.length - 1].date).toBe('2026-10-20');
    expect(localDateKey(day(5, 23))).toBe('2026-10-05');
    expect(series[series.length - 1].ctl).toBeGreaterThan(0);
  });
});
