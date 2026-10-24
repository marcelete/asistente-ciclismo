import { buildProfile, chunk, cumulativeGain, demAltitudes, elevationStats } from '../../src/core/elevation/profile';
import { syntheticRide } from '../../src/core/sim/synthetic';
import { rideElevation } from '../../src/core/stats/rides';
import type { RideRecord } from '../../src/core/stats/rides';
import { point } from '../helpers/ride';

describe('perfil de altitud', () => {
  it('toma un punto cada 50 m e incluye el final', () => {
    // 10 minutos a 7 m/s ≈ 4.200 m
    const ride = syntheticRide({ durationSec: 600, speed: 7, altitudeAt: (d) => 100 + d * 0.02 });
    const p = buildProfile(ride, 50);
    expect(p[0].d).toBe(0);
    expect(p[1].d).toBe(50);
    const last = p[p.length - 1];
    expect(last.d).toBeGreaterThan(4100);
    expect(p.length).toBeGreaterThan(80);
    // La altitud del GPS se interpola en cada punto.
    expect(p[20].gps!).toBeCloseTo(100 + 1000 * 0.02, 0);
    expect(p.every((x) => x.dem === null)).toBe(true);
  });

  it('ignora los saltos imposibles del GPS', () => {
    const ride = syntheticRide({ durationSec: 300, speed: 7 });
    ride[150] = { ...ride[150], lat: ride[150].lat + 0.05 }; // ~5,5 km de salto
    const p = buildProfile(ride, 50);
    expect(p[p.length - 1].d).toBeLessThan(2200);
  });

  it('suma cada subida y cada bajada de la salida, no solo la diferencia entre extremos', () => {
    // Tres lomas de 40 m: sube 120 m en total y baja 120 m, aunque empieza y termina a la misma altura.
    const alts: number[] = [];
    for (let i = 0; i <= 600; i++) alts.push(100 + 20 * (1 - Math.cos((i / 200) * 2 * Math.PI)));
    const s = elevationStats(alts)!;
    expect(s.gain).toBeCloseTo(120, -1);
    expect(s.loss).toBeCloseTo(120, -1);
    expect(s.maxAltitude).toBeCloseTo(140, 0);
    expect(s.minAltitude).toBeCloseTo(100, 0);
  });

  it('el desnivel acumulado crece solo en las subidas', () => {
    // Sube 30 m, baja 30 m, sube 20 m y sigue llano; un punto por metro de altura (cada ~50 m).
    const alts = [
      ...Array.from({ length: 31 }, (_, i) => 100 + i),
      ...Array.from({ length: 30 }, (_, i) => 129 - i),
      ...Array.from({ length: 20 }, (_, i) => 101 + i),
      ...Array.from({ length: 10 }, () => 120),
    ];
    const cum = cumulativeGain(alts, 1, 3);
    expect(Math.abs(cum[45] - 30)).toBeLessThanOrEqual(2);
    expect(cum[60]).toBe(cum[45]);
    expect(Math.abs(cum[alts.length - 1] - 50)).toBeLessThanOrEqual(3);
  });

  it('no suma los picos angostos del modelo de terreno (edificios, árboles)', () => {
    const flat = Array.from({ length: 100 }, () => 500);
    flat[30] = 525; // un punto
    flat[70] = 520; // dos puntos seguidos
    flat[71] = 522;
    expect(elevationStats(flat)!.gain).toBe(0);
    expect(elevationStats(flat)!.maxAltitude).toBe(500);
  });

  it('solo hay altitudes del mapa cuando están todos los puntos', () => {
    const pts = [point(0, { gps: 1, dem: 5 }), point(50, { gps: 1 })];
    expect(demAltitudes(pts)).toBeNull();
    expect(demAltitudes([pts[0]])).toEqual([5]);
  });

  it('parte las consultas en tandas de 100', () => {
    expect(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it('una salida usa el desnivel del mapa si ya está, si no el del GPS', () => {
    const r = { elevationGain: 300, elevationLoss: 280, maxAltitude: 500, minAltitude: 100, dem: null } as RideRecord;
    expect(rideElevation(r)).toMatchObject({ gain: 300, source: 'gps' });
    const withDem = { ...r, dem: { gain: 250, loss: 250, maxAltitude: 480, minAltitude: 110 } };
    expect(rideElevation(withDem)).toMatchObject({ gain: 250, maxAltitude: 480, source: 'dem' });
  });
});
