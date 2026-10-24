import { buildRideGeo } from '../core/geo/rideGeo';
import { loadProfile } from '../data/db';
import { ridesWithoutGeo, saveRideGeo } from '../data/dbGeo';
import { log } from './log';
import { assignPendingRoutes, scanPending } from './segments';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Devuelve cuánto cambió (geografía, recorridos y pasadas nuevas). Guarda la geografía (caja, inicio, final y traza simplificada) de las salidas que todavía no la tienen. */
export async function indexMissingGeo(): Promise<number> {
  const ids = ridesWithoutGeo();
  let done = 0;
  for (const id of ids) {
    const points = loadProfile(id);
    const geo = points ? buildRideGeo(id, points) : null;
    if (geo) {
      await saveRideGeo(geo);
      done++;
    }
    if (done % 20 === 0) await tick();
  }
  if (done > 0) log('info', 'map', `Se indexó la geografía de ${done} salida(s)`);
  // Con la geografía lista: recorridos equivalentes y pasadas por segmentos.
  const routes = await assignPendingRoutes();
  const found = await scanPending();
  // Cuántas cosas cambiaron: si es 0, no hace falta avisar a nadie.
  return done + routes + found;
}
