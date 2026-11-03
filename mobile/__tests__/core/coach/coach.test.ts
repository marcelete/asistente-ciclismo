import { reviewWeek } from '../../../src/core/coach/adapt';
import { matchSessions, weekCompliance } from '../../../src/core/coach/compliance';
import type { SessionStatus } from '../../../src/core/coach/compliance';
import { lessonFor } from '../../../src/core/coach/lessons';
import { assessLevel, capVolume, continuity, projectCtl } from '../../../src/core/coach/progression';
import { readiness } from '../../../src/core/coach/readiness';
import { auToTss, offBikeLoads, sessionAu } from '../../../src/core/coach/srpe';
import type { CoachSession } from '../../../src/core/coach/types';
import { WORKOUTS, blocksMinutes } from '../../../src/core/coach/workouts';
import { ftpFromTwentyMin, resolveTarget, steadyTarget } from '../../../src/core/coach/zones';
import { DEFAULT_POWER_PARAMS } from '../../../src/core/power/model';
import { at } from '../../helpers/ride';

describe('progresión y continuidad', () => {
  it('el nivel sale de CTL y horas', () => {
    expect(assessLevel(10, 1)).toBe(0);
    expect(assessLevel(35, 2)).toBe(1);
    expect(assessLevel(20, 9)).toBe(2);
  });
  it('recorta el volumen al 10 %', () => {
    expect(capVolume(300, 400)).toEqual({ minutes: 330, capped: true });
    expect(capVolume(300, 320)).toEqual({ minutes: 320, capped: false });
    expect(capVolume(null, 999).capped).toBe(false);
  });
  it('proyecta el CTL hacia la carga diaria', () => {
    expect(projectCtl(40, 7 * 40)).toBeCloseTo(40, 5);
    expect(projectCtl(40, 7 * 60)).toBeGreaterThan(40);
    expect(projectCtl(40, 0)).toBeLessThan(40);
  });
  it('continuidad según los días de parate', () => {
    expect(continuity(3).action).toBe('seguir');
    expect(continuity(7).action).toBe('ajuste');
    expect(continuity(13).action).toBe('ajuste');
    expect(continuity(14).action).toBe('retroceder');
    expect(continuity(27).action).toBe('retroceder');
    expect(continuity(28).action).toBe('reiniciar');
  });
});

describe('carga por esfuerzo percibido', () => {
  it('RPE por minutos, y una hora en el umbral vale unos 100', () => {
    expect(sessionAu(6, 30)).toBe(180);
    expect(auToTss(sessionAu(7, 60))).toBeCloseTo(100, 5);
    expect(offBikeLoads([{ date: '2026-11-02', rpe: 6, minutes: 30 }])).toEqual([{ date: '2026-11-02', load: 42.9 }]);
  });
});

describe('check-in', () => {
  it('decide hacer, aflojar o descansar', () => {
    expect(readiness({ sleep: 4, mood: 4, fatigue: 2 }).mode).toBe('ok');
    expect(readiness({ sleep: 3, mood: 3, fatigue: 4 }).mode).toBe('easy');
    expect(readiness({ sleep: 1, mood: 2, fatigue: 5 }).mode).toBe('rest');
  });
});

describe('zonas y objetivos', () => {
  const hr = { hrMax: 190, hrRest: 60, sex: 'male' as const };
  const params = { massKg: 85, ...DEFAULT_POWER_PARAMS };

  it('FTP ≈ 95 % de los 20 minutos', () => {
    expect(ftpFromTwentyMin(200)).toBe(190);
    expect(ftpFromTwentyMin(null)).toBeNull();
  });
  it('con FTP y bici da velocidad en llano, y más FTP da más velocidad', () => {
    const t = resolveTarget({ type: 'ftp', min: 0.7, max: 0.8 }, { hr, ftp: 200, params })!;
    expect(t.kind).toBe('speed');
    expect(t.max).toBeGreaterThan(t.min);
    const stronger = resolveTarget({ type: 'ftp', min: 0.7, max: 0.8 }, { hr, ftp: 260, params })!;
    expect(stronger.min).toBeGreaterThan(t.min);
  });
  it('sin FTP usa la FC, y sin nada el esfuerzo percibido', () => {
    expect(resolveTarget({ type: 'zone', zone: 2 }, { hr, ftp: null, params: null })).toMatchObject({ kind: 'hr' });
    expect(resolveTarget({ type: 'zone', zone: 2 }, { hr: null, ftp: null, params: null })).toMatchObject({ kind: 'rpe' });
    expect(resolveTarget({ type: 'free' }, { hr, ftp: null, params: null })).toBeNull();
  });
  it('mantener velocidad: la banda es ±1 km/h por defecto', () => {
    expect(steadyTarget(28)).toEqual({ kind: 'speed', min: 27, max: 29, unit: 'km/h' });
    expect(steadyTarget(0.5).min).toBe(0);
  });
});

describe('biblioteca de sesiones', () => {
  it('cada una arma bloques válidos para su rango de duración', () => {
    for (const w of WORKOUTS) {
      for (const m of [w.minMin, Math.round((w.minMin + w.maxMin) / 2), w.maxMin]) {
        const blocks = w.build(m);
        expect(blocks.length).toBeGreaterThan(0);
        for (const b of blocks) {
          expect(b.durationSec).toBeGreaterThan(0);
          expect(Number.isFinite(b.durationSec)).toBe(true);
        }
        // La duración armada se mantiene cerca de la pedida (las repeticiones son enteras).
        expect(Math.abs(blocksMinutes(blocks) - m)).toBeLessThanOrEqual(Math.max(25, m * 0.35));
      }
    }
  });
  it('los ids son únicos y hay fuerza, core y movilidad fuera de la bici', () => {
    expect(new Set(WORKOUTS.map((w) => w.id)).size).toBe(WORKOUTS.length);
    expect(WORKOUTS.filter((w) => w.where === 'off').map((w) => w.kind).sort()).toEqual(['core', 'mobility', 'strength']);
  });
  it('hay una ficha teórica para cada semana de un bloque', () => {
    expect(lessonFor('desarrollador', 5).title.length).toBeGreaterThan(0);
  });
});

describe('cumplimiento y revisión semanal', () => {
  const now = at(2026, 11, 20);
  const mk = (date: string, over: Partial<CoachSession> = {}): CoachSession => ({
    date,
    day: 0,
    workoutId: 'fondo-z2',
    name: 'Fondo',
    kind: 'endurance',
    where: 'bike',
    durationMin: 60,
    targetLoad: 50,
    preparations: ['fisica'],
    zone: 2,
    ...over,
  });

  it('marca hecha, parcial, no hecha y pendiente', () => {
    const sessions = [mk('2026-11-16'), mk('2026-11-17'), mk('2026-11-18'), mk('2026-11-25')];
    const rides = [
      { startT: at(2026, 11, 16), movingSec: 3600, hrHist: null },
      { startT: at(2026, 11, 17), movingSec: 1800, hrHist: null },
    ];
    expect(matchSessions(sessions, rides, [], null, now).map((x) => x.status)).toEqual(['done', 'partial', 'missed', 'pending']);
  });
  it('una sesión guiada cuenta aunque no haya FC ni salida', () => {
    const s = mk('2026-11-16', { where: 'off', workoutId: 'movilidad', kind: 'mobility', durationMin: 20, zone: 0 });
    const r = matchSessions([s], [], [{ date: '2026-11-16', workoutId: 'movilidad', seconds: 1200 }], null, now);
    expect(r[0].status).toBe('done');
  });
  it('el cumplimiento pondera por carga y no cuenta lo pendiente', () => {
    const a = mk('2026-11-16', { targetLoad: 100 });
    const b = mk('2026-11-17', { targetLoad: 100 });
    const c = mk('2026-11-25', { targetLoad: 100 });
    const res = [
      { session: a, status: 'done' as SessionStatus },
      { session: b, status: 'missed' as SessionStatus },
      { session: c, status: 'pending' as SessionStatus },
    ];
    expect(weekCompliance(res)).toBeCloseTo(0.5, 5);
  });
  it('revisa la semana: recupera, alivia, repite o avanza', () => {
    const one = (s: SessionStatus) => [{ session: mk('2026-11-16'), status: s }];
    expect(reviewWeek(one('done'), -40).action).toBe('recuperar');
    expect(reviewWeek(one('missed'), 0).action).toBe('aliviar');
    expect(reviewWeek(one('partial'), 0).action).toBe('repetir');
    expect(reviewWeek([...one('done'), ...one('partial')], 0).action).toBe('repetir');
    const ok = reviewWeek(one('done'), 5);
    expect(ok.action).toBe('avanzar');
    expect(ok.loadFactor).toBe(1);
    expect(ok.why.join(' ')).not.toMatch(/NaN/);
  });
});
