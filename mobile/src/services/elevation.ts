import { cellKey, cellOf, sentCoord } from '../core/elevation/cells';
import type { Cell } from '../core/elevation/cells';
import { fillPrivacyZone, SENT_DECIMALS, shareableIndices } from '../core/elevation/privacy';
import { chunk } from '../core/elevation/profile';
import type { ProfilePoint } from '../core/elevation/profile';
import { getCells, putCells } from '../data/dbDem';
import { OpenMeteoCancelled, OpenMeteoWait, omGet } from './openMeteo';

/**
 * Altitud del terreno por coordenada: modelo Copernicus DEM GLO-90 (90 m de resolución) servido
 * por la API de elevación de Open-Meteo. Gratis para uso no comercial y sin clave; acepta hasta
 * 100 coordenadas por consulta y cada coordenada cuenta como una consulta (ver services/openMeteo).
 *
 * Privacidad: solo se mandan coordenadas redondeadas (~11 m) y nunca las de los primeros ni los
 * últimos metros de la salida (ver core/elevation/privacy).
 *
 * Ahorro: el modelo devuelve el valor de la celda de ~90 m, así que se manda una sola coordenada
 * por celda y las altitudes ya conocidas se guardan para siempre (ver data/dbDem).
 */
const URL = 'https://api.open-meteo.com/v1/elevation';
const BATCH = 100;

/** Rango plausible de altitud en la Tierra (m); lo de afuera es una respuesta rota. */
const MIN_ALT = -500;
const MAX_ALT = 9000;

async function fetchBatch(reps: { lat: number; lon: number }[], isCancelled: () => boolean): Promise<number[]> {
  const lat = reps.map((p) => p.lat.toFixed(SENT_DECIMALS)).join(',');
  const lon = reps.map((p) => p.lon.toFixed(SENT_DECIMALS)).join(',');
  const json = (await omGet(`${URL}?latitude=${lat}&longitude=${lon}`, { cost: reps.length, isCancelled })) as {
    elevation?: unknown;
  };
  const elev = json.elevation;
  if (
    !Array.isArray(elev) ||
    elev.length !== reps.length ||
    !elev.every((e) => typeof e === 'number' && Number.isFinite(e) && e >= MIN_ALT && e <= MAX_ALT)
  ) {
    throw new Error('Respuesta de elevación inesperada');
  }
  return elev as number[];
}

interface Group {
  cell: Cell;
  idxs: number[];
  lat: number;
  lon: number;
}

export interface DemResult {
  /** Los puntos con la altitud que se alcanzó a traer (todos, si `complete`). */
  points: ProfilePoint[];
  complete: boolean;
  cancelled: boolean;
  /** Mensaje si falló algo que no es una espera (sin conexión, respuesta rota…). */
  error: string | null;
  /** Hasta cuándo hay que esperar (límite propio o 429), si ese fue el motivo. */
  waitUntil: number | null;
}

/**
 * Completa la altitud del mapa de los puntos que todavía no la tienen. Nunca lanza por la red:
 * devuelve lo que alcanzó a traer para guardarlo y retomar después. `isCancelled` se revisa antes
 * de cada tanda: si apagás la consulta en Ajustes, no sale ninguna coordenada más.
 */
export async function fetchDemProfile(points: ProfilePoint[], isCancelled: () => boolean = () => false): Promise<DemResult> {
  const out = points.map((p) => ({ ...p }));
  const missing = shareableIndices(points).filter((k) => points[k].dem === null);

  // Una coordenada por celda; los demás puntos de la celda reciben el mismo valor.
  const groups = new Map<string, Group>();
  for (const k of missing) {
    const lat = sentCoord(points[k].lat, SENT_DECIMALS);
    const lon = sentCoord(points[k].lon, SENT_DECIMALS);
    const cell = cellOf(lat, lon);
    const key = cellKey(cell);
    const g = groups.get(key);
    if (g) g.idxs.push(k);
    else groups.set(key, { cell, idxs: [k], lat, lon });
  }

  const known = getCells([...groups.values()].map((g) => g.cell));
  const pending: { key: string; g: Group }[] = [];
  for (const [key, g] of groups) {
    const alt = known.get(key);
    if (alt !== undefined) for (const k of g.idxs) out[k].dem = alt;
    else pending.push({ key, g });
  }

  const result: DemResult = { points: out, complete: false, cancelled: false, error: null, waitUntil: null };
  for (const batch of chunk(pending, BATCH)) {
    if (isCancelled()) {
      result.cancelled = true;
      return result;
    }
    try {
      const elev = await fetchBatch(batch.map((b) => b.g), isCancelled);
      const fresh: (Cell & { alt: number })[] = [];
      batch.forEach((b, j) => {
        for (const k of b.g.idxs) out[k].dem = elev[j];
        fresh.push({ ...b.g.cell, alt: elev[j] });
      });
      await putCells(fresh);
    } catch (e) {
      if (e instanceof OpenMeteoCancelled) result.cancelled = true;
      else if (e instanceof OpenMeteoWait) result.waitUntil = e.until;
      else result.error = e instanceof Error ? e.message : String(e);
      return result;
    }
  }
  result.points = fillPrivacyZone(out);
  result.complete = true;
  return result;
}
