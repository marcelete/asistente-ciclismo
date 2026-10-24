import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { partStatus, totalsByBike } from '../core/bikes/bikes';
import type { Bike, BikePart } from '../core/bikes/bikes';
import { demAltitudes, elevationStats } from '../core/elevation/profile';
import { newlyCompleted } from '../core/goals/goals';
import type { Goal } from '../core/goals/goals';
import { countsAsRide } from '../core/stats/sport';
import type { RideRecord } from '../core/stats/rides';
import { importSources, needsReanalysis, reanalyzeRides } from '../import/sync';
import type { GpxSource } from '../import/sync';
import { fetchDemProfile } from '../services/elevation';
import { autoBackupIfDue, cleanExportCache } from '../services/exporter';
import { indexMissingGeo } from '../services/geoIndex';
import { cleanTileCache } from '../services/tiles';
import { refreshWeather } from '../services/weather';
import { log, logError } from '../services/log';
import { formatUntil } from '../services/openMeteo';
import { cancelAllReminders, notifyGoalsCompleted, notifyPartsDue, rescheduleReminders } from '../services/notifications';
import {
  deleteAllData,
  deleteGoal,
  deleteProfile,
  loadGoals,
  loadProfile,
  loadRides,
  loadSetting,
  profileIds,
  profilesPendingDem,
  saveGoal,
  saveNewRide,
  saveProfile,
  saveReanalysis,
  saveRideDem,
  saveSetting,
} from './db';
import { assignAllRidesToBike, deleteBike, deletePart, loadBikes, loadParts, saveBike, savePart, setCountedOverride, setRideBike } from './dbBikes';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';
import type { Settings } from './settings';

export type { Settings } from './settings';

/** Resultado de la última lectura de la carpeta, para mostrarlo en Salidas. */
export interface SyncStatus {
  at: number;
  message: string;
  ok: boolean;
}

/** Aviso de que cambiaron salidas: lo usan logros, mapas y segmentos para recalcular. */
export interface RideChange {
  seq: number;
  rideIds: string[];
}

interface Store {
  /** Solo las salidas que cuentan como salidas en bici: con esto se calculan totales, rachas, metas y récords. */
  rides: RideRecord[];
  /** Todas las salidas importadas, también las que no cuentan (caminatas, por ejemplo). */
  allRides: RideRecord[];
  bikes: Bike[];
  bikeParts: BikePart[];
  /** Crea o cambia una bici. */
  saveBike: (b: Bike) => Promise<void>;
  removeBike: (id: string) => Promise<void>;
  savePart: (p: BikePart) => Promise<void>;
  removePart: (id: string) => Promise<void>;
  /** Cambia la bici de una salida (null: la que esté por defecto). */
  setRideBike: (rideId: string, bikeId: string | null) => Promise<void>;
  /** Fuerza que la salida cuente (true) o no cuente (false) como salida en bici; null deja decidir al tipo. */
  setRideCounted: (rideId: string, value: boolean | null) => Promise<void>;
  goals: Goal[];
  settings: Settings;
  /** Lee la carpeta de OpenTracks y guarda las salidas nuevas. Devuelve un texto de estado. */
  syncFolder: (pick: boolean) => Promise<string>;
  /** Se está leyendo la carpeta; `progress` cuenta los archivos procesados en la etapa actual. */
  syncing: boolean;
  progress: SyncProgress | null;
  lastSync: SyncStatus | null;
  /** Salidas que todavía esperan la altitud del mapa (por ejemplo, porque no había internet). */
  pendingDem: number;
  /** Consulta la altitud del mapa de las salidas pendientes. Devuelve un texto de estado. */
  refreshElevation: () => Promise<string>;
  /** Crea una meta, o cambia el objetivo de la que ya existe para el mismo período y métrica. */
  addGoal: (g: Omit<Goal, 'id'>) => Promise<void>;
  removeGoal: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /**
   * Borra todos los datos de la app y cancela los recordatorios. Devuelve false, sin borrar nada,
   * si en ese momento se está leyendo la carpeta, consultando la altitud o restaurando un respaldo.
   */
  wipeAll: () => Promise<boolean>;
  /** Terminó la primera lectura de la carpeta y el recálculo de la apertura (la intro puede irse). */
  startupDone: boolean;
  /** Última tanda de salidas que cambiaron (importadas, recalculadas o restauradas). */
  change: RideChange;
  /** Ids de las salidas importadas desde que se abrió la app. */
  sessionAdded: ReadonlySet<string>;
  /**
   * Corre `fn` si no hay otra tarea con el mismo nombre en curso; si la hay devuelve null.
   * Es la única forma de que leer, consultar la altitud, restaurar y borrar no se pisen.
   */
  runExclusive: <T>(name: string, fn: () => Promise<T>) => Promise<T | null>;
  /** Recarga salidas, metas y ajustes desde la base (después de restaurar un respaldo). */
  reloadAll: (changedRideIds?: string[]) => void;
}

export interface SyncProgress {
  done: number;
  total: number;
  /** "import": archivos nuevos; "reanalyze": salidas guardadas que se recalculan. */
  stage: 'import' | 'reanalyze';
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}

/** Un GPX de la carpeta elegida, que se lee recién cuando hace falta. */
function sourceOf(f: File): GpxSource {
  return { name: f.name, size: f.size, read: () => f.text() };
}

function gpxFiles(dir: Directory): File[] {
  return dir.list().filter((e): e is File => e instanceof File && e.name.toLowerCase().endsWith('.gpx'));
}

/** El selector de carpetas de Android avisa con una excepción cuando lo cerrás sin elegir. */
function isPickerCancel(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === 'ERR_PICKER_CANCELLED' || (e instanceof Error && /cancel/i.test(e.message));
}

/** Al volver a la app se busca de nuevo, pero no más de una vez por minuto. */
const RESYNC_MIN_MS = 60_000;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [allRides, setAllRides] = useState<RideRecord[]>(() => loadRides());
  const [bikes, setBikes] = useState<Bike[]>(() => loadBikes());
  const [bikeParts, setBikeParts] = useState<BikePart[]>(() => loadParts());
  const rides = useMemo(() => allRides.filter(countsAsRide), [allRides]);
  const [goals, setGoals] = useState<Goal[]>(() => loadGoals());
  const [settings, setSettings] = useState<Settings>(() => sanitizeSettings(loadSetting<unknown>('settings', {})));
  const [pendingDem, setPendingDem] = useState(() => profilesPendingDem().length);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<Store['progress']>(null);
  const [lastSync, setLastSync] = useState<SyncStatus | null>(null);
  const [startupDone, setStartupDone] = useState(false);
  const [change, setChange] = useState<RideChange>({ seq: 0, rideIds: [] });
  const [sessionAdded, setSessionAdded] = useState<ReadonlySet<string>>(() => new Set());
  const running = useRef(new Set<string>());
  const lastSyncAt = useRef(0);

  const runExclusive = useCallback(async <T,>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    if (running.current.has(name)) return null;
    running.current.add(name);
    try {
      return await fn();
    } finally {
      running.current.delete(name);
    }
  }, []);

  /** Recarga las salidas de la base y avisa cuáles cambiaron. */
  const reloadRides = useCallback((ids: string[]) => {
    setAllRides(loadRides());
    if (ids.length > 0) setChange((c) => ({ seq: c.seq + 1, rideIds: ids }));
  }, []);
  // Las acciones leen siempre el estado más nuevo sin tener que recrearse.
  const latest = useRef({ rides, allRides, goals, settings });
  useLayoutEffect(() => {
    latest.current = { rides, allRides, goals, settings };
  }, [rides, allRides, goals, settings]);

  // Los recordatorios dependen del historial, las metas y su configuración; nada más.
  const { reminders, autoPause } = settings;
  useEffect(() => {
    rescheduleReminders(rides, goals, reminders, autoPause).catch(
      logError('notif', 'No se pudieron programar los recordatorios'),
    );
  }, [rides, goals, reminders, autoPause]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...latest.current.settings, ...patch };
    // Se actualiza ya mismo: dos cambios seguidos, antes de que la pantalla se redibuje, no se pisan.
    latest.current = { ...latest.current, settings: next };
    setSettings(next);
    await saveSetting('settings', next);
  }, []);

  const refreshElevation = useCallback(async () => {
    const enabled = () => latest.current.settings.demOnline;
    if (!enabled()) return 'La consulta de altitud del mapa está apagada en Ajustes → Privacidad.';
    let done = 0;
    let error: string | null = null;
    let waitUntil: number | null = null;
    const ran = await runExclusive('dem', async () => {
      try {
        // Las más nuevas primero (la lista llega ordenada); las viejas se completan con el tiempo.
        for (const id of profilesPendingDem()) {
          if (!enabled()) break;
          const points = loadProfile(id);
          if (!points || points.length === 0) {
            // Perfil dañado: se borra para que se rearme releyendo el GPX en la próxima lectura.
            await deleteProfile(id);
            log('warn', 'dem', 'Perfil dañado: se rearma desde el GPX');
            continue;
          }
          const res = await fetchDemProfile(points, () => !enabled());
          if (res.complete) {
            // Queda hecha aunque falten puntos (sin altitud del GPS en la zona privada), para no reintentar siempre.
            await saveProfile(id, res.points, true);
            const alts = demAltitudes(res.points);
            const stats = alts ? elevationStats(alts) : null;
            if (stats) await saveRideDem(id, stats);
            done++;
            reloadRides([id]);
            continue;
          }
          // Se guarda lo que alcanzó a traer: al retomar solo se piden los puntos que faltan.
          await saveProfile(id, res.points, false);
          if (res.cancelled) break;
          waitUntil = res.waitUntil;
          error = res.error;
          if (error) log('warn', 'dem', `Falló la consulta de altitud del mapa — ${error}`);
          break;
        }
      } finally {
        setPendingDem(profilesPendingDem().length);
      }
    });
    if (ran === null) return 'Ya se está consultando la altitud.';
    if (done > 0) log('info', 'dem', `Altitud del mapa completada en ${done} salida(s)`);
    const left = profilesPendingDem().length;
    if (waitUntil !== null) return `Altitud del mapa: faltan ${left} salida(s), sigue a las ${formatUntil(waitUntil)}.`;
    if (error) return `No se pudo consultar la altitud del mapa (${error}). Se reintenta más tarde.`;
    if (!enabled()) return 'Se cortó la consulta: la apagaste en Ajustes.';
    return done === 0 ? 'No hay salidas esperando la altitud del mapa.' : `Altitud del mapa lista en ${done} salida(s).`;
  }, [runExclusive, reloadRides]);

  const syncFolder = useCallback(
    async (pick: boolean) => {
      if (running.current.has('sync')) return 'Ya se está leyendo la carpeta.';
      running.current.add('sync');
      setSyncing(true);
      const finish = (message: string, ok: boolean) => {
        setLastSync({ at: Date.now(), message, ok });
        return message;
      };
      try {
        const { allRides: before, goals: gs, settings: st } = latest.current;
        let dir: Directory;
        if (pick || !st.folderUri) {
          try {
            dir = await Directory.pickDirectoryAsync(st.folderUri ?? undefined);
          } catch (e) {
            if (isPickerCancel(e)) return 'No elegiste ninguna carpeta.';
            throw e;
          }
          if (dir.uri !== st.folderUri) await updateSettings({ folderUri: dir.uri });
        } else {
          dir = new Directory(st.folderUri);
        }
        lastSyncAt.current = Date.now();
        const files = gpxFiles(dir);

        // Solo se leen los archivos que todavía no están en el historial, de a uno.
        const known = new Set(before.map((r) => r.fileName));
        const fresh = files.filter((f) => !known.has(f.name)).map(sourceOf);
        const result = await importSources(fresh, {
          saveNew: saveNewRide,
          onProgress: (done, total) => setProgress({ done, total, stage: 'import' }),
          onError: (what, e) => log('warn', 'import', what, e),
        });
        setProgress(null);

        // Las salidas guardadas con una versión anterior se recalculan releyendo su GPX (suman FC,
        // mejores tiempos y el tiempo de cada punto del perfil).
        const withProfile = profileIds();
        const stale = loadRides().filter((r) => needsReanalysis(r, withProfile.has(r.id)));
        let reanalyzed = 0;
        if (stale.length > 0) {
          reanalyzed = await reanalyzeRides(stale, new Map(files.map((f) => [f.name, sourceOf(f)] as const)), {
            loadProfile,
            saveReanalysis,
            onProgress: (done, total) => setProgress({ done, total, stage: 'reanalyze' }),
            onError: (what, e) => log('warn', 'import', what, e),
          });
          setProgress(null);
          if (reanalyzed > 0) log('info', 'import', `Se recalcularon ${reanalyzed} salida(s) guardadas con una versión anterior`);
        }

        const { added, failed } = result;
        log('info', 'import', `Lectura: ${fresh.length} archivo(s) nuevo(s), ${added.length} salida(s) agregada(s), ${failed} con error`);
        if (added.length > 0 || reanalyzed > 0) {
          const ids = [...added.map((a) => a.id), ...stale.map((r) => r.id)];
          reloadRides(ids);
          if (added.length > 0) {
            setSessionAdded((prev) => new Set([...prev, ...added.map((a) => a.id)]));
            // Copia automática a la carpeta elegida (como mucho una vez por hora).
            autoBackupIfDue({
              rides: loadRides(),
              goals: gs,
              settings: latest.current.settings,
              appVersion: Constants.expoConfig?.version ?? '',
            }).catch(logError('export', 'Falló la copia automática'));
          }
        }
        setPendingDem(profilesPendingDem().length);
        refreshElevation().catch(logError('dem', 'Falló la consulta de altitud'));

        const failedNote = failed > 0 ? ` ${failed} archivo(s) no se pudieron leer (detalle en Ajustes → Registro).` : '';
        if (added.length === 0) return finish(`No hay salidas nuevas.${failedNote}`, failed === 0);
        const after = loadRides().filter(countsAsRide);
        // El "antes" es lo de ahora sin las salidas recién agregadas: si no, recalcular salidas viejas
        // podría anunciar una meta que la salida nueva no cumplió.
        const addedIds = new Set(added.map((a) => a.id));
        const completed = newlyCompleted(
          gs,
          after.filter((r) => !addedIds.has(r.id)),
          after,
          Date.now(),
          st.autoPause,
        );
        // Componentes de la bici que pasaron el aviso de km con las salidas nuevas.
        const bikesNow = loadBikes();
        const partsNow = loadParts();
        if (partsNow.some((p) => p.alertKm !== null)) {
          const wasDue = new Set(
            partStatus(partsNow, totalsByBike(after.filter((r) => !addedIds.has(r.id)), bikesNow))
              .filter((x) => x.due)
              .map((x) => x.part.id),
          );
          const newlyDue = partStatus(partsNow, totalsByBike(after, bikesNow)).filter((x) => x.due && !wasDue.has(x.part.id));
          await notifyPartsDue(
            newlyDue.map((x) => ({ name: x.part.name, bike: bikesNow.find((b) => b.id === x.part.bikeId)?.name ?? '', km: x.km })),
          ).catch(logError('notif', 'No se pudo avisar el componente'));
        }
        // Si el festejo se va a ver en la app, no se manda además la notificación (sonarían dos cosas).
        const celebratingInApp = AppState.currentState === 'active' && st.celebrations;
        if (completed.length > 0 && !celebratingInApp) {
          await notifyGoalsCompleted(completed).catch(logError('notif', 'No se pudo avisar la meta cumplida'));
        }
        const n = added.length;
        return finish((n === 1 ? 'Se importó 1 salida nueva.' : `Se importaron ${n} salidas nuevas.`) + failedNote, true);
      } catch (e) {
        // El detalle técnico (con la URI de la carpeta) queda solo en el registro, ya redactado.
        log('error', 'import', 'No se pudo leer la carpeta', e);
        return finish('No se pudo leer la carpeta. Si la moviste o la borraste, elegila de nuevo.', false);
      } finally {
        running.current.delete('sync');
        setSyncing(false);
        setProgress(null);
      }
    },
    [updateSettings, refreshElevation, reloadRides],
  );

  // Los ZIP de exportaciones anteriores quedan en la caché: se borran al abrir.
  useEffect(() => {
    cleanExportCache();
    cleanTileCache();
  }, []);

  // La geografía de cada salida (para los mapas) se indexa de a poco al abrir y después de cada cambio.
  useEffect(() => {
    if (!startupDone) return;
    runExclusive('geo', indexMissingGeo)
      .then((n) => {
        // Recorridos y pasadas nuevas cambian los premios: se avisa una sola vez.
        if (n) setChange((c) => ({ seq: c.seq + 1, rideIds: [] }));
      })
      .catch(logError('map', 'Falló la indexación de mapas'));
  }, [startupDone, change.seq, runExclusive]);

  // El clima de cada salida (meses enteros, con la coordenada de la ciudad elegida).
  const { weatherOnline, city } = settings;
  useEffect(() => {
    if (!startupDone || !weatherOnline || !city) return;
    runExclusive('weather', () => refreshWeather(latest.current.rides, city, () => !latest.current.settings.weatherOnline))
      .then((res) => {
        if (res && res.fetched > 0) setChange((c) => ({ seq: c.seq + 1, rideIds: [] }));
      })
      .catch(logError('weather', 'Falló la consulta de clima'));
  }, [startupDone, weatherOnline, city, rides, runExclusive]);

  // Al abrir la app, y cada vez que volvés a ella, se revisa la carpeta ya elegida sin preguntar y
  // se reintentan las consultas de altitud que hayan quedado pendientes.
  useEffect(() => {
    const check = () => {
      const task = latest.current.settings.folderUri ? syncFolder(false) : refreshElevation();
      task
        .catch(logError('import', 'Falló la lectura automática'))
        .finally(() => setStartupDone(true));
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastSyncAt.current > RESYNC_MIN_MS) check();
    });
    return () => sub.remove();
  }, [syncFolder, refreshElevation]);

  const addGoal = useCallback(async (g: Omit<Goal, 'id'>) => {
    // Una sola meta por período y métrica: si ya existe, se le cambia el objetivo.
    const same = latest.current.goals.find((x) => x.period === g.period && x.metric === g.metric);
    const goal: Goal = { ...g, id: same?.id ?? `${Date.now()}` };
    await saveGoal(goal);
    setGoals(loadGoals());
  }, []);

  const removeGoal = useCallback(async (id: string) => {
    await deleteGoal(id);
    setGoals(loadGoals());
  }, []);

  const reloadBikes = useCallback(() => {
    setBikes(loadBikes());
    setBikeParts(loadParts());
  }, []);

  const saveBikeAction = useCallback(
    async (b: Bike) => {
      await saveBike(b);
      reloadBikes();
    },
    [reloadBikes],
  );
  const removeBike = useCallback(
    async (id: string) => {
      await deleteBike(id);
      reloadBikes();
      reloadRides([]);
    },
    [reloadBikes, reloadRides],
  );
  const savePartAction = useCallback(
    async (p: BikePart) => {
      await savePart(p);
      reloadBikes();
    },
    [reloadBikes],
  );
  const removePart = useCallback(
    async (id: string) => {
      await deletePart(id);
      reloadBikes();
    },
    [reloadBikes],
  );
  const setRideBikeAction = useCallback(
    async (rideId: string, bikeId: string | null) => {
      await setRideBike(rideId, bikeId);
      reloadRides([rideId]);
    },
    [reloadRides],
  );
  const setRideCounted = useCallback(
    async (rideId: string, value: boolean | null) => {
      await setCountedOverride(rideId, value === null ? null : value ? 1 : 0);
      reloadRides([rideId]);
    },
    [reloadRides],
  );

  // La bici que antes se cargaba en el perfil (versión 0.4.0) pasa a ser la primera bici, una sola vez.
  useEffect(() => {
    if (loadSetting<boolean>('bikesMigrated', false)) return;
    (async () => {
      const a = latest.current.settings.athlete;
      if (loadBikes().length === 0 && (a.bikeModel !== null || a.bikeKg !== null)) {
        const id = `bike-${Date.now()}`;
        await saveBike({
          id,
          name: a.bikeModel ?? 'Mi bici',
          type: a.bike,
          weightKg: a.bikeKg,
          wheel: null,
          tireMm: null,
          retired: false,
          isDefault: true,
          createdT: Date.now(),
        });
        await assignAllRidesToBike(id);
        reloadBikes();
        reloadRides([]);
        log('info', 'bikes', 'La bici del perfil pasó a la lista de bicis');
      }
      await saveSetting('bikesMigrated', true);
    })().catch(logError('bikes', 'Falló la migración de la bici del perfil'));
  }, [reloadBikes, reloadRides]);

  const wipeAll = useCallback(async () => {
    // Una lectura o una consulta en curso volvería a escribir salidas o perfiles después del borrado.
    if (running.current.size > 0) return false;
    running.current.add('wipe');
    try {
    await cancelAllReminders();
    await deleteAllData();
    // Mosaicos de mapa y exportaciones en la caché: también guardan ubicación.
    for (const sub of ['tiles', 'export']) {
      try {
        const dir = new Directory(Paths.cache, sub);
        if (dir.exists) dir.delete();
      } catch (e) {
        log('warn', 'db', 'No se pudo vaciar la caché', e);
      }
    }
    latest.current = { rides: [], allRides: [], goals: [], settings: DEFAULT_SETTINGS };
    setAllRides([]);
    setBikes([]);
    setBikeParts([]);
    setGoals([]);
    setSettings(DEFAULT_SETTINGS);
    setPendingDem(0);
    setLastSync(null);
    setSessionAdded(new Set());
    setChange((c) => ({ seq: c.seq + 1, rideIds: [] }));
    log('info', 'app', 'Se borraron todos los datos');
    return true;
    } finally {
      running.current.delete('wipe');
    }
  }, []);

  const reloadAll = useCallback((changedRideIds: string[] = []) => {
    const all = loadRides();
    const next = {
      rides: all.filter(countsAsRide),
      allRides: all,
      goals: loadGoals(),
      settings: sanitizeSettings(loadSetting<unknown>('settings', {})),
    };
    latest.current = next;
    setAllRides(all);
    setBikes(loadBikes());
    setBikeParts(loadParts());
    setGoals(next.goals);
    setSettings(next.settings);
    setPendingDem(profilesPendingDem().length);
    setChange((c) => ({ seq: c.seq + 1, rideIds: changedRideIds }));
  }, []);

  const value = useMemo(
    () => ({
      rides,
      allRides,
      bikes,
      bikeParts,
      saveBike: saveBikeAction,
      removeBike,
      savePart: savePartAction,
      removePart,
      setRideBike: setRideBikeAction,
      setRideCounted,
      goals,
      settings,
      syncFolder,
      syncing,
      progress,
      lastSync,
      pendingDem,
      refreshElevation,
      addGoal,
      removeGoal,
      updateSettings,
      wipeAll,
      startupDone,
      change,
      sessionAdded,
      runExclusive,
      reloadAll,
    }),
    [
      rides,
      allRides,
      bikes,
      bikeParts,
      saveBikeAction,
      removeBike,
      savePartAction,
      removePart,
      setRideBikeAction,
      setRideCounted,
      goals,
      settings,
      syncFolder,
      syncing,
      progress,
      lastSync,
      pendingDem,
      refreshElevation,
      addGoal,
      removeGoal,
      updateSettings,
      wipeAll,
      startupDone,
      change,
      sessionAdded,
      runExclusive,
      reloadAll,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
