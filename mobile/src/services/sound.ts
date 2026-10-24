import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { log } from './log';

/**
 * Sonidos de la app (los genera scripts/make-sounds.js). Respetan el modo silencio del teléfono y
 * no cortan la música que estés escuchando. Cada reproductor se crea al usarse la primera vez,
 * salvo el timbre de bici de la apertura, que se precarga.
 */
export type SoundName = 'bell' | 'ding' | 'fanfare' | 'sparkle' | 'chord';

const SOURCES: Record<SoundName, number> = {
  bell: require('../../assets/sounds/bell.wav'),
  ding: require('../../assets/sounds/ding.wav'),
  fanfare: require('../../assets/sounds/fanfare.wav'),
  sparkle: require('../../assets/sounds/sparkle.wav'),
  chord: require('../../assets/sounds/chord.wav'),
};

const players = new Map<SoundName, AudioPlayer>();
let modeReady: Promise<void> | null = null;

function setMode(): Promise<void> {
  modeReady ??= setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch((e: unknown) => {
    modeReady = null;
    throw e;
  });
  return modeReady;
}

function playerFor(name: SoundName): AudioPlayer {
  let p = players.get(name);
  if (!p) {
    p = createAudioPlayer(SOURCES[name]);
    players.set(name, p);
  }
  return p;
}

/** Deja listo el timbre para que suene sin demora al abrir la app. */
export async function preloadBell(): Promise<void> {
  try {
    await setMode();
    playerFor('bell');
  } catch (e) {
    log('warn', 'ui', 'No se pudo preparar el sonido', e);
  }
}

/** Reproduce un sonido desde el principio. Nunca lanza: un sonido que falla no rompe la pantalla. */
export async function playSound(name: SoundName): Promise<void> {
  try {
    await setMode();
    const p = playerFor(name);
    await p.seekTo(0);
    p.play();
  } catch (e) {
    log('warn', 'ui', 'No se pudo reproducir el sonido', e);
  }
}
