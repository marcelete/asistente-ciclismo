import { getApplicationIconAsync, openApplication } from 'expo-intent-launcher';
import { log } from './log';

/** Los dos paquetes de OpenTracks: la versión de F-Droid y la de Google Play. */
export const OPENTRACKS_PACKAGES = ['de.dennisguse.opentracks', 'de.dennisguse.opentracks.playStore'] as const;
export const OPENTRACKS_FDROID = 'https://f-droid.org/packages/de.dennisguse.opentracks/';

/**
 * Abre OpenTracks. Devuelve false si no está instalada (se sabe por el ícono: Android 11+ solo
 * deja ver los paquetes declarados en `<queries>`, ver plugins/withOpenTracksQueries).
 */
export async function openOpenTracks(): Promise<boolean> {
  for (const pkg of OPENTRACKS_PACKAGES) {
    try {
      const icon = await getApplicationIconAsync(pkg);
      if (icon) {
        openApplication(pkg);
        return true;
      }
    } catch (e) {
      log('warn', 'ui', 'No se pudo consultar OpenTracks', e);
    }
  }
  return false;
}
