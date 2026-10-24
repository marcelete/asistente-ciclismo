import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzeActivity, ANALYSIS_VERSION } from '../../src/core/analysis/ride';
import {
  altitudeSeries,
  climbCategory,
  climbsFromProfile,
  estimateEnergy,
  speedSeries,
} from '../../src/core/analysis/profileMetrics';
import { fastestDistances, sanitizeEfforts } from '../../src/core/efforts/distanceEfforts';
import { buildProfile, mergeDem } from '../../src/core/elevation/profile';
import type { ProfilePoint } from '../../src/core/elevation/profile';
import { parseGpxTrack, toGpx } from '../../src/core/io/gpx';
import { syntheticRide } from '../../src/core/sim/synthetic';
import { customName, rideTitle, rideTypeLabel } from '../../src/core/stats/rides';
import { parseOpenTracksGpx } from '../../src/import/openTracks';
import { point } from '../helpers/ride';

describe('nombre y tipo de la traza', () => {
  it('lee los del GPX real de OpenTracks', () => {
    const text = readFileSync(join(__dirname, '..', 'fixtures', 'opentracks_emulator.gpx'), 'utf8');
    const track = parseGpxTrack(text);
    expect(track.name).toBe('2026-10-19T13:54Z');
    expect(track.activityType).toBe('unknown');
    // El nombre automático (la fecha) y el tipo "unknown" no se muestran.
    expect(customName(track.name)).toBeNull();
    expect(rideTypeLabel({ activityType: track.activityType })).toBeNull();
  });

  it('conserva el nombre que le pusiste y el tipo', () => {
    const text = toGpx(syntheticRide({ durationSec: 60, speed: 6 }), 'Vuelta al lago', 'ciclismo de ruta');
    const act = parseOpenTracksGpx(text, 'a.gpx')!;
    expect(act.name).toBe('Vuelta al lago');
    expect(rideTypeLabel({ activityType: act.activityType })).toBe('Ciclismo de ruta');
  });

  it('sin nombre propio, el título sale de la hora de inicio', () => {
    expect(rideTitle({ name: null, startT: new Date(2026, 9, 19, 7).getTime() })).toBe('Salida matutina');
    expect(rideTitle({ name: null, startT: new Date(2026, 9, 19, 18).getTime() })).toBe('Salida de la tarde');
    expect(rideTitle({ name: 'Al trabajo', startT: 0 })).toBe('Al trabajo');
  });
});

describe('perfil con tiempo y FC', () => {
  const ride = syntheticRide({ durationSec: 600, speed: 10, hr: (t) => 120 + t / 20, altitudeAt: (d) => 30 + d * 0.01 });
  const profile = buildProfile(ride, 50);

  it('cada punto tiene el segundo de la salida y la FC', () => {
    expect(profile[0]).toMatchObject({ d: 0, t: 0 });
    // A 10 m/s, 50 m son 5 s.
    expect(profile[10].t).toBeCloseTo(50, 0);
    expect(profile[10].hr).toBeCloseTo(120 + 50 / 20, 0);
    expect(profile.every((p, i) => i === 0 || p.t! >= profile[i - 1].t!)).toBe(true);
  });

  it('pasa la altitud del mapa de un perfil viejo a uno nuevo', () => {
    const old = profile.map((p, i) => ({ ...p, dem: i % 2 === 0 ? 100 + i : null, t: null, hr: null }));
    const merged = mergeDem(profile, old);
    expect(merged[0].dem).toBe(100);
    expect(merged[1].dem).toBeNull();
    expect(merged[2].dem).toBe(102);
    // Lo nuevo (tiempo y FC) se conserva.
    expect(merged[2].t).toBe(profile[2].t);
    expect(mergeDem(profile, null)).toBe(profile);
  });

  it('la velocidad a lo largo del recorrido sale de los tiempos', () => {
    const v = speedSeries(profile);
    expect(v[20]!).toBeCloseTo(10, 0);
    expect(speedSeries([point(0), point(50)])).toEqual([null, null]);
  });
});

describe('mejores tiempos por distancia', () => {
  it('a velocidad constante, 1 km lleva 1000 / v segundos', () => {
    const pts = Array.from({ length: 61 }, (_, i) => point(i * 50, { t: i * 5 })); // 10 m/s, 3 km
    const best = fastestDistances(pts);
    expect(best[1000]).toBeCloseTo(100, 5);
    expect(best[5000]).toBeUndefined();
  });

  it('elige el tramo más rápido y cuenta las paradas dentro de la ventana', () => {
    // 2 km a 5 m/s, 1 km a 10 m/s, otra vez 2 km a 5 m/s.
    const pts: ProfilePoint[] = [];
    let t = 0;
    for (let d = 0; d <= 5000; d += 50) {
      pts.push(point(d, { t }));
      t += d >= 2000 && d < 3000 ? 5 : 10;
    }
    expect(fastestDistances(pts)[1000]).toBeCloseTo(100, 5);
    expect(fastestDistances(pts)[5000]).toBeCloseTo(t - 10, 5);
  });

  it('el mejor tramo puede empezar entre dos puntos', () => {
    // 400 m a 5 m/s, 900 m a 10 m/s y 500 m a 2 m/s. El km más rápido son los 900 m rápidos más los
    // 100 m de antes (de 300 a 1300 m): 20 + 90 = 110 s. Ninguna ventana que empiece en un punto lo logra.
    const pts = [point(0, { t: 0 }), point(400, { t: 80 }), point(1000, { t: 140 }), point(1300, { t: 170 }), point(1800, { t: 420 })];
    expect(fastestDistances(pts, [1000])[1000]).toBeCloseTo(110, 5);
  });

  it('valida los mejores tiempos guardados', () => {
    expect(sanitizeEfforts({ '1000': 120, '5000': -1, x: 3 })).toEqual({ 1000: 120 });
    expect(sanitizeEfforts([1, 2])).toBeNull();
    expect(sanitizeEfforts({})).toBeNull();
  });
});

describe('subidas', () => {
  // 2 km llanos, 3 km al 6 % y 1 km llano, a 5 m/s en la subida.
  const pts: ProfilePoint[] = [];
  let t = 0;
  for (let d = 0; d <= 6000; d += 50) {
    const alt = d < 2000 ? 100 : d < 5000 ? 100 + (d - 2000) * 0.06 : 280;
    pts.push(point(d, { dem: alt, t }));
    t += d >= 2000 && d < 5000 ? 10 : 5;
  }

  it('detecta la subida con su tiempo, VAM y categoría', () => {
    const climbs = climbsFromProfile(pts);
    expect(climbs).toHaveLength(1);
    const c = climbs[0];
    expect(c.length).toBeGreaterThan(2700);
    expect(c.gain).toBeGreaterThan(160);
    expect(c.avgGrade).toBeCloseTo(6, 0);
    // 180 m en 600 s → ~1.080 m/h.
    expect(c.vam!).toBeGreaterThan(950);
    expect(c.vam!).toBeLessThan(1150);
    // 3 km al 6 %: 18.000 puntos, categoría 3.
    expect(c.category).toBe('3');
  });

  it('categoriza por largo × pendiente', () => {
    expect(climbCategory(1000, 5)).toBeNull();
    expect(climbCategory(2000, 5)).toBe('4');
    expect(climbCategory(10000, 9)).toBe('HC');
  });
});

describe('potencia y energía estimadas', () => {
  it('en llano a 30 km/h con 80 kg da unos 145 W', () => {
    const v = 30 / 3.6;
    const pts = Array.from({ length: 201 }, (_, i) => point(i * 50, { dem: 25, t: (i * 50) / v }));
    const e = estimateEnergy(pts, { massKg: 80, bike: 'road' })!;
    expect(e.avgPower).toBeGreaterThan(130);
    expect(e.avgPower).toBeLessThan(160);
    // kcal ≈ kJ con la eficiencia muscular del 24 %.
    expect(e.kcal).toBeCloseTo(e.workKj * 0.996, 0);
    expect(e.movingSec).toBeCloseTo(10000 / v, 0);
  });

  it('subir cuesta más que el llano y sin tiempos no hay estimación', () => {
    const flat = Array.from({ length: 41 }, (_, i) => point(i * 50, { dem: 25, t: i * 10 }));
    const hill = flat.map((p, i) => ({ ...p, dem: 25 + i * 3 }));
    expect(estimateEnergy(hill, { massKg: 80, bike: 'road' })!.avgPower).toBeGreaterThan(
      estimateEnergy(flat, { massKg: 80, bike: 'road' })!.avgPower * 3,
    );
    expect(estimateEnergy([point(0), point(50)], { massKg: 80, bike: 'road' })).toBeNull();
  });

  it('usa la altitud del mapa si está completa y si no la del GPS', () => {
    expect(altitudeSeries([point(0, { dem: 5, gps: 9 }), point(50, { dem: 6, gps: 9 })])?.source).toBe('dem');
    expect(altitudeSeries([point(0, { dem: 5, gps: 9 }), point(50, { gps: 9 })])?.source).toBe('gps');
    expect(altitudeSeries([point(0), point(50)])).toBeNull();
  });
});

describe('análisis completo de una salida', () => {
  it('guarda FC, mejores tiempos, nombre y versión', () => {
    const samples = syntheticRide({ durationSec: 1200, speed: 8, hr: 145, altitudeAt: () => 30 });
    const act = parseOpenTracksGpx(toGpx(samples, 'Costanera'), 'c.gpx')!;
    const { record, profile } = analyzeActivity(act);
    expect(record.analysis).toBe(ANALYSIS_VERSION);
    expect(record.name).toBe('Costanera');
    expect(record.avgHr).toBeCloseTo(145, 0);
    expect(record.maxHr).toBe(145);
    expect(record.hrHist).toEqual({ from: 145, s: [expect.any(Number)] });
    expect(record.efforts?.[5000]).toBeCloseTo(5000 / 8, -1);
    expect(profile.length).toBeGreaterThan(150);
  });
});
