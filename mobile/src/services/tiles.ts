import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { log } from './log';

/**
 * Descarga propia de mosaicos de OpenStreetMap. Se hace así (y no con `Image` y headers) para
 * poder limitar la cantidad, mandar un User-Agent propio (la política de OSM bloquea el de
 * okhttp) y cortar ante un 403, 418 o 429. Sin precarga ni modo sin conexión.
 *
 * Privacidad: OSM ve tu IP y los mosaicos que se piden (la zona que mirás). El registro solo
 * guarda códigos de estado y cantidades, nunca la URL.
 */
export type MapLayer = 'standard' | 'cycle';

/** CyclOSM queda apagada hasta revisar la política de uso de OpenStreetMap Francia (ver el informe de seguridad). */
export const CYCLOSM_ENABLED = false;

export const LAYERS: { id: MapLayer; label: string; attribution: string; url: (z: number, x: number, y: number) => string }[] = [
  {
    id: 'standard',
    label: 'Estándar',
    attribution: '© colaboradores de OpenStreetMap',
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  {
    id: 'cycle',
    label: 'Ciclismo',
    attribution: '© colaboradores de OpenStreetMap · CyclOSM',
    url: (z, x, y) => `https://a.tile-cyclosm.openstreetmap.fr/cyclosm/${z}/${x}/${y}.png`,
  },
];

const DIR = 'tiles';
const MAX_AGE_MS = 30 * 86_400_000;
const SESSION_CAP = 600;
const CONCURRENCY = 2;
const CLEAN_ABOVE = 2500;
const CLEAN_KEEP = 2000;

let downloaded = 0;
let blockedUntilRestart = false;
let active = 0;
const waiting: (() => void)[] = [];
const inflight = new Map<string, Promise<string | null>>();

const userAgent = () =>
  `AsistenteCiclismo/${Constants.expoConfig?.version ?? '0'} (Android; app personal; com.ciclyingasistance.app)`;

function tileFile(layer: MapLayer, z: number, x: number, y: number): File {
  return new File(Paths.cache, DIR, layer, String(z), String(x), `${y}.png`);
}

async function slot(): Promise<void> {
  if (active < CONCURRENCY) {
    active++;
    return;
  }
  await new Promise<void>((r) => waiting.push(r));
  active++;
}

function release() {
  active--;
  waiting.shift()?.();
}

/** Ruta local del mosaico (de la caché o recién bajado), o null si no se pudo o no se debe bajar. */
export async function getTile(layer: MapLayer, z: number, x: number, y: number): Promise<string | null> {
  if (layer === 'cycle' && !CYCLOSM_ENABLED) layer = 'standard';
  const file = tileFile(layer, z, x, y);
  try {
    if (file.exists && file.size) {
      // Si el archivo es viejo se vuelve a bajar; mientras, se usa el que hay.
      return file.uri;
    }
  } catch {
    // Archivo ilegible: se vuelve a bajar.
  }
  if (blockedUntilRestart || downloaded >= SESSION_CAP) return null;
  const key = `${layer}/${z}/${x}/${y}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = (async () => {
    await slot();
    try {
      if (blockedUntilRestart || downloaded >= SESSION_CAP) return null;
      downloaded++;
      file.parentDirectory.create({ intermediates: true, idempotent: true });
      const url = LAYERS.find((l) => l.id === layer)!.url(z, x, y);
      const res = await File.downloadFileAsync(url, file, { headers: { 'User-Agent': userAgent() }, idempotent: true });
      return res.uri;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = /\b(403|418|429)\b/.exec(msg)?.[1];
      if (status) {
        blockedUntilRestart = true;
        log('warn', 'map', `El servidor de mapas respondió ${status}: no se piden más mosaicos en esta sesión`);
      } else {
        log('debug', 'map', 'No se pudo bajar un mosaico');
      }
      return null;
    } finally {
      release();
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

/** Borra los mosaicos con más de 30 días y, si quedan demasiados, deja los 2.000 más nuevos. */
export function cleanTileCache(): void {
  try {
    const root = new Directory(Paths.cache, DIR);
    if (!root.exists) return;
    const files: { f: File; t: number }[] = [];
    const walk = (d: Directory) => {
      for (const e of d.list()) {
        if (e instanceof Directory) walk(e);
        else files.push({ f: e, t: (e as unknown as { modificationTime?: number | null }).modificationTime ?? 0 });
      }
    };
    walk(root);
    const now = Date.now();
    let left = files.filter(({ f, t }) => {
      if (t > 0 && now - t > MAX_AGE_MS) {
        f.delete();
        return false;
      }
      return true;
    });
    if (left.length > CLEAN_ABOVE) {
      left = left.sort((a, b) => b.t - a.t);
      left.slice(CLEAN_KEEP).forEach(({ f }) => f.delete());
    }
  } catch (e) {
    log('warn', 'map', 'No se pudo limpiar la caché de mosaicos', e);
  }
}
