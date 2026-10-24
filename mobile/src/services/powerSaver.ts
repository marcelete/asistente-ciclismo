import { isLowPowerModeEnabledAsync } from 'expo-battery';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
import { Alert } from 'react-native';
import { log } from './log';

/**
 * Con el ahorro de energía de Android encendido el sistema apaga el GPS cuando se apaga la pantalla
 * (política `location_mode`): OpenTracks deja de recibir ubicaciones y la salida queda cortada.
 * Se comprobó en un Galaxy A71 el 23/10/2026.
 */
export const POWER_SAVER_TITLE = 'Ahorro de energía activado';
export const POWER_SAVER_TEXT =
  'Con el ahorro de energía, Android apaga el GPS cuando se bloquea la pantalla: OpenTracks deja de grabar y la distancia sale mal. Desactivalo antes de salir.';

/** ¿Está encendido el ahorro de energía? Si no se puede saber (o no es un Android compatible), false. */
export async function isPowerSaverOn(): Promise<boolean> {
  try {
    return await isLowPowerModeEnabledAsync();
  } catch (e) {
    log('warn', 'ui', 'No se pudo leer el ahorro de energía', e);
    return false;
  }
}

/** Abre los ajustes de ahorro de energía del sistema. */
export async function openPowerSaverSettings(): Promise<void> {
  try {
    await startActivityAsync(ActivityAction.BATTERY_SAVER_SETTINGS);
  } catch (e) {
    log('warn', 'ui', 'No se pudieron abrir los ajustes de ahorro de energía', e);
  }
}

/** Aviso al abrir la app: una sola vez por arranque. */
let warnedThisLaunch = false;
export function warnPowerSaverOnLaunch(): void {
  if (warnedThisLaunch) return;
  warnedThisLaunch = true;
  Alert.alert(POWER_SAVER_TITLE, POWER_SAVER_TEXT, [
    { text: 'Entendido', style: 'cancel' },
    { text: 'Abrir ajustes', onPress: () => void openPowerSaverSettings() },
  ]);
}

/**
 * Antes de abrir OpenTracks para grabar: si el ahorro está encendido, avisa y deja elegir.
 * Devuelve true si hay que abrir OpenTracks igual.
 */
export async function confirmRecordingWithPowerSaver(): Promise<boolean> {
  if (!(await isPowerSaverOn())) return true;
  return new Promise((resolve) => {
    Alert.alert(
      POWER_SAVER_TITLE,
      POWER_SAVER_TEXT,
      [
        {
          text: 'Abrir ajustes',
          onPress: () => {
            void openPowerSaverSettings();
            resolve(false);
          },
        },
        { text: 'Grabar igual', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
