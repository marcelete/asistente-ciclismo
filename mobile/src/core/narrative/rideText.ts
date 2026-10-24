import type { ClimbDetail } from '../analysis/profileMetrics';
import type { AwardEvent } from '../awards/engine';
import type { FormStatus } from '../load/training';
import { rideAvgSpeed, rideElevation } from '../stats/rides';
import type { RideRecord } from '../stats/rides';
import type { WeatherData } from '../weather/weather';

/**
 * Análisis en texto de una salida: 3 a 5 frases armadas con plantillas. No hay IA ni red. La
 * plantilla de cada frase se elige por un hash del id de la salida, así una misma salida siempre
 * dice lo mismo pero salidas distintas no suenan iguales.
 */
export interface RideTextInput {
  ride: RideRecord;
  /** Salidas en bici anteriores (se usan las de los 30 días previos). */
  history: RideRecord[];
  autoPause: boolean;
  form: FormStatus | null;
  hardestClimb: ClimbDetail | null;
  /** Segundos en las zonas 0 a 5 (null sin FC). */
  zoneSeconds: number[] | null;
  weather: WeatherData | null;
  victories: AwardEvent[];
  /** Veces que se hizo este recorrido (incluida esta). */
  routeTimes: number;
  /** Frase sobre las metas ("Te faltan 20 km para tu meta semanal"), si corresponde. */
  goalNudge: string | null;
  /** Programa en curso ("Tus primeros 50 km: 3 de 12 sesiones"), si hay. */
  program: string | null;
}

const DAY_MS = 86_400_000;

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

const num1 = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const num0 = (v: number) => Math.round(v).toLocaleString('es-AR');
const good = (v: number) => Number.isFinite(v) && v > 0;

const CARDINAL = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];

function pick<T>(h: number, shift: number, options: T[]): T {
  return options[(h >> shift) % options.length];
}

export function rideText(input: RideTextInput): string[] {
  const { ride, history, autoPause } = input;
  const h = hash(ride.id);
  const out: string[] = [];
  const km = ride.distance / 1000;
  const elev = rideElevation(ride);

  // 1. Victorias: lo más lindo va primero.
  const wins = input.victories.filter((v) => v.kind !== 'badge');
  if (wins.length > 0) {
    const first = wins[0];
    out.push(
      wins.length === 1
        ? pick(h, 1, [`¡Buena! ${first.title}${first.detail ? ` (${first.detail})` : ''}.`, `Hubo una victoria: ${first.title.toLowerCase()}${first.detail ? ` (${first.detail})` : ''}.`])
        : `Salida con ${wins.length} victorias, entre ellas: ${first.title.toLowerCase()}${first.detail ? ` (${first.detail})` : ''}.`,
    );
  }

  // 2. Comparación con los últimos 30 días.
  const recent = history.filter((r) => r.id !== ride.id && r.startT < ride.startT && ride.startT - r.startT <= 30 * DAY_MS);
  if (recent.length >= 2 && good(km)) {
    const avgKm = recent.reduce((a, r) => a + r.distance, 0) / recent.length / 1000;
    if (good(avgKm)) {
      const diff = ((km - avgKm) / avgKm) * 100;
      const word = Math.abs(diff) < 5 ? 'parecida a' : diff > 0 ? `un ${num0(diff)} % más larga que` : `un ${num0(-diff)} % más corta que`;
      out.push(
        pick(h, 3, [
          `Pedaleaste ${num1(km)} km, una salida ${word} tu promedio de los últimos 30 días (${num1(avgKm)} km).`,
          `Fueron ${num1(km)} km: ${word} lo que venías haciendo (${num1(avgKm)} km de promedio en 30 días).`,
        ]),
      );
    }
  } else if (good(km)) {
    out.push(`Pedaleaste ${num1(km)} km a ${num1(rideAvgSpeed(ride, autoPause) * 3.6)} km/h de media.`);
  }

  // 3. Lo más llamativo del recorrido: la subida más dura, o el desnivel.
  if (input.hardestClimb && good(input.hardestClimb.length)) {
    const c = input.hardestClimb;
    out.push(`La subida más dura fue de ${num1(c.length / 1000)} km al ${num1(c.avgGrade)} % de media (+${num0(c.gain)} m).`);
  } else if (good(elev.gain) && km > 0) {
    out.push(`Sumaste ${num0(elev.gain)} m de subida (${num0((elev.gain / km))} m por km).`);
  }

  // 4. Esfuerzo: zonas de FC o, si no hay, la forma.
  const z = input.zoneSeconds;
  const zTotal = z ? z.slice(1).reduce((a, b) => a + b, 0) : 0;
  if (z && zTotal > 0) {
    let best = 1;
    for (let i = 2; i <= 5; i++) if (z[i] > z[best]) best = i;
    out.push(`Pasaste la mayor parte del tiempo con pulsaciones de la zona ${best} (${num0((z[best] / zTotal) * 100)} %).`);
  }
  if (input.form) {
    out.push(`Tu forma hoy es «${input.form.label.toLowerCase()}»: ${input.form.advice.charAt(0).toLowerCase()}${input.form.advice.slice(1)}`);
  }

  // 5. Viento.
  const w = input.weather;
  if (w && w.windMs !== null && w.windMs * 3.6 >= 15) {
    const dir = w.windDirDeg !== null ? ` del ${CARDINAL[Math.round(w.windDirDeg / 45) % 8]}` : '';
    out.push(`Soplaba viento de ${num0(w.windMs * 3.6)} km/h${dir}${w.tempC !== null ? ` con ${num0(w.tempC)} °C` : ''}.`);
  }

  // 6. Recorrido repetido, metas y programa.
  if (input.routeTimes >= 2) out.push(`Ya hiciste este recorrido ${input.routeTimes} veces.`);
  if (input.goalNudge) out.push(input.goalNudge);
  if (input.program) out.push(input.program);

  // Entre 3 y 5 frases; si hay de más se rotan las opcionales según el hash.
  const keep = Math.min(5, Math.max(3, out.length));
  if (out.length <= keep) return out;
  const head = out.slice(0, 2);
  const rest = out.slice(2);
  const start = h % rest.length;
  const rotated = [...rest.slice(start), ...rest.slice(0, start)].slice(0, keep - head.length);
  return [...head, ...rotated];
}
