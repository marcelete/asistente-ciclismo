import { sanitizeWeatherData } from '../core/weather/weather';
import type { WeatherRow, WeatherStatus } from '../core/weather/weather';
import { conn } from './db';

const STATUSES: WeatherStatus[] = ['ok', 'provisional', 'far', 'missing'];

export function loadWeather(): Map<string, WeatherRow> {
  const out = new Map<string, WeatherRow>();
  for (const r of conn().getAllSync<{ ride_id: string; status: string; data: string | null; fetched_t: number }>('SELECT * FROM weather')) {
    let data = null;
    try {
      data = r.data ? sanitizeWeatherData(JSON.parse(r.data)) : null;
    } catch {
      data = null;
    }
    out.set(r.ride_id, {
      rideId: r.ride_id,
      status: STATUSES.includes(r.status as WeatherStatus) ? (r.status as WeatherStatus) : 'missing',
      data,
      fetchedT: r.fetched_t,
    });
  }
  return out;
}

export function loadRideWeather(rideId: string): WeatherRow | null {
  return loadWeather().get(rideId) ?? null;
}

export async function saveWeather(rows: WeatherRow[]): Promise<void> {
  if (rows.length === 0) return;
  const d = conn();
  d.withTransactionSync(() => {
    for (const r of rows) {
      d.runSync('INSERT OR REPLACE INTO weather (ride_id, status, data, fetched_t) VALUES (?, ?, ?, ?)', [
        r.rideId,
        r.status,
        r.data ? JSON.stringify(r.data) : null,
        r.fetchedT,
      ]);
    }
  });
}
