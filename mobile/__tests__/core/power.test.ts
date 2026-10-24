import { DEFAULT_POWER_PARAMS, airDensity, estimatePower } from '../../src/core/power/model';

const params = { ...DEFAULT_POWER_PARAMS, massKg: 80, crr: 0.005, cdA: 0.32, rho: 1.2 };

describe('airDensity', () => {
  it('ronda 1,225 kg/m³ al nivel del mar a 15 °C', () => {
    expect(airDensity(15, 1013.25, 0)).toBeCloseTo(1.225, 2);
  });

  it('baja con la altura y con el calor', () => {
    expect(airDensity(15, 800, 50)).toBeLessThan(airDensity(15, 1013, 50));
    expect(airDensity(35, 1013, 50)).toBeLessThan(airDensity(10, 1013, 50));
  });
});

describe('estimatePower', () => {
  it('plano a 30 km/h sin viento ronda los 150 W', () => {
    const w = estimatePower(params, { speed: 30 / 3.6, grade: 0 });
    expect(w).toBeGreaterThan(140);
    expect(w).toBeLessThan(160);
  });

  it('subida del 8 % a 15 km/h ronda los 300 W', () => {
    const w = estimatePower(params, { speed: 15 / 3.6, grade: 0.08 });
    expect(w).toBeGreaterThan(290);
    expect(w).toBeLessThan(310);
  });

  it('el viento en contra exige más potencia y el de cola, menos', () => {
    const base = estimatePower(params, { speed: 8, grade: 0 });
    expect(estimatePower(params, { speed: 8, grade: 0, headwind: 5 })).toBeGreaterThan(base);
    expect(estimatePower(params, { speed: 8, grade: 0, headwind: -5 })).toBeLessThan(base);
  });

  it('en un descenso empinado no se pedalea (0 W)', () => {
    expect(estimatePower(params, { speed: 12, grade: -0.08 })).toBe(0);
  });

  it('acelerar cuesta potencia extra', () => {
    const base = estimatePower(params, { speed: 6, grade: 0 });
    expect(estimatePower(params, { speed: 6, grade: 0, accel: 0.5 })).toBeGreaterThan(base + 100);
  });
});
