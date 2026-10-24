import { bearingDegrees, haversineMeters } from '../../src/core/geo/distance';

describe('haversineMeters', () => {
  it('es 0 para el mismo punto', () => {
    expect(haversineMeters(-34.6, -58.4, -34.6, -58.4)).toBe(0);
  });

  it('un grado de latitud mide ~111,2 km', () => {
    expect(haversineMeters(0, 0, 1, 0)).toBeCloseTo(111195, -2);
  });

  it('Buenos Aires - Córdoba ronda los 646 km', () => {
    const d = haversineMeters(-34.6037, -58.3816, -31.4201, -64.1888);
    expect(d / 1000).toBeGreaterThan(640);
    expect(d / 1000).toBeLessThan(652);
  });
});

describe('bearingDegrees', () => {
  it('norte = 0, este = 90, sur = 180, oeste = 270', () => {
    expect(bearingDegrees(0, 0, 1, 0)).toBeCloseTo(0, 5);
    expect(bearingDegrees(0, 0, 0, 1)).toBeCloseTo(90, 5);
    expect(bearingDegrees(0, 0, -1, 0)).toBeCloseTo(180, 5);
    expect(bearingDegrees(0, 0, 0, -1)).toBeCloseTo(270, 5);
  });
});
