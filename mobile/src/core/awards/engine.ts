import { metricValue } from '../goals/goals';
import type { Goal } from '../goals/goals';
import { periodStart, shiftPeriodStart } from '../stats/periods';
import { rideElevation } from '../stats/rides';
import type { RideRecord } from '../stats/rides';
import { streak } from '../stats/streaks';
import { badgeKey, familyOf, FAMILIES, tierOf } from './catalog';
import type { AwardMetric, Tier } from './catalog';

/**
 * Motor de premios y victorias. Pura: recibe las salidas que cuentan y devuelve todo lo que
 * ganaste, con la salida donde lo ganaste. Repasa las salidas de la más vieja a la más nueva y
 * compara en forma estricta; el primer valor de cada métrica no cuenta como victoria.
 */
export type AwardKind = 'badge' | 'record' | 'record2' | 'record3' | 'goal' | 'period';

export interface AwardEvent {
  key: string;
  kind: AwardKind;
  title: string;
  /** Texto corto con el valor ("82,4 km"). */
  detail?: string;
  tier?: Tier;
  rideId: string | null;
  /** Inicio de la salida donde se ganó. */
  t: number;
  /** Depende del desnivel: si la salida espera la altitud del mapa, se festeja cuando llegue. */
  usesGain?: boolean;
}

export interface NextAward {
  key: string;
  family: AwardMetric;
  title: string;
  current: number;
  target: number;
  unit: string;
  fraction: number;
}

export interface PodiumEntry {
  value: number;
  rideId: string;
  t: number;
}

export interface AwardsResult {
  /** Todo lo ganado, de lo más viejo a lo más nuevo. */
  events: AwardEvent[];
  badges: AwardEvent[];
  victories: AwardEvent[];
  next: NextAward[];
  /** Los tres mejores tiempos de cada distancia estándar, de menor a mayor. */
  podiums: Record<number, PodiumEntry[]>;
}

/** Una pasada por un segmento personal (de data/dbSegments). */
export interface SegmentEffortInput {
  segmentId: string;
  segmentName: string;
  rideId: string;
  duration: number;
}

export interface AwardsInput {
  rides: RideRecord[];
  goals: Goal[];
  now: number;
  autoPause: boolean;
  segmentEfforts?: SegmentEffortInput[];
  /** Recorrido equivalente de cada salida (rideId → id del recorrido). */
  routeOf?: ReadonlyMap<string, string>;
  /** Clima de cada salida (rideId → datos); solo se usan temperatura y viento. */
  weather?: ReadonlyMap<string, { tempC: number | null; windMs: number | null }>;
  /** Programas para seguir que ya terminaste. */
  programsDone?: { id: string; name: string; t: number }[];
}

const fmtKm = (m: number) => `${(m / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`;
const fmtDur = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const dateKey = (t: number) => {
  const d = new Date(t);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const effortName = (d: number) => `${d / 1000} km`;

interface RecordMetric {
  id: string;
  title: string;
  /** Mayor es mejor, salvo que `lower`. */
  value: (r: RideRecord) => number | null;
  format: (v: number) => string;
  usesGain?: boolean;
}

const RECORD_METRICS: RecordMetric[] = [
  { id: 'distance', title: 'Récord de distancia', value: (r) => r.distance, format: fmtKm },
  {
    id: 'gain',
    title: 'Récord de desnivel',
    value: (r) => rideElevation(r).gain,
    format: (v) => `${Math.round(v).toLocaleString('es-AR')} m`,
    usesGain: true,
  },
  { id: 'moving', title: 'Récord de tiempo en movimiento', value: (r) => r.movingSec, format: fmtDur },
  {
    id: 'avg',
    title: 'Récord de velocidad media (10 km o más)',
    value: (r) => (r.distance >= 10_000 && r.movingSec > 0 ? (r.distance / r.movingSec) * 3.6 : null),
    format: (v) => `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km/h`,
  },
];

/** Orden estable: por inicio y, si empatan, por id. */
const byTime = (a: RideRecord, b: RideRecord) => a.startT - b.startT || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function computeAwards(input: AwardsInput): AwardsResult {
  const { goals, now, autoPause } = input;
  const effortsByRide = new Map<string, SegmentEffortInput[]>();
  for (const e of input.segmentEfforts ?? []) effortsByRide.set(e.rideId, [...(effortsByRide.get(e.rideId) ?? []), e]);
  const routeCount = new Map<string, number>();
  const rides = [...input.rides].sort(byTime);
  const events: AwardEvent[] = [];
  const earned = new Set<string>();

  const earn = (family: AwardMetric, value: number, r: RideRecord) => {
    const fam = familyOf(family);
    for (const th of fam.thresholds) {
      const key = badgeKey(family, th);
      if (value >= th && !earned.has(key)) {
        earned.add(key);
        events.push({
          key,
          kind: 'badge',
          title: fam.title(th),
          detail: undefined,
          tier: tierOf(fam, th),
          rideId: r.id,
          t: r.startT,
          usesGain: fam.usesGain,
        });
      }
    }
  };

  /** Un umbral puntual (los horarios no son una escala: madrugador no incluye a nocturno). */
  const earnOne = (family: AwardMetric, th: number, r: RideRecord) => {
    const fam = familyOf(family);
    const key = badgeKey(family, th);
    if (earned.has(key)) return;
    earned.add(key);
    events.push({ key, kind: 'badge', title: fam.title(th), tier: tierOf(fam, th), rideId: r.id, t: r.startT });
  };

  // Acumuladores.
  let totalKm = 0;
  let totalGain = 0;
  let count = 0;
  let recordCount = 0;
  let goalCount = 0;
  const dayRun = new Map<number, number>();
  const weekRun = new Map<number, number>();
  const monthKm = new Map<number, number>();
  const bikeKm = new Map<string, number>();
  const weekKm = new Map<number, number>();
  const monthDist = new Map<number, number>();
  const tops = new Map<string, PodiumEntry[]>();
  const periodGoalDone = new Set<string>();
  const goalCum = new Map<string, number>();

  const lowerIsBetter = (id: string) => id.startsWith('eff');

  /** Registra un valor en el podio de una métrica y devuelve la posición (0 = récord) o null. */
  const place = (id: string, value: number, r: RideRecord): number | null => {
    const list = tops.get(id) ?? [];
    const lower = lowerIsBetter(id);
    const beats = (a: number, b: number) => (lower ? a < b : a > b);
    let pos = 0;
    while (pos < list.length && !beats(value, list[pos].value)) pos++;
    const priorCount = list.length;
    if (pos >= 3) return null;
    list.splice(pos, 0, { value, rideId: r.id, t: r.startT });
    tops.set(id, list.slice(0, 3));
    // El primer valor no es una victoria; las marcas 2.ª y 3.ª solo cuentan si desplazan a alguien.
    if (priorCount === 0) return null;
    if (pos === 0) return 0;
    return priorCount >= pos + 1 || priorCount >= 3 ? pos : null;
  };

  const victory = (kind: AwardKind, key: string, title: string, detail: string, r: RideRecord, usesGain?: boolean) => {
    events.push({ key, kind, title, detail, rideId: r.id, t: r.startT, usesGain });
    if (kind === 'record') {
      recordCount++;
      earn('records', recordCount, r);
    }
  };

  for (const r of rides) {
    const elev = rideElevation(r);
    count++;
    totalKm += r.distance / 1000;
    totalGain += elev.gain;

    earn('km', totalKm, r);
    earn('gain', totalGain, r);
    earn('rides', count, r);
    earn('rideKm', r.distance / 1000, r);
    earn('rideGain', elev.gain, r);
    earn('rideHours', r.movingSec / 3600, r);
    if (r.distance >= 20_000 && r.movingSec > 0) earn('avgSpeed', (r.distance / r.movingSec) * 3.6, r);

    // Horarios.
    const hour = new Date(r.startT).getHours();
    if (hour < 7) earnOne('daypart', 1, r);
    if (hour >= 21) earnOne('daypart', 2, r);

    // Rachas: se calculan con la corrida de días o semanas seguidos que termina en esta salida.
    const day = periodStart('day', r.startT);
    if (!dayRun.has(day)) dayRun.set(day, (dayRun.get(shiftPeriodStart('day', day, -1)) ?? 0) + 1);
    earn('streakDays', dayRun.get(day)!, r);
    const week = periodStart('week', r.startT);
    if (!weekRun.has(week)) weekRun.set(week, (weekRun.get(shiftPeriodStart('week', week, -1)) ?? 0) + 1);
    earn('streakWeeks', weekRun.get(week)!, r);

    // Kilómetros en un mes y con una bici.
    const month = periodStart('month', r.startT);
    monthKm.set(month, (monthKm.get(month) ?? 0) + r.distance / 1000);
    earn('monthKm', monthKm.get(month)!, r);
    const bike = r.bikeId ?? 'default';
    bikeKm.set(bike, (bikeKm.get(bike) ?? 0) + r.distance / 1000);
    earn('bikeKm', bikeKm.get(bike)!, r);

    // Victorias: récords personales.
    for (const m of RECORD_METRICS) {
      const v = m.value(r);
      if (v === null || !Number.isFinite(v) || v <= 0) continue;
      const pos = place(m.id, v, r);
      if (pos === 0) victory('record', `rec:${m.id}:${r.id}`, m.title, m.format(v), r, m.usesGain);
    }
    for (const [k, sec] of Object.entries(r.efforts ?? {})) {
      const d = Number(k);
      if (!Number.isFinite(sec) || sec <= 0) continue;
      const pos = place(`eff${d}`, sec, r);
      const detail = fmtDur(sec);
      if (pos === 0) victory('record', `rec:eff${d}:${r.id}`, `Mejor tiempo en ${effortName(d)}`, detail, r);
      else if (pos === 1) victory('record2', `rec2:eff${d}:${r.id}`, `2.ª mejor marca en ${effortName(d)}`, detail, r);
      else if (pos === 2) victory('record3', `rec3:eff${d}:${r.id}`, `3.ª mejor marca en ${effortName(d)}`, detail, r);
    }

    // Segmentos personales: récord en cada uno (la mejor pasada de la salida).
    const segBest = new Map<string, SegmentEffortInput>();
    for (const e of effortsByRide.get(r.id) ?? []) {
      const cur = segBest.get(e.segmentId);
      if (!cur || e.duration < cur.duration) segBest.set(e.segmentId, e);
    }
    for (const e of segBest.values()) {
      if (!Number.isFinite(e.duration) || e.duration <= 0) continue;
      if (place(`seg${e.segmentId}`, e.duration, r) === 0) {
        victory('record', `rec:seg:${e.segmentId}:${r.id}`, `Récord en ${e.segmentName}`, fmtDur(e.duration), r);
      }
    }

    // Frío, calor y viento.
    const w = input.weather?.get(r.id);
    if (w) {
      if (w.tempC !== null) {
        earn('cold', Math.max(0, 10 - w.tempC), r);
        earn('heat', w.tempC, r);
      }
      if (w.windMs !== null) earn('wind', w.windMs * 3.6, r);
    }

    // Mismo recorrido repetido.
    const route = input.routeOf?.get(r.id);
    if (route) {
      const n = (routeCount.get(route) ?? 0) + 1;
      routeCount.set(route, n);
      earn('route', n, r);
    }

    // Semana y mes con más kilómetros: una victoria por período, cuando supera a todos los anteriores.
    for (const [kind, map] of [
      ['week', weekKm],
      ['month', monthDist],
    ] as const) {
      const start = periodStart(kind, r.startT);
      const after = (map.get(start) ?? 0) + r.distance;
      map.set(start, after);
      let bestOther = -1;
      for (const [other, km] of map) if (other !== start && km > bestOther) bestOther = km;
      const key = `rec:${kind}:${dateKey(start)}`;
      if (bestOther >= 0 && after > bestOther && !earned.has(key)) {
        earned.add(key);
        victory('period', key, kind === 'week' ? 'Tu semana con más kilómetros' : 'Tu mes con más kilómetros', fmtKm(after), r);
      }
    }

    // Metas: cuentan solo si la salida que la cumplió es posterior a la creación de la meta.
    for (const g of goals) {
      const created = Number(g.id);
      if (!Number.isFinite(created) || r.startT < created) continue;
      const pStart = periodStart(g.period, r.startT);
      const gk = `${g.id}:${pStart}`;
      const cum = (goalCum.get(gk) ?? 0) + metricValue(g.metric, [r], autoPause);
      goalCum.set(gk, cum);
      if (cum >= g.target && !periodGoalDone.has(gk)) {
        periodGoalDone.add(gk);
        goalCount++;
        const key = `goal:${g.id}:${dateKey(pStart)}`;
        events.push({ key, kind: 'goal', title: 'Meta cumplida', detail: undefined, rideId: r.id, t: r.startT, usesGain: g.metric === 'elevation' });
        earn('goals', goalCount, r);
      }
    }
  }

  for (const p of input.programsDone ?? []) {
    events.push({ key: `badge:program:${p.id}`, kind: 'badge', title: `Terminaste «${p.name}»`, tier: 'gold', rideId: null, t: p.t });
  }
  events.sort((a, b) => a.t - b.t);

  // Lo que sigue: los 5 premios más cerca (por fracción lograda).
  const current: Partial<Record<AwardMetric, number>> = {
    km: totalKm,
    gain: totalGain,
    rides: count,
    goals: goalCount,
    records: recordCount,
    streakDays: streak(rides, 'day', now).current,
    streakWeeks: streak(rides, 'week', now).current,
    monthKm: monthKm.get(periodStart('month', now)) ?? 0,
    bikeKm: Math.max(0, ...bikeKm.values()),
  };
  const next: NextAward[] = [];
  for (const fam of FAMILIES) {
    const cur = current[fam.id];
    if (cur === undefined) continue;
    const th = fam.thresholds.find((t) => !earned.has(badgeKey(fam.id, t)));
    if (th === undefined) continue;
    next.push({ key: badgeKey(fam.id, th), family: fam.id, title: fam.title(th), current: cur, target: th, unit: fam.unit, fraction: Math.min(1, cur / th) });
  }
  next.sort((a, b) => b.fraction - a.fraction);

  const podiums: Record<number, PodiumEntry[]> = {};
  for (const [id, list] of tops) if (id.startsWith('eff')) podiums[Number(id.slice(3))] = list;

  return {
    events,
    badges: events.filter((e) => e.kind === 'badge'),
    victories: events.filter((e) => e.kind !== 'badge' && e.kind !== 'goal'),
    next: next.slice(0, 5),
    podiums,
  };
}
