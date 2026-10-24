import { haversineMeters } from '../core/geo/distance';
import { buildRequests, HOURLY_VARIABLES, parseHourly, pickNeeds, weatherForRide } from '../core/weather/weather';
import type { WeatherNeed, WeatherRow } from '../core/weather/weather';
import type { City } from '../data/settings';
import { loadRideGeo } from '../data/dbGeo';
import { loadWeather, saveWeather } from '../data/dbWeather';
import type { RideRecord } from '../core/stats/rides';
import { log } from './log';
import { formatUntil, omGet, OpenMeteoCancelled, OpenMeteoWait } from './openMeteo';

/**
 * Clima de cada salida desde el archivo histórico de Open-Meteo.
 *
 * Privacidad: se manda la coordenada de la ciudad elegida (2 decimales), nunca la de una salida, y
 * meses enteros (no revela los días exactos que saliste). Solo se usa `archive-api`: trae datos
 * hasta hoy (completa los últimos días con el pronóstico).
 */
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';

export interface WeatherResult {
  fetched: number;
  message: string;
}

/** Busca ciudades por nombre. Solo se manda lo que escribís. */
export async function searchCities(name: string): Promise<City[]> {
  const q = name.trim();
  if (q.length < 2) return [];
  const json = (await omGet(`${GEOCODING}?name=${encodeURIComponent(q)}&count=5&language=es`, { cost: 1 })) as {
    results?: { name?: string; admin1?: string; country?: string; latitude?: number; longitude?: number }[];
  };
  return (json.results ?? [])
    .filter((r) => typeof r.name === 'string' && typeof r.latitude === 'number' && typeof r.longitude === 'number')
    .map((r) => ({
      name: r.name!,
      region: r.admin1 ?? '',
      country: r.country ?? '',
      lat: Math.round(r.latitude! * 100) / 100,
      lon: Math.round(r.longitude! * 100) / 100,
    }));
}

function urlFor(city: City, start: string, end: string): string {
  return `${ARCHIVE}?latitude=${city.lat.toFixed(2)}&longitude=${city.lon.toFixed(2)}&start_date=${start}&end_date=${end}&hourly=${HOURLY_VARIABLES.join(',')}&wind_speed_unit=ms&timezone=GMT`;
}

/**
 * Trae el clima de las salidas que lo necesitan. Devuelve un texto de estado. Si Open-Meteo pide
 * esperar, lo que falta queda para la próxima pasada.
 */
export async function refreshWeather(rides: RideRecord[], city: City, isCancelled: () => boolean = () => false): Promise<WeatherResult> {
  const now = Date.now();
  const rows = loadWeather();
  const needs: WeatherNeed[] = rides.map((r) => {
    const geo = loadRideGeo(r.id);
    return {
      rideId: r.id,
      startT: r.startT,
      endT: r.endT,
      distanceKm: geo ? haversineMeters(city.lat, city.lon, geo.start.lat, geo.start.lon) / 1000 : null,
    };
  });
  const { fetch: toFetch, far } = pickNeeds(needs, rows, now);
  if (far.length > 0) await saveWeather(far.map((n) => ({ rideId: n.rideId, status: 'far', data: null, fetchedT: now })));
  if (toFetch.length === 0) return { fetched: 0, message: 'No hay salidas esperando el clima.' };

  const requests = buildRequests(toFetch.map((n) => n.startT), now);
  let fetched = 0;
  try {
    for (const req of requests) {
      if (isCancelled()) break;
      const json = await omGet(urlFor(city, req.start, req.end), { cost: req.cost, isCancelled });
      const hourly = parseHourly(json);
      if (!hourly) throw new Error('Respuesta de clima inesperada');
      const out: WeatherRow[] = [];
      for (const n of toFetch) {
        if (n.startT < req.startMs || n.startT > req.endMs + 86_400_000) continue;
        const data = weatherForRide(hourly, n.startT, n.endT);
        const provisional = now - n.startT < 7 * 86_400_000;
        out.push({ rideId: n.rideId, status: data ? (provisional ? 'provisional' : 'ok') : 'missing', data, fetchedT: now });
      }
      await saveWeather(out);
      fetched += out.length;
    }
  } catch (e) {
    if (e instanceof OpenMeteoCancelled) return { fetched, message: 'Se cortó la consulta del clima.' };
    if (e instanceof OpenMeteoWait) return { fetched, message: `Clima: sigue a las ${formatUntil(e.until)}.` };
    log('warn', 'weather', 'Falló la consulta de clima', e);
    return { fetched, message: 'No se pudo consultar el clima. Se reintenta más tarde.' };
  }
  if (fetched > 0) log('info', 'weather', `Clima completado en ${fetched} salida(s)`);
  return { fetched, message: fetched > 0 ? `Clima listo en ${fetched} salida(s).` : 'No hay salidas esperando el clima.' };
}
