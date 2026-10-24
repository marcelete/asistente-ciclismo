import { periodStart } from './periods';
import type { PeriodKind } from './periods';
import { rideElevation } from './rides';
import type { RideRecord } from './rides';

/** Un récord y la salida (o el período) donde se logró. */
export interface RecordEntry {
  value: number;
  rideId: string;
  startT: number;
}

export interface Records {
  longestDistance: RecordEntry | null;
  maxGain: RecordEntry | null;
  maxAltitude: RecordEntry | null;
  maxSpeed: RecordEntry | null;
  longestMoving: RecordEntry | null;
  /** Mayor velocidad media en movimiento en salidas de al menos 10 km (m/s). */
  fastestAvgSpeed: RecordEntry | null;
  /** Mejor tiempo de cada distancia estándar (segundos). */
  bestEfforts: Record<number, RecordEntry>;
  /** Las tres mejores marcas de cada distancia (la primera es la de `bestEfforts`), de menor a mayor tiempo. */
  podiums: Record<number, RecordEntry[]>;
  /** Semana y mes con más kilómetros: `startT` es el inicio del período. */
  biggestWeek: { distance: number; startT: number } | null;
  biggestMonth: { distance: number; startT: number } | null;
}

/** Distancia mínima para que la velocidad media de una salida cuente como récord. */
export const FASTEST_AVG_MIN_DISTANCE = 10000;

function better(cur: RecordEntry | null, value: number | null, r: RideRecord, lower = false): RecordEntry | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return cur;
  if (cur && (lower ? value >= cur.value : value <= cur.value)) return cur;
  return { value, rideId: r.id, startT: r.startT };
}

function biggest(rides: RideRecord[], kind: PeriodKind): { distance: number; startT: number } | null {
  const by = new Map<number, number>();
  for (const r of rides) {
    const k = periodStart(kind, r.startT);
    by.set(k, (by.get(k) ?? 0) + r.distance);
  }
  let best: { distance: number; startT: number } | null = null;
  for (const [startT, distance] of by) if (!best || distance > best.distance) best = { distance, startT };
  return best;
}

/**
 * Récords de todo el historial. Recorre las salidas de la más vieja a la más nueva: si dos
 * empatan, el récord queda en la más vieja (igual que el motor de premios).
 */
export function records(input: RideRecord[]): Records {
  const rides = [...input].sort((a, b) => a.startT - b.startT || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: Records = {
    longestDistance: null,
    maxGain: null,
    maxAltitude: null,
    maxSpeed: null,
    longestMoving: null,
    fastestAvgSpeed: null,
    bestEfforts: {},
    podiums: {},
    biggestWeek: biggest(rides, 'week'),
    biggestMonth: biggest(rides, 'month'),
  };
  for (const r of rides) {
    const e = rideElevation(r);
    out.longestDistance = better(out.longestDistance, r.distance, r);
    out.maxGain = better(out.maxGain, e.gain, r);
    out.maxAltitude = better(out.maxAltitude, e.maxAltitude, r);
    out.maxSpeed = better(out.maxSpeed, r.maxSpeed, r);
    out.longestMoving = better(out.longestMoving, r.movingSec, r);
    if (r.distance >= FASTEST_AVG_MIN_DISTANCE && r.movingSec > 0) {
      out.fastestAvgSpeed = better(out.fastestAvgSpeed, r.distance / r.movingSec, r);
    }
    for (const [k, sec] of Object.entries(r.efforts ?? {})) {
      const d = Number(k);
      const cur = out.bestEfforts[d] ?? null;
      const next = better(cur, sec, r, true);
      if (next) out.bestEfforts[d] = next;
      if (Number.isFinite(sec) && sec > 0) {
        const list = out.podiums[d] ?? [];
        // Estricto: a igual tiempo gana el que ya estaba.
        let pos = 0;
        while (pos < list.length && sec >= list[pos].value) pos++;
        if (pos < 3) out.podiums[d] = [...list.slice(0, pos), { value: sec, rideId: r.id, startT: r.startT }, ...list.slice(pos)].slice(0, 3);
      }
    }
  }
  return out;
}
