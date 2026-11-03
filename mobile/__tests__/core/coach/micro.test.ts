import { addDays, mondayOf } from '../../../src/core/coach/dates';
import { planMicrocycle } from '../../../src/core/coach/micro';
import type { MicroInput } from '../../../src/core/coach/micro';
import { buildMacrocycle } from '../../../src/core/coach/periodization';
import { at } from '../../helpers/ride';

const start = mondayOf(at(2026, 11, 2));
const minutes = [0, 60, 0, 60, 0, 90, 150];
const full = [60, 60, 60, 60, 60, 90, 120];
const macro = buildMacrocycle({ startT: start, goal: 'general', level: 1 });

const input = (week: number, over: Partial<MicroInput> = {}, m = macro): MicroInput => ({
  macro: m,
  week,
  ctl: 40,
  atl: 40,
  minutesByDay: minutes,
  offBike: false,
  prevLoadMinutes: null,
  ...over,
});

/** Una semana de carga que no sea la primera de su bloque. */
function loadWeek(): number {
  for (const m of macro.mesocycles) {
    const i = m.micros.findIndex((k, n) => k === 'carga' && n > 0);
    if (i > 0) return m.startWeek + i;
  }
  return 1;
}

describe('planMicrocycle', () => {
  it('devuelve null fuera del macrociclo', () => {
    expect(planMicrocycle(input(80))).toBeNull();
  });

  it('sin días disponibles no hay sesiones y explica por qué', () => {
    const p = planMicrocycle(input(1, { minutesByDay: [0, 0, 0, 10, 0, 0, 0] }));
    expect(p?.sessions).toHaveLength(0);
    expect(p?.why[0]).toMatch(/días/);
  });

  it('respeta el tiempo disponible de cada día y no pone sesiones en días sin tiempo', () => {
    const p = planMicrocycle(input(1));
    expect(p).not.toBeNull();
    expect(p!.sessions.length).toBeGreaterThan(0);
    for (const s of p!.sessions) {
      expect(minutes[s.day]).toBeGreaterThanOrEqual(20);
      expect(s.durationMin).toBeLessThanOrEqual(minutes[s.day] + 5);
    }
  });

  it('la semana de recuperación tiene menos carga que la de carga', () => {
    const meso = macro.mesocycles[1];
    const weeks = meso.micros.map((_, i) => planMicrocycle(input(meso.startWeek + i, { minutesByDay: full }))!);
    const load = weeks.filter((w) => w.kind === 'carga' || w.kind === 'impacto').map((w) => w.targetLoad);
    const rec = weeks.find((w) => w.kind === 'recuperacion')!;
    expect(load.length).toBeGreaterThan(0);
    expect(rec.targetLoad).toBeLessThan(Math.max(...load));
  });

  it('cambia la carga por recuperación cuando la fatiga es muy alta, y lo explica', () => {
    const w = loadWeek();
    const tired = planMicrocycle(input(w, { ctl: 40, atl: 80, minutesByDay: full }))!;
    const fresh = planMicrocycle(input(w, { minutesByDay: full }))!;
    expect(tired.targetLoad).toBeLessThan(fresh.targetLoad);
    expect(tired.why.join(' ')).toMatch(/recuperación/);
  });

  it('limita el volumen al 10 % sobre la semana de carga anterior', () => {
    const w = loadWeek();
    const free = planMicrocycle(input(w, { minutesByDay: full }))!;
    const total = (p: typeof free) => p.sessions.reduce((s, x) => s + x.durationMin, 0);
    const capped = planMicrocycle(input(w, { minutesByDay: full, prevLoadMinutes: Math.round(total(free) / 2) }))!;
    expect(total(capped)).toBeLessThan(total(free));
    expect(capped.why.join(' ')).toMatch(/10 %/);
  });

  it('al empezar un bloque de carga hay un test de 20 minutos', () => {
    const meso = macro.mesocycles.find((m) => m.index > 0 && m.micros[0] === 'carga')!;
    expect(meso).toBeDefined();
    const p = planMicrocycle(input(meso.startWeek, { minutesByDay: full }))!;
    expect(p.sessions.some((s) => s.workoutId === 'test-20')).toBe(true);
  });

  it('nunca pone dos días duros seguidos', () => {
    const hard = new Set(['tempo', 'steady', 'threshold', 'vo2', 'climb', 'sprint', 'test']);
    for (let w = 0; w < 24; w++) {
      const p = planMicrocycle(input(w, { minutesByDay: full }))!;
      const days = p.sessions.filter((s) => hard.has(s.kind)).map((s) => s.day).sort((a, b) => a - b);
      for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThan(1);
    }
  });

  it('agrega fuerza, core o movilidad en días sin salida', () => {
    const p = planMicrocycle(input(loadWeek(), { offBike: true, minutesByDay: full }))!;
    const off = p.sessions.filter((s) => s.where === 'off');
    expect(off.length).toBeGreaterThan(0);
    const bikeDays = new Set(p.sessions.filter((s) => s.where === 'bike').map((s) => s.day));
    for (const s of off) {
      expect(bikeDays.has(s.day)).toBe(false);
      expect(s.zone).toBe(0);
    }
  });

  it('la semana del evento tiene el evento en su día y nada cerca', () => {
    const eventT = addDays(start, 8 * 7 + 5); // sábado
    const m = buildMacrocycle({ startT: start, goal: 'event', level: 1, eventT, eventKm: 110 });
    const p = planMicrocycle(input(8, { minutesByDay: full }, m))!;
    expect(p.kind).toBe('competencia');
    const ev = p.sessions.find((s) => s.kind === 'event')!;
    expect(ev.day).toBe(5);
    expect(ev.durationMin).toBe(300);
    expect(p.sessions.filter((s) => s.day >= 4 && s.kind !== 'event')).toHaveLength(0);
  });

  it('el JSON de todas las semanas no tiene NaN ni undefined', () => {
    for (let w = 0; w < 52; w++) {
      const p = planMicrocycle(input(w, { offBike: true, minutesByDay: full }))!;
      expect(JSON.stringify(p)).not.toMatch(/NaN|undefined/);
    }
  });
});
