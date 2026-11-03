import { addDays, mondayOf } from '../../../src/core/coach/dates';
import { buildMacrocycle, mesoAt, microAt, splitWeeks, weeksToEvent } from '../../../src/core/coach/periodization';
import { at } from '../../helpers/ride';

const start = mondayOf(at(2026, 11, 2));

describe('splitWeeks', () => {
  it('parte en mesociclos de 3 a 6 semanas, de unas 4', () => {
    expect(splitWeeks(0)).toEqual([]);
    expect(splitWeeks(5)).toEqual([5]);
    expect(splitWeeks(8)).toEqual([4, 4]);
    expect(splitWeeks(12)).toEqual([4, 4, 4]);
    expect(splitWeeks(7)).toEqual([4, 3]);
    for (let w = 6; w <= 30; w++) {
      const parts = splitWeeks(w);
      expect(parts.reduce((s, x) => s + x, 0)).toBe(w);
      for (const p of parts) {
        expect(p).toBeGreaterThanOrEqual(3);
        expect(p).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('buildMacrocycle sin evento', () => {
  const m = buildMacrocycle({ startT: start, goal: 'general', level: 1 });

  it('dura un año y los bloques cubren todas las semanas sin huecos', () => {
    expect(m.totalWeeks).toBe(52);
    let next = 0;
    for (const meso of m.mesocycles) {
      expect(meso.startWeek).toBe(next);
      expect(meso.micros).toHaveLength(meso.weeks);
      next += meso.weeks;
    }
    expect(next).toBe(52);
  });

  it('empieza con una semana de ajuste y termina en transición', () => {
    expect(microAt(m, 0)).toBe('ajuste');
    expect(m.mesocycles[m.mesocycles.length - 1].kind).toBe('recuperacion');
  });

  it('cada bloque de 3 semanas o más cierra con recuperación', () => {
    for (const meso of m.mesocycles.filter((x) => x.weeks >= 3)) expect(meso.micros[meso.weeks - 1]).toBe('recuperacion');
  });

  it('nunca hay más de 3 semanas de carga seguidas (3:1) y 2 para principiantes (2:1)', () => {
    const run = (macro: typeof m) => {
      let max = 0;
      let cur = 0;
      for (const meso of macro.mesocycles) {
        for (const k of meso.micros) {
          cur = k === 'carga' || k === 'impacto' ? cur + 1 : 0;
          max = Math.max(max, cur);
        }
      }
      return max;
    };
    expect(run(m)).toBeLessThanOrEqual(3);
    expect(run(buildMacrocycle({ startT: start, goal: 'general', level: 0 }))).toBeLessThanOrEqual(2);
  });

  it('no hay semana del evento', () => {
    expect(m.eventWeek).toBeNull();
    expect(weeksToEvent(m, 5)).toBeNull();
  });
});

describe('buildMacrocycle con evento', () => {
  const event = addDays(start, 20 * 7 + 5); // sábado de la semana 20
  const m = buildMacrocycle({ startT: start, goal: 'event', level: 1, eventT: event, eventKm: 100 });

  it('el evento cae en una semana de competencia, precedida por activación y seguida de transición', () => {
    expect(m.eventWeek).toBe(20);
    expect(microAt(m, 20)).toBe('competencia');
    expect(microAt(m, 19)).toBe('activacion');
    expect(microAt(m, 21)).toBe('recuperacion');
    expect(m.totalWeeks).toBe(22);
  });

  it('con 10 semanas o más de anticipación el afinamiento dura 2 semanas', () => {
    expect(microAt(m, 18)).toBe('activacion');
    expect(mesoAt(m, 17)?.kind).toBe('precompetitivo');
  });

  it('reparte aproximadamente 45 % general y 30 % especial antes del evento', () => {
    const weeks = (period: string) =>
      m.mesocycles.filter((x) => x.period === period && x.kind !== 'competitivo' && x.kind !== 'precompetitivo').reduce((s, x) => s + x.weeks, 0);
    expect(weeks('general')).toBe(9);
    expect(weeks('especial')).toBe(6);
  });

  it('cubre todas las semanas sin huecos', () => {
    let next = 0;
    for (const meso of m.mesocycles) {
      expect(meso.startWeek).toBe(next);
      next += meso.weeks;
    }
    expect(next).toBe(m.totalWeeks);
  });

  it('un evento muy cercano igual arma un macrociclo válido', () => {
    const near = buildMacrocycle({ startT: start, goal: 'event', level: 0, eventT: addDays(start, 2), eventKm: 50 });
    expect(near.eventWeek).toBe(0);
    expect(microAt(near, 0)).toBe('competencia');
    const two = buildMacrocycle({ startT: start, goal: 'event', level: 0, eventT: addDays(start, 9) });
    expect(microAt(two, 1)).toBe('competencia');
  });

  it('un evento en el pasado se trata como sin evento', () => {
    const past = buildMacrocycle({ startT: start, goal: 'event', level: 1, eventT: addDays(start, -10) });
    expect(past.eventWeek).toBeNull();
    expect(past.totalWeeks).toBe(52);
  });
});
