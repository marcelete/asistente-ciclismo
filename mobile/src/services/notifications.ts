import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { formatGoalAmount, planReminders } from '../core/goals/reminders';
import type { ReminderSettings } from '../core/goals/reminders';
import type { Goal } from '../core/goals/goals';
import type { RideRecord } from '../core/stats/rides';

const CHANNEL = 'recordatorios';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelReady: Promise<unknown> | null = null;

/**
 * Crea el canal de Android una sola vez. Sin canal, Android descarta en silencio los avisos que
 * apuntan a él (por ejemplo, "¡Meta cumplida!" si nunca activaste los recordatorios).
 */
function ensureChannel(): Promise<unknown> {
  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Recordatorios y metas',
    importance: AndroidImportance.HIGH,
    // Con el celular bloqueado se ve que hay un aviso, pero no las metas ni las rachas.
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  }).catch((e: unknown) => {
    channelReady = null;
    throw e;
  });
  return channelReady;
}

/** Crea el canal de Android y pide permiso (Android 13+ solo muestra el pedido si hay un canal). */
export async function ensureNotificationPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Reemplaza todos los recordatorios programados por los que corresponden al historial actual.
 * Se llama al abrir la app, al importar salidas y al cambiar metas o ajustes.
 */
export async function rescheduleReminders(
  rides: RideRecord[],
  goals: Goal[],
  settings: ReminderSettings,
  autoPause: boolean,
): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!settings.enabled) return 0;
  await ensureChannel();
  const plan = planReminders(rides, goals, settings, autoPause, Date.now());
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
    });
  }
  return plan.length;
}

/** Cancela todos los recordatorios programados (por ejemplo, al borrar los datos). */
export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

const GOAL_NAME: Record<Goal['period'], string> = { week: 'semanal', month: 'mensual', year: 'anual' };

/** Aviso inmediato cuando una salida importada completa una meta (si Android dio permiso). */
export async function notifyGoalsCompleted(goals: Goal[]): Promise<void> {
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureChannel();
  for (const g of goals) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '¡Meta cumplida!',
        body: `Completaste tu meta ${GOAL_NAME[g.period]} de ${formatGoalAmount(g.metric, g.target)}.`,
      },
      trigger: { channelId: CHANNEL },
    });
  }
}

/** Aviso inmediato cuando un componente de la bici pasó los km que configuraste ("La cadena tiene 3.000 km"). */
export async function notifyPartsDue(items: { name: string; bike: string; km: number }[]): Promise<void> {
  if (items.length === 0 || !(await Notifications.getPermissionsAsync()).granted) return;
  await ensureChannel();
  for (const it of items) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Revisá tu bici',
        body: `${it.name} de ${it.bike}: ${Math.round(it.km).toLocaleString('es-AR')} km desde que lo pusiste.`,
      },
      trigger: { channelId: CHANNEL },
    });
  }
}

export async function sendTestNotification(): Promise<void> {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Asistente Ciclismo', body: 'Así se van a ver los recordatorios.' },
    trigger: { channelId: CHANNEL },
  });
}
