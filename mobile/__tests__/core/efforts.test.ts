import { bestEfforts } from '../../src/core/efforts/bestEfforts';
import { resampleTo1Hz } from '../../src/core/geo/resample';
import { syntheticRide } from '../../src/core/sim/synthetic';

describe('bestEfforts', () => {
  it('encuentra el mejor tramo de cada duración', () => {
    // 100 s a 100, luego 60 s a 300, luego 100 s a 100
    const series = [...Array(100).fill(100), ...Array(60).fill(300), ...Array(100).fill(100)];
    const r = bestEfforts(series, [30, 60, 120]);
    expect(r.find((e) => e.durationSec === 30)?.value).toBe(300);
    expect(r.find((e) => e.durationSec === 60)?.value).toBe(300);
    expect(r.find((e) => e.durationSec === 60)?.startIndex).toBe(100);
    // 120 s: los 60 s a 300 y 60 s a 100 → 200
    expect(r.find((e) => e.durationSec === 120)?.value).toBe(200);
  });

  it('omite duraciones más largas que la serie y descarta ventanas con huecos', () => {
    const series: (number | null)[] = [...Array(50).fill(10), null, ...Array(50).fill(20)];
    const r = bestEfforts(series, [40, 60, 200]);
    expect(r.find((e) => e.durationSec === 200)).toBeUndefined();
    expect(r.find((e) => e.durationSec === 40)?.value).toBe(20);
    // Cualquier ventana de 60 s cruza el hueco.
    expect(r.find((e) => e.durationSec === 60)).toBeUndefined();
  });
});

describe('resampleTo1Hz', () => {
  it('interpola muestras irregulares a 1 Hz', () => {
    const ride = syntheticRide({ durationSec: 20, speed: 5, hr: 100 });
    const sparse = ride.filter((_, i) => i % 4 === 0); // una cada 4 s
    const { samples, gap } = resampleTo1Hz(sparse);
    expect(samples).toHaveLength(21);
    expect(gap.some(Boolean)).toBe(false);
    expect(samples[2].t - samples[1].t).toBe(1000);
    expect(samples[2].hr).toBeCloseTo(100, 6);
  });

  it('marca los huecos largos sin inventar datos', () => {
    const ride = syntheticRide({ durationSec: 60, speed: 5 });
    const withGap = [...ride.slice(0, 10), ...ride.slice(40)];
    const { samples, gap } = resampleTo1Hz(withGap, 10);
    const gapped = samples.filter((_, i) => gap[i]);
    expect(gapped.length).toBeGreaterThan(20);
    expect(gapped.every((s) => s.speed === null && s.hr === null)).toBe(true);
  });
});
