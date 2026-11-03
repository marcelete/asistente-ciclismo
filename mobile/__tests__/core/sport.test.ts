import { averageCadence } from '../../src/core/analysis/ride';
import { familiesFor, badgeKey } from '../../src/core/awards/catalog';
import { computeAwards } from '../../src/core/awards/engine';
import { effortDistancesFor, effortLabel, EFFORT_DISTANCES_M, fastestDistances } from '../../src/core/efforts/distanceEfforts';
import { goalProgress } from '../../src/core/goals/goals';
import { rideText } from '../../src/core/narrative/rideText';
import { records } from '../../src/core/stats/records';
import { rideTitle } from '../../src/core/stats/rides';
import { classifySport, countsAsRide, isSport, overrideFor, sanitizeOverride, sportOf } from '../../src/core/stats/sport';
import { sanitizeRunRace, sanitizeSettings } from '../../src/data/settings';
import { formatPace, formatPaceSec, speedFor } from '../../src/ui/format';
import { at, makeRide } from '../helpers/ride';

describe('deporte de cada salida', () => {
  it('clasifica los textos que escribe OpenTracks', () => {
    expect(classifySport('running')).toBe('run');
    expect(classifySport('Correr')).toBe('run');
    expect(classifySport('trail running')).toBe('run');
    expect(classifySport('Trote')).toBe('run');
    expect(classifySport('jogging')).toBe('run');
    expect(classifySport('mountain biking')).toBe('bike');
    expect(classifySport('Ciclismo de ruta')).toBe('bike');
    expect(classifySport('walking')).toBe('other');
    expect(classifySport('Caminata')).toBe('other');
    expect(classifySport('motor bike')).toBe('other');
    expect(classifySport('unknown')).toBe('unknown');
    expect(classifySport(null)).toBe('unknown');
  });

  it('sin tipo cuenta como bici y lo que elegiste en el detalle manda', () => {
    expect(sportOf({ activityType: null, countedOverride: null })).toBe('bike');
    expect(sportOf({ activityType: 'running', countedOverride: null })).toBe('run');
    expect(sportOf({ activityType: 'walking', countedOverride: null })).toBeNull();
    expect(sportOf({ activityType: 'walking', countedOverride: 2 })).toBe('run');
    expect(sportOf({ activityType: 'running', countedOverride: 1 })).toBe('bike');
    expect(sportOf({ activityType: 'Ciclismo', countedOverride: 0 })).toBeNull();
    expect(countsAsRide({ activityType: 'running', countedOverride: null })).toBe(true);
  });

  it('los valores viejos del override (0 y 1) siguen valiendo y se descarta lo raro', () => {
    expect(sanitizeOverride(0)).toBe(0);
    expect(sanitizeOverride(1)).toBe(1);
    expect(sanitizeOverride(2)).toBe(2);
    expect(sanitizeOverride(3)).toBeNull();
    expect(sanitizeOverride('1')).toBeNull();
    expect(overrideFor('none')).toBe(0);
    expect(overrideFor('bike')).toBe(1);
    expect(overrideFor('run')).toBe(2);
  });

  it('el título automático dice carrera o salida', () => {
    expect(rideTitle({ name: null, startT: at(2026, 11, 3, 8), activityType: 'running' })).toBe('Carrera matutina');
    expect(rideTitle({ name: null, startT: at(2026, 11, 3, 16) })).toBe('Salida de la tarde');
  });
});

describe('ajustes de correr', () => {
  it('el deporte y la marca se validan', () => {
    expect(sanitizeSettings({}).sport).toBe('bike');
    expect(sanitizeSettings({ sport: 'run' }).sport).toBe('run');
    expect(sanitizeSettings({ sport: 'swim' }).sport).toBe('bike');
    expect(sanitizeRunRace({ km: 10, sec: 3000, date: '2026-10-20' })).toEqual({ km: 10, sec: 3000, date: '2026-10-20' });
    // 10 km en 10 minutos no es creíble.
    expect(sanitizeRunRace({ km: 10, sec: 600, date: '2026-10-20' })).toBeNull();
    expect(sanitizeRunRace({ km: 10, sec: 3000, date: 'ayer' })).toBeNull();
    const c = sanitizeSettings({ coach: { paceTolSec: 99, cadenceMin: 180, cadenceMax: 170 } }).coach;
    expect(c.paceTolSec).toBe(10);
    expect([c.cadenceMin, c.cadenceMax]).toEqual([165, 185]);
  });
});

describe('ritmo', () => {
  it('formatea minutos por km', () => {
    expect(formatPace(1000 / 330)).toBe('5:30');
    expect(formatPace(1000 / 299.6)).toBe('5:00');
    expect(formatPace(0)).toBe('--');
    expect(formatPace(NaN)).toBe('--');
    expect(formatPaceSec(59.6)).toBe('1:00');
    expect(speedFor('run', 1000 / 360)).toEqual({ value: '6:00', unit: '/km' });
    expect(speedFor('bike', 25 / 3.6)).toEqual({ value: '25,0', unit: 'km/h' });
  });
});

describe('mejores tiempos de correr', () => {
  it('se calculan la milla, la media y la maratón', () => {
    expect(EFFORT_DISTANCES_M).toEqual(expect.arrayContaining([400, 1609, 21097, 42195, 100000]));
    expect(effortDistancesFor('run')).not.toContain(100000);
    expect(effortLabel(1609)).toBe('1 milla');
    expect(effortLabel(21097)).toBe('Media maratón');
    expect(effortLabel(400)).toBe('400 m');
    expect(effortLabel(5000)).toBe('5 km');
    // Ritmo parejo de 5:00 por km durante 6 km.
    const pts = Array.from({ length: 121 }, (_, i) => ({ d: i * 50, t: i * 15 }));
    const e = fastestDistances(pts);
    expect(e[400]).toBeCloseTo(120, 0);
    expect(e[1609]).toBeCloseTo(482.7, 0);
    expect(e[5000]).toBeCloseTo(1500, 0);
  });

  it('cadencia media: los sensores de un solo pie se duplican al correr', () => {
    const s = (cad: number) => ({ t: 0, lat: 0, lon: 0, alt: null, speed: 3, hr: null, acc: null, cad });
    expect(averageCadence(Array.from({ length: 20 }, () => s(86)), true)).toBe(172);
    expect(averageCadence(Array.from({ length: 20 }, () => s(86)), false)).toBe(86);
    expect(averageCadence(Array.from({ length: 5 }, () => s(170)), true)).toBeNull();
  });
});

describe('estadísticas separadas por deporte', () => {
  const bike = makeRide(at(2026, 10, 1), { id: 'b', distance: 40000, movingSec: 5400 });
  const run = makeRide(at(2026, 10, 2), { id: 'r', activityType: 'running', distance: 8000, movingSec: 2400 });
  const all = [bike, run];

  it('cada meta mira solo las de su deporte', () => {
    const now = at(2026, 10, 3);
    const g = { id: '1', period: 'month' as const, metric: 'distance' as const, target: 100000 };
    expect(goalProgress(g, all, now, true).value).toBe(40000);
    expect(goalProgress({ ...g, sport: 'run' }, all, now, true).value).toBe(8000);
  });

  it('el récord de ritmo medio de correr cuenta desde los 5 km', () => {
    const r = records(all.filter(isSport('run')), 'run');
    expect(r.fastestAvgSpeed?.rideId).toBe('r');
    expect(records(all.filter(isSport('bike')), 'bike').fastestAvgSpeed?.rideId).toBe('b');
  });

  it('los logros de correr tienen sus umbrales y claves con prefijo', () => {
    const fams = familiesFor('run');
    expect(fams.find((f) => f.id === 'bikeKm')).toBeUndefined();
    expect(fams.find((f) => f.id === 'rideKm')!.thresholds).toContain(42.2);
    expect(badgeKey('km', 50, 'run')).toBe('run:badge:km:50');
    expect(badgeKey('km', 100)).toBe('badge:km:100');

    const runs = [8000, 10500, 5000].map((d, i) =>
      makeRide(at(2026, 10, 2 + i), { id: `r${i}`, activityType: 'running', distance: d, movingSec: d / (11 / 3.6) }),
    );
    const res = computeAwards({ rides: runs, goals: [], now: at(2026, 10, 10), autoPause: true, sport: 'run' });
    expect(res.events.length).toBeGreaterThan(0);
    for (const e of res.events) expect(e.key.startsWith('run:')).toBe(true);
    const titles = res.badges.map((b) => b.title);
    expect(titles).toContain('Tu primera carrera');
    expect(titles).toContain('Una carrera de 10 km');
    // 11 km/h son 5:27 por km: pasa el de 6:00.
    expect(titles).toContain('Ritmo de 6:00 por km en 5 km o más');
    expect(JSON.stringify(res)).not.toMatch(/NaN|undefined/);
  });
});

describe('análisis en texto de una carrera', () => {
  it('habla de correr y nunca deja una frase vacía (hashes grandes incluidos)', () => {
    const hist = [at(2026, 10, 14), at(2026, 10, 18), at(2026, 10, 22)].map((t, i) => makeRide(t, { id: `h${i}`, distance: 8000, activityType: 'Correr' }));
    for (let n = 0; n < 200; n++) {
      const ride = makeRide(at(2026, 11, 1, 22), { id: `gpx:sintetico_${n}_${'z'.repeat(n % 9)}`, distance: 6010, movingSec: 1980, activityType: 'Correr' });
      const out = rideText({ ride, sport: 'run', history: [...hist, ride], autoPause: true, form: null, hardestClimb: null, zoneSeconds: null, weather: null, victories: [], routeTimes: 1, goalNudge: null, program: null });
      for (const line of out) expect(typeof line === 'string' && line.length > 0).toBe(true);
      expect(out.join(' ')).not.toMatch(/Pedaleaste|undefined/);
    }
  });
});
