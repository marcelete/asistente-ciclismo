import { Vibration } from 'react-native';
import type { CoachEvent, CueKind } from '../core/coach/live/engine';
import type { CoachSettings } from '../data/settings';
import { playSound } from './sound';
import type { SoundName } from './sound';
import { speak } from './voice';

const SOUND: Partial<Record<CueKind, SoundName>> = {
  start: 'bell',
  count: 'ding',
  raise: 'ding',
  lower: 'ding',
  inRange: 'sparkle',
  half: 'ding',
  lastMinute: 'ding',
  finish: 'fanfare',
  hydrate: 'ding',
};

/** Patrón de vibración de cada aviso: una larga para subir, dos cortas para bajar. */
const BUZZ: Partial<Record<CueKind, number | number[]>> = {
  start: 200,
  count: 60,
  raise: 350,
  lower: [0, 120, 100, 120],
  inRange: [0, 60, 60, 60],
  finish: [0, 200, 100, 200, 100, 400],
  lastMinute: 150,
  half: 100,
  hydrate: [0, 80, 80, 80],
};

/** Da un aviso del entrenador por voz, sonido y vibración según lo que eligió la persona. */
export function deliver(e: CoachEvent, c: Pick<CoachSettings, 'voice' | 'beeps' | 'vibrate'>, soundsOn: boolean): void {
  const urgent = e.kind === 'raise' || e.kind === 'lower' || e.kind === 'count';
  if (c.voice && e.text) void speak(e.text, urgent);
  if (c.beeps && soundsOn && !(c.voice && e.kind === 'count')) {
    const s = SOUND[e.kind];
    if (s) void playSound(s);
  }
  const b = BUZZ[e.kind];
  if (c.vibrate && b !== undefined) Vibration.vibrate(b);
}
