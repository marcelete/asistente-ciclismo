import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';

/** Vibraciones cortas del sistema. Nunca lanzan: si el teléfono no las soporta, no pasa nada. */
export type HapticKind = 'confirm' | 'tick';

export async function vibrate(kind: HapticKind): Promise<void> {
  try {
    await performAndroidHapticsAsync(kind === 'confirm' ? AndroidHaptics.Confirm : AndroidHaptics.Segment_Tick);
  } catch {
    // Sin vibrador o sin permiso del sistema.
  }
}
