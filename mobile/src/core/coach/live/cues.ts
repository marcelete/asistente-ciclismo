import type { Target } from '../types';

/** Frases que dice el entrenador en vivo. Cortas y en voseo, para escucharlas con el viento. */

export function spokenDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '';
  if (sec < 90) return `${Math.round(sec)} segundos`;
  const min = Math.round(sec / 60);
  if (min < 60) return min === 1 ? '1 minuto' : `${min} minutos`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  const hours = h === 1 ? '1 hora' : `${h} horas`;
  return r === 0 ? hours : `${hours} ${r} minutos`;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ','));

/** Un ritmo dicho en voz alta: 330 s/km → "5 minutos 30"; 300 → "5 minutos". */
export function spokenPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '';
  const s = Math.round(secPerKm);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const min = m === 1 ? '1 minuto' : `${m} minutos`;
  return r === 0 ? min : `${min} ${r}`;
}

/** La velocidad es un ritmo de correr (se muestra y se dice en minutos por km). */
export const isPace = (t: Target | null) => !!t && t.kind === 'speed' && t.unit === 'min/km';

export function spokenTarget(t: Target | null): string {
  if (!t) return '';
  const range = t.min === t.max ? num(t.min) : `entre ${num(t.min)} y ${num(t.max)}`;
  switch (t.kind) {
    case 'speed':
      if (isPace(t)) {
        // El ritmo rápido sale de la velocidad máxima: "entre 5 minutos 20 y 5 minutos 40 por kilómetro".
        const fast = spokenPace(3600 / t.max);
        const slow = spokenPace(3600 / t.min);
        return fast === slow ? `a ${fast} por kilómetro` : `entre ${fast} y ${slow} por kilómetro`;
      }
      return `${range} kilómetros por hora`;
    case 'cadence':
      return `${range} pasos por minuto`;
    case 'hr':
      return `${range} pulsaciones`;
    case 'power':
      return `${range} vatios`;
    case 'rpe':
      return `esfuerzo ${t.min === t.max ? num(t.min) : `de ${num(t.min)} a ${num(t.max)}`} sobre 10`;
  }
}

export function startCue(label: string, durationSec: number, target: Target | null, cue: string | undefined, index: number, total: number): string {
  const parts = [label];
  if (Number.isFinite(durationSec)) parts.push(spokenDuration(durationSec));
  const tg = spokenTarget(target);
  if (tg) parts.push(tg);
  const base = parts.join('. ');
  const where = total > 1 && index === total - 1 ? ' Último bloque.' : '';
  return `${base}.${where}${cue ? ` ${cue}` : ''}`;
}

/** "Subí" o "Bajá" con el valor actual. */
export function correctionCue(direction: 'raise' | 'lower', target: Target, value: number): string {
  const verb = direction === 'raise' ? 'Subí' : 'Bajá';
  switch (target.kind) {
    case 'speed':
      if (isPace(target)) return `${direction === 'raise' ? 'Apurá' : 'Aflojá'}, vas a ${spokenPace(3600 / value)}.`;
      return `${verb}, vas a ${Math.round(value)}.`;
    case 'cadence':
      return direction === 'raise' ? `Pasos más cortos y rápidos, vas a ${Math.round(value)}.` : `Alargá un poco el paso, vas a ${Math.round(value)}.`;
    case 'hr':
      return `${verb} el ritmo, tenés ${Math.round(value)} pulsaciones.`;
    default:
      return `${verb} un poco.`;
  }
}

export const IN_RANGE_CUE = 'Bien, en ritmo.';
export const HALF_CUE = 'Vas por la mitad.';
export const LAST_MINUTE_CUE = 'Último minuto.';
export const HYDRATE_CUE = 'Tomá agua.';
export const FINISH_CUE = 'Terminaste la sesión. Muy bien.';
export const PAUSED_CUE = 'Pausa.';
export const RESUMED_CUE = 'Seguimos.';
