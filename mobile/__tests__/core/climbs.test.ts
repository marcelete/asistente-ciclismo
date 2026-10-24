import { detectClimbs } from '../../src/core/elevation/climbs';
import { smoothMovingAverage } from '../../src/core/elevation/gain';
import { seededRandom } from '../../src/core/sim/synthetic';

/** Perfil por tramos [longitud m, pendiente %], muestreado cada 10 m. */
function profile(legs: [number, number][], noise = 0, seed = 5) {
  const rand = seededRandom(seed);
  const dist: number[] = [0];
  const alt: number[] = [100];
  for (const [len, grade] of legs) {
    for (let d = 10; d <= len; d += 10) {
      dist.push(dist[dist.length - 1] + 10);
      alt.push(alt[alt.length - 1] + (grade / 100) * 10);
    }
  }
  const noisy = alt.map((a) => a + (rand() - 0.5) * 2 * noise);
  return { dist, alt: noise ? smoothMovingAverage(noisy, 9) : noisy };
}

describe('detectClimbs', () => {
  it('detecta una subida del 4 % de 3 km y no cuenta lo llano', () => {
    const { dist, alt } = profile([
      [2000, 0],
      [3000, 4],
      [2000, 0],
      [3000, -4],
    ]);
    const climbs = detectClimbs(dist, alt);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].gain).toBeCloseTo(120, 0);
    expect(climbs[0].avgGrade).toBeCloseTo(4, 1);
    expect(climbs[0].startDist).toBeCloseTo(2000, -2);
    expect(climbs[0].length).toBeCloseTo(3000, -2);
  });

  it('ignora el ruido de altitud en terreno llano', () => {
    const { dist, alt } = profile([[8000, 0]], 3);
    expect(detectClimbs(dist, alt)).toHaveLength(0);
  });

  it('descarta subidas cortas o suaves', () => {
    const short = profile([[300, 8]]); // +24 m, 300 m
    expect(detectClimbs(short.dist, short.alt)).toHaveLength(0);
    const gentle = profile([[6000, 1]]); // +60 m pero 1 %
    expect(detectClimbs(gentle.dist, gentle.alt)).toHaveLength(0);
  });

  it('une dos subidas separadas por una bajada pequeña', () => {
    const { dist, alt } = profile([
      [1500, 5],
      [200, -4], // -8 m
      [1500, 5],
    ]);
    const climbs = detectClimbs(dist, alt);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].gain).toBeCloseTo(75 + 75 - 8, 0);
  });

  it('mantiene separadas dos subidas con un descenso grande entre ambas', () => {
    const { dist, alt } = profile([
      [1500, 5],
      [1500, -5],
      [1500, 5],
    ]);
    expect(detectClimbs(dist, alt)).toHaveLength(2);
  });

  it('la pendiente máxima refleja el tramo más duro', () => {
    const { dist, alt } = profile([
      [1000, 3],
      [400, 9],
      [1000, 3],
    ]);
    const [c] = detectClimbs(dist, alt);
    expect(c.maxGrade).toBeGreaterThan(8);
    expect(c.maxGrade).toBeLessThan(9.5);
  });
});
