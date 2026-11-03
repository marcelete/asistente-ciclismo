import { useEffect, useMemo, useState } from 'react';
import { BIKE_PRESETS } from '../core/analysis/profileMetrics';
import { bikeOfRide, energyParams } from '../core/bikes/bikes';
import { matchSessions } from '../core/coach/compliance';
import { macroSport } from '../core/coach/micro';
import { runThreshold } from '../core/coach/runLevel';
import type { RunThreshold } from '../core/coach/runLevel';
import { offBikeLoads } from '../core/coach/srpe';
import { createMacro, levelFromRides, thisWeek } from '../core/coach/state';
import type { CoachConfig } from '../core/coach/state';
import { TEST_RUN_LABEL, workoutById } from '../core/coach/workouts';
import { ftpFromTwentyMin } from '../core/coach/zones';
import type { ZoneContext } from '../core/coach/zones';
import { powerCurve, powerSeries } from '../core/predict/powerCurve';
import { isSport, sportOf } from '../core/stats/sport';
import type { TrainSport } from '../core/stats/sport';
import { loadProfile } from '../data/db';
import { loadCoachSessions, loadMacro, loadTestLogs, saveMacro } from '../data/dbCoach';
import { useStore } from '../data/store';
import { useHrProfile, useNow } from './hooks';

const DAY_MS = 86_400_000;

/** Índice del bloque de 30 minutos dentro del test de correr (su promedio da el umbral). */
const TEST_RUN_BLOCK = workoutById('test-30-correr')?.build(50).findIndex((b) => b.label === TEST_RUN_LABEL) ?? -1;

/**
 * Correr: la velocidad de umbral con lo que haya (marca cargada, test de 30 minutos o carreras de los
 * últimos 90 días) y de dónde salió. `null` si todavía no hay nada.
 */
export function useRunThreshold(): RunThreshold | null {
  const { trainingRides, settings, change } = useStore();
  const now = useNow(3_600_000);
  const race = settings.coach.runRace;
  return useMemo(() => {
    const raceT = race ? Date.parse(`${race.date}T12:00:00`) : NaN;
    const tests =
      TEST_RUN_BLOCK >= 0
        ? loadTestLogs('test-30-correr', TEST_RUN_BLOCK, 1500).map((x) => ({ t: Date.parse(`${x.date}T12:00:00`), avgKmh: x.avgValue }))
        : [];
    return runThreshold({
      now,
      race: race && Number.isFinite(raceT) ? { km: race.km, sec: race.sec, t: raceT } : null,
      tests,
      runs: trainingRides.filter(isSport('run')),
    });
    // `change.seq` avisa cuando se guardó una sesión (puede ser un test nuevo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingRides, race, now, change.seq]);
}

/**
 * Lo que se sabe de la persona para convertir los objetivos en números. En bici: FC, bici y FTP
 * estimado (95 % de la mejor potencia estimada de 20 minutos en los últimos 90 días). Corriendo: FC,
 * velocidad de umbral y la banda de pasos por minuto.
 */
export function useZoneContext(sportParam?: TrainSport): ZoneContext {
  const { trainingRides, bikes, settings } = useStore();
  const sport = sportParam ?? settings.sport;
  const hr = useHrProfile();
  const now = useNow(3_600_000);
  const a = settings.athlete;
  const [ftp, setFtp] = useState<number | null>(null);
  const threshold = useRunThreshold();
  const { cadenceMin, cadenceMax } = settings.coach;

  const params = useMemo(() => {
    const def = bikes.find((b) => b.isDefault) ?? null;
    const p = energyParams(a.weightKg, def, { bike: a.bike, bikeKg: a.bikeKg });
    return p ? { massKg: p.massKg, crr: p.crr, cdA: BIKE_PRESETS[p.bike].cdA, drivetrainEff: 0.97, rho: 1.2 } : null;
  }, [a.weightKg, a.bike, a.bikeKg, bikes]);

  useEffect(() => {
    if (a.weightKg === null || sport !== 'bike') return;
    // Recorre perfiles de varias salidas: se hace después de dibujar la pantalla.
    const timer = setTimeout(() => {
      const series: number[][] = [];
      for (const r of trainingRides.filter((x) => sportOf(x) === 'bike' && now - x.startT <= 90 * DAY_MS)) {
        const p = loadProfile(r.id);
        const e = energyParams(a.weightKg, bikeOfRide(r, bikes), { bike: a.bike, bikeKg: a.bikeKg });
        if (!p || !e) continue;
        series.push(powerSeries(p, { massKg: e.massKg, crr: e.crr, cdA: BIKE_PRESETS[e.bike].cdA, drivetrainEff: 0.97 }));
      }
      const twenty = powerCurve(series).find((x) => x.durationSec === 1200);
      setFtp(ftpFromTwentyMin(twenty?.watts ?? null));
    }, 0);
    return () => clearTimeout(timer);
  }, [sport, trainingRides, bikes, a.weightKg, a.bike, a.bikeKg, now]);

  return useMemo(
    () =>
      sport === 'run'
        ? { hr: hr?.profile ?? null, ftp: null, params: null, sport, thresholdKmh: threshold?.kmh ?? null, cadence: { min: cadenceMin, max: cadenceMax } }
        : { hr: hr?.profile ?? null, ftp, params, sport },
    [sport, hr, ftp, params, threshold, cadenceMin, cadenceMax],
  );
}

/**
 * Estado del entrenador para las pantallas: plan guardado, semana en curso y qué se cumplió. El plan es
 * de un deporte (pedido 15): si el guardado no es del deporte elegido, `otherSport` lo dice y la
 * pantalla ofrece rearmarlo. La carga (forma y nivel) suma bici y correr.
 */
export function useCoach() {
  const { trainingRides: rides, settings } = useStore();
  const hr = useHrProfile();
  const now = useNow();
  const [version, setVersion] = useState(0);
  const c = settings.coach;
  const sport = settings.sport;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saved = useMemo(() => loadMacro(), [version]);
  const otherSport = saved !== null && macroSport(saved) !== sport ? macroSport(saved) : null;
  const macro = otherSport ? null : saved;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const done = useMemo(() => loadCoachSessions(), [version, rides]);
  const cfg: CoachConfig = useMemo(
    () => ({ sport, goal: c.goal, eventDate: c.eventDate, eventKm: c.eventKm, minutesByDay: c.minutesByDay, offBike: c.offBike }),
    [sport, c.goal, c.eventDate, c.eventKm, c.minutesByDay, c.offBike],
  );
  const hrProfile = hr?.profile ?? null;
  const extra = useMemo(
    () => offBikeLoads(done.filter((s) => s.status === 'done' && s.rpe !== null && s.minutes !== null).map((s) => ({ date: s.date, rpe: s.rpe as number, minutes: s.minutes as number }))),
    [done],
  );
  const week = useMemo(() => (macro ? thisWeek(macro, cfg, rides, hrProfile, extra, now) : null), [macro, cfg, rides, hrProfile, extra, now]);
  const results = useMemo(() => {
    if (!week) return [];
    const logs = done.filter((s) => s.status === 'done' && s.minutes !== null).map((s) => ({ date: s.date, workoutId: s.workoutId, seconds: (s.minutes as number) * 60 }));
    const withSport = rides.map((r) => ({ ...r, sport: sportOf(r) ?? undefined }));
    return matchSessions(week.micro.sessions, withSport, logs, hrProfile, now);
  }, [week, done, rides, hrProfile, now]);

  const create = () => {
    // El nivel se mide con las salidas del deporte del plan: correr no sale de las horas en bici.
    const own = rides.filter(isSport(sport));
    const level = levelFromRides(own, hrProfile, extra, now);
    saveMacro(createMacro(cfg, level, now), now);
    setVersion((v) => v + 1);
  };
  const reload = () => setVersion((v) => v + 1);
  return { macro, otherSport, sport, cfg, week, results, done, create, reload, rides, hr: hrProfile, extra, now };
}
