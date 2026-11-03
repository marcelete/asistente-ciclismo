import * as Speech from 'expo-speech';
import { log } from './log';

/** Voz del entrenador en vivo. Nunca lanza: si el celular no tiene voz en español, simplemente no habla. */
let language: string | null = null;

async function pickLanguage(): Promise<string> {
  if (language) return language;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const tags = voices.map((v) => v.language);
    language = tags.find((l) => l === 'es-AR') ?? tags.find((l) => l.startsWith('es-419')) ?? tags.find((l) => l.startsWith('es')) ?? 'es';
  } catch {
    language = 'es';
  }
  return language;
}

/** Dice el texto. Con `interrupt` corta lo que esté diciendo (para correcciones que no pueden esperar). */
export async function speak(text: string, interrupt = false): Promise<void> {
  if (!text) return;
  try {
    if (interrupt) Speech.stop();
    Speech.speak(text, { language: await pickLanguage(), rate: 1.05, onError: () => log('warn', 'ui', 'No se pudo hablar') });
  } catch (e) {
    log('warn', 'ui', 'No se pudo hablar', e);
  }
}

export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch {
    // Nada que cortar.
  }
}
