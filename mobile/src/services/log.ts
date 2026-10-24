import { describeError, redact } from '../core/log/redact';
import { appendLog } from '../data/db';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogTag =
  | 'app'
  | 'db'
  | 'import'
  | 'dem'
  | 'notif'
  | 'ui'
  | 'export'
  | 'weather'
  | 'map'
  | 'awards'
  | 'segments'
  | 'bikes';

/**
 * Registro local de la app. Todo mensaje pasa por `redact` (sin coordenadas, URIs ni nombres de
 * archivo) y se guarda solo en la base del celular: nada se envía afuera. En desarrollo también
 * se imprime en la consola.
 */
export function log(level: LogLevel, tag: LogTag, message: string, err?: unknown): void {
  const msg = redact(err === undefined ? message : `${message} — ${describeError(err)}`);
  if (__DEV__) {
    const line = `[${tag}] ${msg}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
  if (level === 'debug') return;
  // Si la base misma falló, no hay dónde guardar: se pierde la entrada, pero nunca rompe a quien llamó.
  try {
    appendLog({ t: Date.now(), level, tag, msg }).catch(() => {});
  } catch {
    // La base no abrió; el error original ya llega a la pantalla de error.
  }
}

/** Para usar en `.catch(...)`: registra el error en vez de descartarlo en silencio. */
export const logError =
  (tag: LogTag, what: string) =>
  (e: unknown): void =>
    log('error', tag, what, e);

/**
 * Registra los errores que nadie atrapó (en JS y en promesas sin `catch`). Se llama una vez al
 * arrancar; los errores fatales siguen al manejador original de React Native.
 */
export function installGlobalErrorHandlers(): void {
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    log('error', 'app', isFatal ? 'Error fatal no atrapado' : 'Error no atrapado', error);
    previous(error, isFatal);
  });
  // En desarrollo React Native ya usa este rastreador para sus avisos; solo se toma en release.
  if (__DEV__) return;
  const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (o: object) => void } })
    .HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id: number, reason: unknown) => log('error', 'app', 'Promesa rechazada sin manejar', reason),
    onHandled: () => {},
  });
}
