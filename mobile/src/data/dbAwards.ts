import { conn, loadSetting, saveSetting } from './db';

/** Premios y victorias ya vistos (para no festejar dos veces lo mismo). */

export function loadSeenKeys(): Set<string> {
  return new Set(conn().getAllSync<{ key: string }>('SELECT key FROM awards_seen').map((r) => r.key));
}

export async function markSeen(keys: string[], t: number = Date.now()): Promise<void> {
  if (keys.length === 0) return;
  const d = conn();
  d.withTransactionSync(() => {
    for (const k of keys) d.runSync('INSERT OR IGNORE INTO awards_seen (key, t) VALUES (?, ?)', [k, t]);
  });
}

/** Ya se hizo la primera pasada (la que marca todo el historial como visto). */
export const isAwardsInit = (): boolean => loadSetting<boolean>('awardsInit', false);
export const setAwardsInit = (): Promise<void> => saveSetting('awardsInit', true);
