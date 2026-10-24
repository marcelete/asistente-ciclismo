import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { planCelebration } from '../core/awards/celebrate';
import type { CelebrationCard } from '../core/awards/celebrate';
import { computeAwards } from '../core/awards/engine';
import type { AwardEvent, AwardsResult } from '../core/awards/engine';
import { logError } from '../services/log';
import { playSound } from '../services/sound';
import { vibrate } from '../services/haptics';
import { isDemPending } from './db';
import { loadEfforts, loadSegments, routeMembers } from './dbSegments';
import { loadWeather } from './dbWeather';
import { completeProgram, loadActiveProgram, loadCompletedPrograms } from './programs';
import { isComplete, programById, programProgress } from '../core/plan/programs';
import { isAwardsInit, loadSeenKeys, markSeen, setAwardsInit } from './dbAwards';
import { useStore } from './store';

/** Lo que el festejo muestra: tarjetas de salidas, o el resumen de la primera vez. */
export type CelebrationItem =
  | { type: 'card'; id: string; card: CelebrationCard; more: number }
  | { type: 'summary'; id: string; awards: number; victories: number };

interface AwardsStore {
  result: AwardsResult;
  /** Lo ganado en cada salida (para los chips de la lista y del detalle). */
  byRide: ReadonlyMap<string, AwardEvent[]>;
  /** Festejos pendientes de mostrar, el primero es el actual. */
  queue: CelebrationItem[];
  /** El festejo actual ya se mostró: pasa al siguiente. */
  next: () => void;
}

const EMPTY: AwardsResult = { events: [], badges: [], victories: [], next: [], podiums: {} };
const Ctx = createContext<AwardsStore | null>(null);

export function useAwards(): AwardsStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('useAwards fuera de AwardsProvider');
  return s;
}

/** Espera a que la intro se vaya antes de festejar. */
const SETTLE_MS = 700;

export function AwardsProvider({ children }: { children: ReactNode }) {
  const { rides, goals, settings, change, sessionAdded, startupDone } = useStore();
  const [result, setResult] = useState<AwardsResult>(EMPTY);
  const [queue, setQueue] = useState<CelebrationItem[]>([]);
  const addedSeen = useRef(0);
  // Sube cuando se termina un programa, para recalcular y que aparezca su premio.
  const [programTick, setProgramTick] = useState(0);
  const { autoPause } = settings;

  // Recalcula cuando cambian las salidas, las metas o el criterio de tiempo, sin trabar la pantalla.
  useEffect(() => {
    // Se deja respirar a la pantalla antes de recorrer todo el historial.
    const handle = setTimeout(() => {
      const names = new Map(loadSegments().map((s) => [s.id, s.name] as const));
      const routeOf = new Map<string, string>();
      for (const [route, ids] of routeMembers()) for (const id of ids) routeOf.set(id, route);
      const segmentEfforts = loadEfforts().map((e) => ({
        segmentId: e.segmentId,
        segmentName: names.get(e.segmentId) ?? 'segmento',
        rideId: e.rideId,
        duration: e.duration,
      }));
      // ¿Se terminó el programa en curso? Entonces pasa a la lista de terminados (y da un premio).
      const active = loadActiveProgram();
      const def = active ? programById(active.id) : undefined;
      if (active && def && isComplete(programProgress(def, active.startT, rides))) {
        completeProgram(active.id, Date.now())
          .then(() => setProgramTick((n) => n + 1))
          .catch(logError('awards', 'No se pudo guardar el programa terminado'));
      }
      const programsDone = loadCompletedPrograms().map((p) => ({ id: p.id, name: programById(p.id)?.name ?? p.id, t: p.t }));
      const weather = new Map<string, { tempC: number | null; windMs: number | null }>();
      for (const [id, w] of loadWeather()) if (w.data) weather.set(id, w.data);
      setResult(computeAwards({ rides, goals, now: Date.now(), autoPause, segmentEfforts, routeOf, weather, programsDone }));
    }, 50);
    return () => clearTimeout(handle);
    // `change.seq` cubre los cambios que no tocan `rides` (la altitud del mapa de una salida).
  }, [rides, goals, autoPause, change.seq, programTick]);

  // Decide qué festejar. Corre solo cuando terminó el arranque y la bienvenida.
  const { onboardingDone, celebrations, sounds, haptics } = settings;
  useEffect(() => {
    if (!startupDone || !onboardingDone || result === EMPTY) return;
    const timer = setTimeout(() => {
      try {
        const plan = planCelebration({
          events: result.events,
          seen: loadSeenKeys(),
          init: isAwardsInit(),
          sessionAdded,
          now: Date.now(),
          isDemPending,
        });
        const shownKeys = plan.cards.flatMap((c) => c.events.map((e) => e.key));
        // Lo que se muestra se marca visto ya mismo: nunca se festeja dos veces.
        markSeen([...plan.silent, ...shownKeys]).catch(logError('awards', 'No se pudo guardar lo visto'));
        if (plan.setInit) setAwardsInit().catch(logError('awards', 'No se pudo guardar la primera pasada'));

        const items: CelebrationItem[] = [
          ...plan.cards.map<CelebrationItem>((card, i) => ({ type: 'card', id: `${card.top.key}`, card, more: i === plan.cards.length - 1 ? plan.more : 0 })),
          ...(plan.summary ? [{ type: 'summary' as const, id: 'summary', ...plan.summary }] : []),
        ];
        if (items.length > 0 && celebrations) setQueue((q) => [...q, ...items]);

        // Sin festejo, una salida nueva suena a "ding".
        const added = sessionAdded.size;
        if (added > addedSeen.current && (items.length === 0 || !celebrations)) {
          if (sounds) playSound('ding');
          if (haptics) vibrate('tick');
        }
        addedSeen.current = added;
      } catch (e) {
        logError('awards', 'Falló el cálculo de festejos')(e);
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [result, startupDone, onboardingDone, sessionAdded, celebrations, sounds, haptics]);

  const byRide = useMemo(() => {
    const m = new Map<string, AwardEvent[]>();
    for (const e of result.events) {
      if (e.rideId === null) continue;
      const list = m.get(e.rideId) ?? [];
      list.push(e);
      m.set(e.rideId, list);
    }
    return m;
  }, [result]);

  const next = useCallback(() => setQueue((q) => q.slice(1)), []);
  const value = useMemo(() => ({ result, byRide, queue, next }), [result, byRide, queue, next]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
