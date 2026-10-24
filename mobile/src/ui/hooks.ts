import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { resolveHrProfile } from '../core/load/training';
import type { ResolvedHr } from '../core/load/training';
import { useStore } from '../data/store';
import { vibrate } from '../services/haptics';
import type { HapticKind } from '../services/haptics';
import { playSound } from '../services/sound';
import type { SoundName } from '../services/sound';

/**
 * La hora actual para los cálculos de "hoy" y "esta semana". Se actualiza cada minuto y al volver
 * a la app, así pasada la medianoche los contadores cambian de día sin tener que cerrarla.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, intervalMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs]);
  return now;
}

/** FC más alta registrada en todo el historial (null sin sensor). */
export function useObservedMaxHr(): number | null {
  const { rides } = useStore();
  return useMemo(() => rides.reduce<number | null>((m, r) => (r.maxHr !== null && (m === null || r.maxHr > m) ? r.maxHr : m), null), [rides]);
}

/** Perfil de FC para zonas y carga, o null si no hay con qué estimar la FC máxima. */
export function useHrProfile(): ResolvedHr | null {
  const { settings } = useStore();
  const observed = useObservedMaxHr();
  const year = new Date(useNow(3_600_000)).getFullYear();
  const { hrMax, hrRest, birthYear, sex } = settings.athlete;
  return useMemo(
    () => resolveHrProfile({ hrMax, hrRest, birthYear, sex }, observed, new Date(year, 6, 1).getTime()),
    [hrMax, hrRest, birthYear, sex, observed, year],
  );
}

/** Sonido y vibración respetando los ajustes (Ajustes → Sonido y vibración). */
export function useFeedback() {
  const { settings } = useStore();
  const { sounds, haptics } = settings;
  return useMemo(
    () => ({
      sound: (name: SoundName) => {
        if (sounds) playSound(name);
      },
      haptic: (kind: HapticKind) => {
        if (haptics) vibrate(kind);
      },
    }),
    [sounds, haptics],
  );
}
