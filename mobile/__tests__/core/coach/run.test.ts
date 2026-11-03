import { addDays, mondayOf } from '../../../src/core/coach/dates';
import { CoachEngine, steadyPaceBlocks, toLiveBlocks } from '../../../src/core/coach/live/engine';
import type { CoachEvent, LiveInput } from '../../../src/core/coach/live/engine';
import { correctionCue, spokenPace, spokenTarget } from '../../../src/core/coach/live/cues';
import { lessonFor } from '../../../src/core/coach/lessons';
import { planMicrocycle } from '../../../src/core/coach/micro';
import type { MicroInput } from '../../../src/core/coach/micro';
import { buildMacrocycle } from '../../../src/core/coach/periodization';
import { matchSessions } from '../../../src/core/coach/compliance';
import { riegelTime, runThreshold, thresholdFromEffort } from '../../../src/core/coach/runLevel';
import { blocksMinutes, candidates, RUN_WORKOUTS, TEST_RUN_LABEL, workoutById } from '../../../src/core/coach/workouts';
import { resolveTarget, steadyPaceTarget, zoneOf } from '../../../src/core/coach/zones';
import type { ZoneContext } from '../../../src/core/coach/zones';
import { at } from '../../helpers/ride';

const DAY = 86_400_000;
const start = mondayOf(at(2026, 11, 2));
const full = [45, 45, 45, 45, 45, 60, 90];

const runMacro = (level: 0 | 1 | 2, over: Partial<Parameters<typeof buildMacrocycle>[0]> = {}) =>
  buildMacrocycle({ startT: start, sport: 'run', goal: 'general', level, ...over });

const input = (macro: ReturnType<typeof runMacro>, week: number, over: Partial<MicroInput> = {}): MicroInput => ({
  macro,
  week,
  ctl: 30,
  atl: 30,
  minutesByDay: full,
  offBike: false,
  prevLoadMinutes: null,
  ...over,
});

describe('biblioteca de correr', () => {
  it('todas las sesiones arman bloques válidos en su mínimo, medio y máximo', () => {
    for (const w of RUN_WORKOUTS) {
      expect(w.where).toBe('run');
      for (const m of [w.minMin, Math.round((w.minMin + w.maxMin) / 2), w.maxMin]) {
        const blocks = w.build(m);
        expect(blocks.length).toBeGreaterThan(0);
        for (const b of blocks) {
          expect(b.durationSec).toBeGreaterThan(0);
          expect(Number.isFinite(b.durationSec)).toBe(true);
        }
        // No se pasa del máximo por mucho (las de estructura fija pueden tener unos minutos de más).
        expect(blocksMinutes(blocks)).toBeLessThanOrEqual(w.maxMin + 15);
      }
    }
  });

  it('las de correr no se mezclan con las de bici y "correr y caminar" es solo para principiantes', () => {
    expect(candidates(['endurance'], 0, 60, 'run').every((w) => w.where === 'run')).toBe(true);
    expect(candidates(['endurance'], 0, 60, 'bike').every((w) => w.where === 'bike')).toBe(true);
    expect(candidates(['endurance'], 0, 60, 'run').map((w) => w.id)).toContain('correr-caminar');
    expect(candidates(['endurance'], 1, 60, 'run').map((w) => w.id)).not.toContain('correr-caminar');
  });

  it('el test de 30 minutos tiene su bloque con nombre fijo', () => {
    const test = workoutById('test-30-correr')!;
    const b = test.build(50).find((x) => x.label === TEST_RUN_LABEL);
    expect(b?.durationSec).toBe(1800);
  });
});

describe('umbral de correr con lo que haya', () => {
  it('Riegel y el umbral de una marca', () => {
    expect(riegelTime(10, 3000, 21.097)).toBeCloseTo(6619, -1);
    // 10 km en 50 minutos: unos 11,9 km/h (5:03 por km).
    expect(thresholdFromEffort(10, 3000)).toBeCloseTo(11.88, 1);
    expect(thresholdFromEffort(0, 100)).toBeNull();
  });

  const now = at(2026, 11, 3);
  it('la marca o el test más nuevo gana; si no hay, el mejor del historial', () => {
    const race = { km: 10, sec: 3000, t: now - 30 * DAY };
    const tests = [{ t: now - 5 * DAY, avgKmh: 12.5 }];
    const runs = [{ startT: now - 10 * DAY, efforts: { 5000: 1500, 400: 80 } }];
    expect(runThreshold({ now, race, tests, runs })?.source).toBe('test');
    expect(runThreshold({ now, race, tests: [], runs })?.source).toBe('race');
    const h = runThreshold({ now, race: null, tests: [], runs })!;
    expect(h.source).toBe('history');
    // Los 400 m no se usan (dirían 18 km/h de umbral).
    expect(h.kmh).toBeLessThan(13);
    expect(h.detail).toContain('5 km');
    expect(runThreshold({ now, race: { ...race, t: now - 400 * DAY }, tests: [], runs: [] })).toBeNull();
  });
});

describe('zonas de correr', () => {
  const ctx: ZoneContext = { hr: { hrMax: 190, hrRest: 60, sex: 'male' }, ftp: null, params: null, sport: 'run', thresholdKmh: 12 };

  it('con umbral, el objetivo es un ritmo (km/h con unidad min/km)', () => {
    const t = resolveTarget({ type: 'zone', zone: 2 }, ctx)!;
    expect(t.unit).toBe('min/km');
    expect(t.kind).toBe('speed');
    expect(t.min).toBeCloseTo(9.4, 1);
    expect(t.max).toBeCloseTo(10.6, 1);
  });

  it('sin umbral va por FC y sin FC por esfuerzo percibido', () => {
    expect(resolveTarget({ type: 'zone', zone: 2 }, { ...ctx, thresholdKmh: null })!.kind).toBe('hr');
    expect(resolveTarget({ type: 'ftp', min: 0.97, max: 1.02 }, { ...ctx, thresholdKmh: null, hr: null })!.kind).toBe('rpe');
  });

  it('cadencia con la banda de los ajustes y zona de una fracción del umbral', () => {
    expect(resolveTarget({ type: 'cadence' }, { ...ctx, cadence: { min: 170, max: 180 } })).toEqual({ kind: 'cadence', min: 170, max: 180, unit: 'ppm' });
    expect(zoneOf({ type: 'ftp', min: 0.97, max: 1.02 }, 'run')).toBe(4);
    expect(zoneOf({ type: 'ftp', min: 0.82, max: 0.88 }, 'run')).toBe(2);
  });

  it('el bloque de ritmo se angosta a ±10 s por km', () => {
    const w = workoutById('rodaje-z2')!;
    const live = toLiveBlocks(w.build(40), ctx, 1, 10);
    const work = live.find((b) => b.role === 'work')!.target!;
    const slow = 3600 / work.min;
    const fast = 3600 / work.max;
    expect(slow - fast).toBeCloseTo(20, 0);
  });
});

describe('semana de correr', () => {
  it('sin sesiones de bici y con el test de 30 minutos al empezar un bloque', () => {
    const m = runMacro(1);
    const p = planMicrocycle(input(m, 0))!;
    expect(p.sessions.length).toBeGreaterThan(0);
    expect(p.sessions.every((s) => s.where === 'run')).toBe(true);
    expect(p.sessions.map((s) => s.workoutId)).toContain('test-30-correr');
    expect(JSON.stringify(p)).not.toMatch(/NaN|undefined/);
  });

  it('en el nivel 0 nunca hay dos días seguidos corriendo y las sesiones son cortas', () => {
    const m = runMacro(0);
    for (let w = 0; w < 12; w++) {
      const p = planMicrocycle(input(m, w, { minutesByDay: [60, 60, 60, 60, 60, 90, 120] }));
      if (!p) continue;
      const days = p.sessions.filter((s) => s.where === 'run').map((s) => s.day);
      for (let k = 1; k < days.length; k++) expect(days[k] - days[k - 1]).toBeGreaterThan(1);
      for (const s of p.sessions) if (s.kind !== 'long' && s.kind !== 'event') expect(s.durationMin).toBeLessThanOrEqual(60);
    }
  });

  it('la carrera del evento de 21 km dura algo razonable', () => {
    const m = runMacro(1, { goal: 'event', eventT: addDays(start, 10 * 7 + 6), eventKm: 21.1 });
    const week = m.eventWeek!;
    const p = planMicrocycle(input(m, week))!;
    const ev = p.sessions.find((s) => s.kind === 'event')!;
    expect(ev.where).toBe('run');
    expect(ev.name).toBe('Carrera');
    expect(ev.durationMin).toBeGreaterThanOrEqual(100);
    expect(ev.durationMin).toBeLessThanOrEqual(150);
  });

  it('una sesión de correr se cumple corriendo, no con una salida en bici', () => {
    const s = { date: '2026-11-04', day: 2, workoutId: 'rodaje-z2', name: 'Rodaje', kind: 'endurance' as const, where: 'run' as const, durationMin: 40, targetLoad: 30, preparations: [], zone: 2 };
    const bike = { startT: at(2026, 11, 4), movingSec: 3000, hrHist: null, sport: 'bike' as const };
    const run = { ...bike, sport: 'run' as const };
    expect(matchSessions([s], [bike], [], null, at(2026, 11, 6))[0].status).toBe('missed');
    expect(matchSessions([s], [run], [], null, at(2026, 11, 6))[0].status).toBe('done');
  });

  it('las fichas de correr hablan de correr', () => {
    expect(lessonFor('desarrollador', 1, 'run').title).toBe('Pasos por minuto');
    expect(lessonFor('desarrollador', 1, 'bike').title).toBe('Cadencia');
  });
});

describe('entrenador en vivo corriendo', () => {
  const T0 = 2_000_000;
  function run(engine: CoachEngine, seconds: number, input: (s: number) => LiveInput): { s: number; e: CoachEvent }[] {
    const out: { s: number; e: CoachEvent }[] = [];
    for (let s = 0; s < seconds; s++) for (const e of engine.step(T0 + s * 1000, input(s))) out.push({ s, e });
    return out;
  }

  it('dice el ritmo en voz alta', () => {
    expect(spokenPace(330)).toBe('5 minutos 30');
    expect(spokenPace(300)).toBe('5 minutos');
    const t = steadyPaceTarget(330, 10);
    expect(spokenTarget(t)).toBe('entre 5 minutos 20 y 5 minutos 40 por kilómetro');
    expect(correctionCue('raise', t, 3600 / 370)).toBe('Apurá, vas a 6 minutos 10.');
    expect(correctionCue('lower', t, 3600 / 290)).toBe('Aflojá, vas a 4 minutos 50.');
    expect(correctionCue('raise', { kind: 'cadence', min: 165, max: 185, unit: 'ppm' }, 158)).toBe('Pasos más cortos y rápidos, vas a 158.');
  });

  it('"Apurá" si vas lento y "Bien" al volver al ritmo', () => {
    const e = new CoachEngine(steadyPaceBlocks(330, 10));
    // 6:10 por km (9,7 km/h) contra 5:20 a 5:40.
    const slow = run(e, 40, () => ({ speedKmh: 3600 / 370, hr: null, moving: true }));
    const raise = slow.find((x) => x.e.kind === 'raise');
    expect(raise?.e.text).toContain('Apurá');
    const back = run(e, 30, () => ({ speedKmh: 3600 / 330, hr: null, moving: true }));
    expect(back.map((x) => x.e.kind)).toContain('inRange');
  });

  it('juzga los pasos por minuto en un bloque de técnica', () => {
    const e = new CoachEngine([{ label: 'Aceleración', role: 'work', durationSec: 60, target: { kind: 'cadence', min: 165, max: 185, unit: 'ppm' } }]);
    const r = run(e, 30, () => ({ speedKmh: 12, hr: null, moving: true, cadence: 150 }));
    expect(r.find((x) => x.e.kind === 'raise')?.e.text).toContain('Pasos más cortos');
    expect(e.snapshot().cadence).toBe(150);
  });
});
