import { isSameRoute, routeSimilarity } from '../../src/core/efforts/routes';
import { findSegmentEfforts } from '../../src/core/efforts/segments';
import type { Segment } from '../../src/core/efforts/segments';
import { syntheticRide } from '../../src/core/sim/synthetic';

/** Tramo recto hacia el este, tomado de una salida sintética a velocidad constante. */
function straightSegment(fromM: number, toM: number): Segment {
  const ride = syntheticRide({ durationSec: toM, speed: 1 }); // 1 m/s → un punto por metro
  return {
    id: 's1',
    name: 'Tramo de prueba',
    points: ride.filter((_, i) => i >= fromM && i <= toM && i % 50 === 0),
  };
}

describe('findSegmentEfforts', () => {
  const segment = straightSegment(1000, 3000);

  it('mide el tiempo de una pasada a velocidad constante', () => {
    // Salida de 5 km a 8 m/s; el segmento (2 km) debería tardar 250 s.
    const ride = syntheticRide({ durationSec: 625, speed: 8 });
    const [e] = findSegmentEfforts(ride, segment);
    expect(e).toBeDefined();
    expect(e.durationSec).toBeGreaterThan(245);
    expect(e.durationSec).toBeLessThan(255);
    expect(e.avgSpeed).toBeCloseTo(8, 0);
  });

  it('la comparación entre dos pasadas refleja cuál fue más rápida', () => {
    const slow = findSegmentEfforts(syntheticRide({ durationSec: 700, speed: 7 }), segment)[0];
    const fast = findSegmentEfforts(syntheticRide({ durationSec: 700, speed: 9 }), segment)[0];
    expect(fast.durationSec).toBeLessThan(slow.durationSec);
  });

  it('no cuenta una salida que no completa el segmento', () => {
    const ride = syntheticRide({ durationSec: 300, speed: 8 }); // llega a 2,4 km
    expect(findSegmentEfforts(ride, segment)).toHaveLength(0);
  });

  it('no cuenta una salida que pasa lejos del trazado', () => {
    const ride = syntheticRide({ durationSec: 625, speed: 8, startLat: -34.59 }); // ~1 km al norte
    expect(findSegmentEfforts(ride, segment)).toHaveLength(0);
  });

  it('encuentra al menos la pasada de ida en una salida de ida y vuelta', () => {
    const out = syntheticRide({ durationSec: 450, speed: 8 });
    const back = out
      .map((s, i) => ({ ...s, t: out[out.length - 1].t + (i + 1) * 1000, lon: out[out.length - 1 - i].lon }))
      .filter((s) => s.lon !== undefined);
    const efforts = findSegmentEfforts([...out, ...back], segment);
    expect(efforts.length).toBeGreaterThanOrEqual(1);
  });

  it('incluye la FC media de la pasada', () => {
    const ride = syntheticRide({ durationSec: 625, speed: 8, hr: 150 });
    expect(findSegmentEfforts(ride, segment)[0].avgHr).toBeCloseTo(150, 5);
  });
});

describe('routeSimilarity', () => {
  const a = syntheticRide({ durationSec: 600, speed: 8 });

  it('la misma ruta con ruido de GPS es casi idéntica', () => {
    const b = syntheticRide({ durationSec: 600, speed: 8, posNoise: 6, seed: 9 });
    expect(routeSimilarity(a, b)).toBeGreaterThan(0.95);
    expect(isSameRoute(a, b)).toBe(true);
  });

  it('una ruta paralela a 500 m no coincide', () => {
    const b = syntheticRide({ durationSec: 600, speed: 8, startLat: -34.5955 });
    expect(routeSimilarity(a, b)).toBeLessThan(0.2);
  });

  it('una salida más corta contenida en otra más larga no se considera la misma ruta', () => {
    const short = syntheticRide({ durationSec: 200, speed: 8 });
    expect(isSameRoute(a, short)).toBe(false);
  });
});
