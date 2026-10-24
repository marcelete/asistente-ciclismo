import type { AwardEvent } from './engine';

/**
 * Cuándo se festeja. Pura: decide, a partir de lo ganado y de lo que ya se vio, qué se muestra
 * y qué se marca como visto sin festejo.
 *
 * 1. Primera vez (no hay `awardsInit`): se marca todo como visto. Si son 3 o menos se muestran
 *    uno por uno; si son más, un solo resumen.
 * 2. Después se festeja solo lo no visto de salidas importadas en esta apertura y de los últimos 14 días.
 * 3. Lo demás (recálculos, restauraciones, segmentos nuevos, clima o altitud de salidas viejas,
 *    salidas que pasan a contar) se marca visto sin festejo.
 * 4. Lo que depende del desnivel de una salida que espera la altitud del mapa se deja para cuando llegue.
 * 5. Una tarjeta por salida, máximo 3, y "y N más" que lleva a Logros.
 */
export const RECENT_DAYS = 14;
export const MAX_CARDS = 3;
const DAY_MS = 86_400_000;

export interface CelebrationCard {
  rideId: string | null;
  events: AwardEvent[];
  /** El más importante de la tarjeta, para el título y el sonido. */
  top: AwardEvent;
}

export interface CelebrationPlan {
  /** Claves que se marcan como vistas ya mismo, sin festejo. */
  silent: string[];
  cards: CelebrationCard[];
  /** Premios y victorias que no entraron en las tarjetas. */
  more: number;
  /** Resumen de la primera vez, si hay más de 3. */
  summary: { awards: number; victories: number } | null;
  /** Hay que guardar que la primera pasada ya se hizo. */
  setInit: boolean;
}

const PRIORITY: Record<AwardEvent['kind'], number> = { record: 5, goal: 4, badge: 3, period: 2, record2: 1, record3: 0 };

function top(events: AwardEvent[]): AwardEvent {
  return [...events].sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind])[0];
}

function cardsOf(events: AwardEvent[]): CelebrationCard[] {
  const byRide = new Map<string | null, AwardEvent[]>();
  for (const e of events) {
    const list = byRide.get(e.rideId) ?? [];
    list.push(e);
    byRide.set(e.rideId, list);
  }
  return [...byRide.entries()]
    .map(([rideId, list]) => ({ rideId, events: list, top: top(list) }))
    .sort((a, b) => b.top.t - a.top.t);
}

export interface CelebrationInput {
  events: AwardEvent[];
  seen: ReadonlySet<string>;
  /** Ya se hizo la primera pasada. */
  init: boolean;
  /** Ids de las salidas importadas desde que se abrió la app. */
  sessionAdded: ReadonlySet<string>;
  now: number;
  /** La salida todavía espera la altitud del mapa. */
  isDemPending: (rideId: string) => boolean;
}

export function planCelebration(input: CelebrationInput): CelebrationPlan {
  const { events, seen, init, sessionAdded, now, isDemPending } = input;
  const unseen = events.filter((e) => !seen.has(e.key));

  if (!init) {
    const all = unseen.map((e) => e.key);
    if (unseen.length === 0) return { silent: [], cards: [], more: 0, summary: null, setInit: true };
    if (unseen.length <= 3) {
      return { silent: all, cards: unseen.map((e) => ({ rideId: e.rideId, events: [e], top: e })), more: 0, summary: null, setInit: true };
    }
    const awards = unseen.filter((e) => e.kind === 'badge' || e.kind === 'goal').length;
    return { silent: all, cards: [], more: 0, summary: { awards, victories: unseen.length - awards }, setInit: true };
  }

  const deferred = new Set(unseen.filter((e) => e.usesGain && e.rideId !== null && isDemPending(e.rideId)).map((e) => e.key));
  const show = unseen.filter(
    (e) => !deferred.has(e.key) && (e.rideId === null ? sessionAdded.size > 0 : sessionAdded.has(e.rideId)) && now - e.t <= RECENT_DAYS * DAY_MS,
  );
  const cards = cardsOf(show);
  const shown = cards.slice(0, MAX_CARDS);
  const more = cards.slice(MAX_CARDS).reduce((n, c) => n + c.events.length, 0);
  // Lo mostrado se marca visto al mostrarlo; el resto, ya mismo.
  const shownKeys = new Set(shown.flatMap((c) => c.events.map((e) => e.key)));
  const silent = unseen.filter((e) => !deferred.has(e.key) && !shownKeys.has(e.key)).map((e) => e.key);
  return { silent, cards: shown, more, summary: null, setInit: false };
}

/** Qué sonido corresponde a una tarjeta. */
export function soundFor(card: CelebrationCard): 'fanfare' | 'sparkle' | 'chord' {
  if (card.top.kind === 'record') return 'fanfare';
  if (card.top.kind === 'goal') return 'chord';
  return 'sparkle';
}
