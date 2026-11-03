import { CoachEngine, DEFAULT_ENGINE_OPTIONS, steadySpeedBlocks, toLiveBlocks } from '../../../src/core/coach/live/engine';
import type { CoachEvent, LiveBlock, LiveInput } from '../../../src/core/coach/live/engine';
import { RunningStats, TimeWindow, steadinessLabel } from '../../../src/core/coach/live/steadiness';
import { correctionCue, spokenDuration, spokenTarget, startCue } from '../../../src/core/coach/live/cues';
import { WORKOUTS } from '../../../src/core/coach/workouts';

const T0 = 1_000_000;
const speedBlock = (sec: number, min = 28, max = 30): LiveBlock => ({
  label: 'Bloque 1',
  role: 'work',
  durationSec: sec,
  target: { kind: 'speed', min, max, unit: 'km/h' },
});
const calm: LiveInput = { speedKmh: 29, hr: null, moving: true };

/** Corre `seconds` segundos a 1 Hz y junta los avisos con el segundo en que salieron. */
function run(engine: CoachEngine, from: number, seconds: number, input: (s: number) => LiveInput): { s: number; e: CoachEvent }[] {
  const out: { s: number; e: CoachEvent }[] = [];
  for (let s = from; s < from + seconds; s++) for (const e of engine.step(T0 + s * 1000, input(s))) out.push({ s, e });
  return out;
}
const kinds = (r: { e: CoachEvent }[]) => r.map((x) => x.e.kind);

describe('CoachEngine: avisos de velocidad', () => {
  it('avisa el bloque al empezar con la duración y la banda', () => {
    const e = new CoachEngine([speedBlock(120)]);
    const r = run(e, 0, 2, () => calm);
    expect(r[0].e.kind).toBe('start');
    expect(r[0].e.text).toContain('2 minutos');
    expect(r[0].e.text).toContain('entre 28 y 30 kilómetros por hora');
  });

  it('no juzga durante el margen de arranque', () => {
    const e = new CoachEngine([speedBlock(300)]);
    const r = run(e, 0, DEFAULT_ENGINE_OPTIONS.graceSpeedSec - 1, () => ({ speedKmh: 15, hr: null, moving: true }));
    expect(kinds(r)).not.toContain('raise');
    expect(e.snapshot().status).toBe('grace');
  });

  it('dice "Subí" cuando vas lento, sin repetirlo antes del intervalo, y "Bien" al volver a la banda', () => {
    const e = new CoachEngine([speedBlock(600)]);
    const r = run(e, 0, 90, (s) => ({ speedKmh: s < 60 ? 24 : 29, hr: null, moving: true }));
    const raises = r.filter((x) => x.e.kind === 'raise');
    expect(raises.length).toBeGreaterThanOrEqual(2);
    expect(raises[0].e.text).toMatch(/^Subí, vas a 2[3-5]\./);
    for (let i = 1; i < raises.length; i++) expect(raises[i].s - raises[i - 1].s).toBeGreaterThanOrEqual(DEFAULT_ENGINE_OPTIONS.cueEverySec);
    const back = r.filter((x) => x.e.kind === 'inRange');
    expect(back).toHaveLength(1);
    expect(back[0].s).toBeGreaterThan(60);
  });

  it('dice "Bajá" cuando vas rápido', () => {
    const e = new CoachEngine([speedBlock(600)]);
    const r = run(e, 0, 60, () => ({ speedKmh: 34, hr: null, moving: true }));
    expect(r.find((x) => x.e.kind === 'lower')?.e.text).toMatch(/^Bajá, vas a 34/);
    expect(kinds(r)).not.toContain('raise');
  });

  it('un bajón de pocos segundos no dispara aviso (histéresis)', () => {
    const e = new CoachEngine([speedBlock(600)]);
    // 40 s en banda, 3 s de bajón y vuelve.
    const r = run(e, 0, 80, (s) => ({ speedKmh: s >= 40 && s < 43 ? 18 : 29, hr: null, moving: true }));
    expect(kinds(r)).not.toContain('raise');
  });

  it('si no hay datos de velocidad no avisa nada', () => {
    const e = new CoachEngine([speedBlock(600)]);
    const r = run(e, 0, 120, () => ({ speedKmh: null, hr: null, moving: true }));
    expect(kinds(r).filter((k) => k !== 'start' && k !== 'half')).toEqual([]);
  });
});

describe('CoachEngine: tiempo y bloques', () => {
  it('cuenta 3, 2, 1 al final de un bloque y pasa al siguiente', () => {
    const blocks: LiveBlock[] = [
      { label: 'Trabajo', role: 'work', durationSec: 30, target: null },
      { label: 'Pausa', role: 'recovery', durationSec: 30, target: null },
    ];
    const e = new CoachEngine(blocks);
    const r = run(e, 0, 40, () => calm);
    expect(r.filter((x) => x.e.kind === 'count').map((x) => x.e.text)).toEqual(['3', '2', '1']);
    expect(r.filter((x) => x.e.kind === 'start').map((x) => x.e.blockIndex)).toEqual([0, 1]);
    expect(e.snapshot().blockIndex).toBe(1);
  });

  it('avisa la mitad y el último minuto de un bloque largo', () => {
    const e = new CoachEngine([{ label: 'Largo', role: 'work', durationSec: 480, target: null }]);
    const r = run(e, 0, 440, () => calm);
    expect(r.filter((x) => x.e.kind === 'half')).toHaveLength(1);
    expect(r.filter((x) => x.e.kind === 'lastMinute')).toHaveLength(1);
  });

  it('termina una sola vez y después no devuelve más avisos', () => {
    const e = new CoachEngine([{ label: 'Único', role: 'work', durationSec: 10, target: null }]);
    const r = run(e, 0, 15, () => calm);
    expect(kinds(r).filter((k) => k === 'finish')).toHaveLength(1);
    expect(e.snapshot().finished).toBe(true);
    expect(run(e, 15, 5, () => calm)).toEqual([]);
  });

  it('el reloj no avanza detenido (con objetivo de velocidad) ni en pausa', () => {
    const e = new CoachEngine([speedBlock(600)]);
    run(e, 0, 10, () => calm);
    const before = e.snapshot().blockElapsedSec;
    run(e, 10, 20, () => ({ speedKmh: 0, hr: null, moving: false }));
    expect(e.snapshot().blockElapsedSec).toBe(before);
    e.pause();
    run(e, 30, 10, () => calm);
    expect(e.snapshot().blockElapsedSec).toBe(before);
    expect(e.snapshot().paused).toBe(true);
    expect(e.resume()[0].kind).toBe('resume');
    run(e, 40, 5, () => calm);
    expect(e.snapshot().blockElapsedSec).toBeGreaterThan(before);
  });

  it('un salto largo de tiempo (el celular se durmió) no cuenta entero', () => {
    const e = new CoachEngine([speedBlock(600)]);
    e.step(T0, calm);
    e.step(T0 + 120_000, calm);
    expect(e.snapshot().blockElapsedSec).toBeLessThanOrEqual(5);
  });

  it('saltear un bloque pasa al siguiente', () => {
    const e = new CoachEngine([speedBlock(600), { ...speedBlock(60), label: 'Segundo' }]);
    run(e, 0, 5, () => calm);
    expect(e.skip()[0].text).toContain('Segundo');
    expect(e.snapshot().blockIndex).toBe(1);
  });

  it('el recordatorio de agua salta cada tanto', () => {
    const e = new CoachEngine([{ label: 'Largo', role: 'work', durationSec: 3600, target: null }], { ...DEFAULT_ENGINE_OPTIONS, hydrateEverySec: 300 });
    const r = run(e, 0, 700, () => calm);
    expect(r.filter((x) => x.e.kind === 'hydrate').map((x) => x.s)).toEqual([300, 600]);
  });
});

describe('CoachEngine: frecuencia cardíaca y resultados', () => {
  it('con objetivo de FC espera 60 s antes de juzgar', () => {
    const hrBlock: LiveBlock = { label: 'Z2', role: 'work', durationSec: 600, target: { kind: 'hr', min: 130, max: 145, unit: 'lpm' } };
    const e = new CoachEngine([hrBlock]);
    const r = run(e, 0, 100, () => ({ speedKmh: 25, hr: 170, moving: true }));
    const first = r.find((x) => x.e.kind === 'lower')!;
    expect(first.s).toBeGreaterThanOrEqual(60);
    expect(first.e.text).toContain('170 pulsaciones');
  });

  it('mide el tiempo en banda y la variación de cada bloque', () => {
    const e = new CoachEngine([speedBlock(100)]);
    run(e, 0, 120, (s) => ({ speedKmh: s % 2 === 0 ? 28.5 : 29.5, hr: null, moving: true }));
    const [res] = e.blockResults();
    expect(res.block).toBe(0);
    expect(res.inRange).toBeGreaterThan(0.95);
    expect(res.cv).not.toBeNull();
    expect(res.cv as number).toBeLessThan(0.05);
    expect(res.avgValue as number).toBeCloseTo(29, 0);
  });

  it('el modo "mantener velocidad" no termina nunca y corrige', () => {
    const e = new CoachEngine(steadySpeedBlocks(28, 1));
    const r = run(e, 0, 3600, (s) => ({ speedKmh: s < 1800 ? 29 : 24, hr: null, moving: true }));
    expect(e.snapshot().finished).toBe(false);
    expect(kinds(r)).toContain('raise');
    expect(kinds(r)).not.toContain('finish');
  });
});

describe('bloques y frases', () => {
  const ctx = { hr: { hrMax: 190, hrRest: 60, sex: 'male' as const }, ftp: null, params: null };

  it('angosta las bandas anchas de velocidad a ±tolerancia y deja las demás', () => {
    const steady = WORKOUTS.find((w) => w.id === 'ritmo-constante')!;
    const withFtp = { ...ctx, ftp: 220, params: { massKg: 85, crr: 0.0055, cdA: 0.36, drivetrainEff: 0.97, rho: 1.2 } };
    const work = toLiveBlocks(steady.build(60), withFtp, 1).find((b) => b.role === 'work')!;
    expect(work.target?.kind).toBe('speed');
    expect((work.target!.max - work.target!.min) / 2).toBeLessThanOrEqual(1.01);
    const warm = toLiveBlocks(steady.build(60), withFtp, 1).find((b) => b.role === 'warmup')!;
    expect(warm.target).not.toBeNull();
  });

  it('todas las sesiones de la biblioteca se convierten en bloques sin NaN', () => {
    for (const w of WORKOUTS) {
      const blocks = toLiveBlocks(w.build(Math.round((w.minMin + w.maxMin) / 2)), ctx, 1);
      expect(JSON.stringify(blocks)).not.toMatch(/NaN|undefined/);
      expect(() => new CoachEngine(blocks)).not.toThrow();
    }
  });

  it('las frases salen en español natural', () => {
    expect(spokenDuration(30)).toBe('30 segundos');
    expect(spokenDuration(480)).toBe('8 minutos');
    expect(spokenDuration(60)).toBe('60 segundos');
    expect(spokenDuration(5400)).toBe('1 hora 30 minutos');
    expect(spokenTarget({ kind: 'speed', min: 28.5, max: 30, unit: 'km/h' })).toBe('entre 28,5 y 30 kilómetros por hora');
    expect(spokenTarget({ kind: 'rpe', min: 3, max: 4, unit: '/10' })).toBe('esfuerzo de 3 a 4 sobre 10');
    expect(correctionCue('raise', { kind: 'speed', min: 28, max: 30, unit: 'km/h' }, 26.4)).toBe('Subí, vas a 26.');
    expect(startCue('Bloque 3', 240, null, 'Parejo.', 2, 3)).toBe('Bloque 3. 4 minutos. Último bloque. Parejo.');
  });
});

describe('estabilidad', () => {
  it('media, variación y ventana por tiempo', () => {
    const s = new RunningStats();
    [10, 10, 10].forEach((x) => s.add(x));
    expect(s.average).toBe(10);
    expect(s.cv).toBe(0);
    const w = new TimeWindow(10);
    w.add(0, 100);
    w.add(20_000, 10);
    expect(w.average).toBe(10);
    const m = new TimeWindow(10);
    [29, 29, 29, 5, 29].forEach((v, i) => m.add(i * 1000, v));
    expect(m.median).toBe(29);
    expect(m.average).toBeLessThan(25);
  });
  it('califica el ritmo', () => {
    expect(steadinessLabel(0.95, 0.03)).toBe('Muy parejo');
    expect(steadinessLabel(0.7, 0.1)).toBe('Parejo');
    expect(steadinessLabel(0.2, 0.2)).toBe('Irregular');
    expect(steadinessLabel(null, null)).toBe('Sin datos');
  });
});
