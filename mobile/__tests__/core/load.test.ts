import { computeFitness } from '../../src/core/load/fitness';
import { hrTss, hrZone, hrZoneRanges, trimpFromSeries, trimpSegment } from '../../src/core/load/hr';
import type { HrProfile } from '../../src/core/load/hr';

const profile: HrProfile = { hrMax: 190, hrRest: 50, hrThreshold: 168, sex: 'male' };

describe('zonas de FC', () => {
  it('clasifica por reserva de FC', () => {
    expect(hrZone(60, profile)).toBe(0);
    expect(hrZone(125, profile)).toBe(1); // 54 % de la reserva
    expect(hrZone(150, profile)).toBe(3); // 71 %
    expect(hrZone(190, profile)).toBe(5);
  });

  it('los rangos cubren de la zona 1 al máximo sin huecos', () => {
    const r = hrZoneRanges(profile);
    expect(r).toHaveLength(5);
    expect(r[4].max).toBe(190);
    for (let i = 1; i < r.length; i++) expect(r[i].min).toBe(r[i - 1].max);
  });
});

describe('TRIMP y hrTSS', () => {
  it('crece con la intensidad y con el tiempo', () => {
    expect(trimpSegment(150, 60, profile)).toBeGreaterThan(trimpSegment(130, 60, profile));
    expect(trimpSegment(150, 60, profile)).toBeCloseTo(2 * trimpSegment(150, 30, profile), 6);
  });

  it('una hora a la FC de umbral vale 100 de hrTSS', () => {
    const trimp = trimpFromSeries(new Array(3600).fill(168), 1, profile);
    expect(hrTss(trimp, profile)).toBeCloseTo(100, 3);
  });

  it('ignora las muestras sin FC', () => {
    expect(trimpFromSeries([null, null, 150, null], 1, profile)).toBeCloseTo(
      trimpSegment(150, 1 / 60, profile),
      9,
    );
  });
});

describe('computeFitness', () => {
  it('con carga diaria constante, CTL converge a la carga y ATL lo hace antes', () => {
    const loads = Array.from({ length: 200 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10),
      load: 60,
    }));
    const f = computeFitness(loads);
    const last = f[f.length - 1];
    expect(last.ctl).toBeGreaterThan(59);
    expect(last.atl).toBeCloseTo(60, 1);
    expect(f[20].atl).toBeGreaterThan(f[20].ctl);
  });

  it('los días sin entrada cuentan como 0 y la forma sube con el descanso', () => {
    const f = computeFitness([
      { date: '2026-03-01', load: 100 },
      { date: '2026-03-02', load: 100 },
      { date: '2026-03-10', load: 0 },
    ]);
    expect(f).toHaveLength(10);
    expect(f[2].load).toBe(0);
    expect(f[9].tsb).toBeGreaterThan(f[2].tsb);
  });

  it('suma varias salidas del mismo día y acepta desorden', () => {
    const f = computeFitness([
      { date: '2026-03-02', load: 30 },
      { date: '2026-03-01', load: 10 },
      { date: '2026-03-01', load: 20 },
    ]);
    expect(f[0].load).toBe(30);
    expect(f[1].load).toBe(30);
  });
});
