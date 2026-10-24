import { LiveStats } from '../../src/core/live/LiveStats';
import { syntheticRide } from '../../src/core/sim/synthetic';

function run(samples: ReturnType<typeof syntheticRide>) {
  const live = new LiveStats();
  for (const s of samples) live.push(s);
  return live.snapshot();
}

describe('LiveStats', () => {
  it('a velocidad constante da distancia, velocidad media y máxima coherentes', () => {
    // 10 minutos a 25 km/h (6,944 m/s) → ~4,17 km
    const v = 25 / 3.6;
    const snap = run(syntheticRide({ durationSec: 600, speed: v }));
    expect(snap.distance).toBeGreaterThan(4100);
    expect(snap.distance).toBeLessThan(4250);
    expect(snap.avgMovingSpeed * 3.6).toBeCloseTo(25, 0);
    expect(snap.maxSpeed * 3.6).toBeCloseTo(25, 0);
    expect(snap.speed * 3.6).toBeCloseTo(25, 0);
  });

  it('la velocidad media total baja con las paradas, la media en movimiento no', () => {
    const v = 8;
    const moving = syntheticRide({ durationSec: 300, speed: v });
    const stopped = syntheticRide({
      durationSec: 300,
      speed: 0,
      startT: moving[moving.length - 1].t + 1000,
      startLon: moving[moving.length - 1].lon,
    });
    const snap = run([...moving, ...stopped]);
    expect(snap.avgMovingSpeed).toBeCloseTo(8, 0);
    expect(snap.avgTotalSpeed).toBeLessThan(5);
    expect(snap.movingSec).toBeCloseTo(300, -1);
    expect(snap.elapsedSec).toBeGreaterThan(590);
  });

  it('no cuenta como desnivel el ruido de altitud del GPS en terreno llano', () => {
    const snap = run(
      syntheticRide({
        durationSec: 1800,
        speed: 7,
        altitudeAt: () => 25,
        altNoise: 2.5,
        seed: 7,
      }),
    );
    // Sin umbral, 1800 muestras con ruido sumarían cientos de metros.
    expect(snap.elevationGain).toBeLessThan(30);
  });

  it('mide un desnivel real de 100 m en una subida con ruido', () => {
    // 5 km con pendiente del 2 % → +100 m
    const snap = run(
      syntheticRide({
        durationSec: 5000 / 7,
        speed: 7,
        altitudeAt: (d) => 25 + d * 0.02,
        altNoise: 2,
        seed: 3,
      }),
    );
    expect(snap.elevationGain).toBeGreaterThan(85);
    expect(snap.elevationGain).toBeLessThan(125);
    expect(snap.altitude).toBeGreaterThan(115);
  });

  it('ignora saltos de GPS imposibles y picos de velocidad', () => {
    const ride = syntheticRide({ durationSec: 120, speed: 7 });
    // Un punto falso a 3 km de distancia y otro con velocidad Doppler absurda.
    ride[40] = { ...ride[40], lat: ride[40].lat + 0.03 };
    ride[80] = { ...ride[80], speed: 90 };
    const snap = run(ride);
    expect(snap.distance).toBeGreaterThan(800);
    expect(snap.distance).toBeLessThan(900);
    expect(snap.maxSpeed).toBeLessThan(9);
  });

  it('descarta muestras con mala precisión y tiempos repetidos', () => {
    const live = new LiveStats();
    const ride = syntheticRide({ durationSec: 10, speed: 5 });
    expect(live.push(ride[0])).toBe(true);
    expect(live.push({ ...ride[1], acc: 200 })).toBe(false);
    expect(live.push(ride[0])).toBe(false);
    expect(live.push(ride[2])).toBe(true);
  });

  it('expone la frecuencia cardíaca más reciente', () => {
    const snap = run(syntheticRide({ durationSec: 60, speed: 6, hr: (t) => 120 + t }));
    expect(snap.hr).toBe(180);
  });
});

describe('LiveStats: altitud máxima y mínima', () => {
  it('registra los extremos de la altitud suavizada', () => {
    const snap = run(
      syntheticRide({ durationSec: 1200, speed: 6, altitudeAt: (d) => 100 + 50 * Math.sin(d / 1000) }),
    );
    expect(snap.maxAltitude).not.toBeNull();
    expect(snap.maxAltitude!).toBeGreaterThan(145);
    expect(snap.maxAltitude!).toBeLessThanOrEqual(150.5);
    expect(snap.minAltitude!).toBeLessThan(snap.maxAltitude!);
    expect(snap.elevationLoss).toBeGreaterThan(0);
  });
});
