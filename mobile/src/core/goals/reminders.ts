import { periodStart, shiftPeriodStart, weekdayMondayFirst } from '../stats/periods';
import type { RideRecord } from '../stats/rides';
import { streak } from '../stats/streaks';
import { goalProgress } from './goals';
import type { Goal, GoalMetric, GoalPeriod, GoalProgress } from './goals';

export interface ReminderSettings {
  enabled: boolean;
  /** Hora local del recordatorio diario. */
  hour: number;
  minute: number;
  /** Avisar cuando una racha está por cortarse. */
  streaks: boolean;
  /** Avisar cuando una meta va atrasada o está por vencer. */
  goals: boolean;
}

export interface PlannedReminder {
  /** Instante en milisegundos (epoch). */
  at: number;
  title: string;
  body: string;
}

const PERIOD_NAME: Record<GoalPeriod, string> = { week: 'semanal', month: 'mensual', year: 'anual' };

function decimal(n: number, digits: number): string {
  return n.toFixed(digits).replace('.', ',');
}

/** Cantidad legible de una métrica de meta ("42,5 km", "3 salidas", "2 h 15 min", "850 m"). */
export function formatGoalAmount(metric: GoalMetric, value: number): string {
  switch (metric) {
    case 'rides': {
      const n = Math.ceil(value);
      return `${n} ${n === 1 ? 'salida' : 'salidas'}`;
    }
    case 'distance':
      return `${decimal(value / 1000, value < 100000 ? 1 : 0).replace(/,0$/, '')} km`;
    case 'time': {
      const min = Math.ceil(value / 60);
      const h = Math.floor(min / 60);
      return h > 0 ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`;
    }
    case 'elevation':
      return `${Math.ceil(value)} m`;
  }
}

/** Frase corta sobre una meta pendiente, o null si no hace falta avisar. */
export function goalNudge(p: GoalProgress): string | null {
  if (p.done) return null;
  const urgent = p.daysLeft <= (p.goal.period === 'week' ? 2 : p.goal.period === 'month' ? 5 : 30);
  if (!p.behind && !urgent) return null;
  const left = p.daysLeft === 1 ? 'queda hoy' : `quedan ${p.daysLeft} días`;
  return `Meta ${PERIOD_NAME[p.goal.period]}: te faltan ${formatGoalAmount(p.goal.metric, p.remaining)} (${left}).`;
}

/**
 * Arma los recordatorios de los próximos `days` días, a la hora elegida, suponiendo que no
 * hay salidas nuevas. Se recalcula cada vez que cambia el historial: si salís, los avisos que
 * ya no corresponden desaparecen al importar.
 */
export function planReminders(
  rides: RideRecord[],
  goals: Goal[],
  settings: ReminderSettings,
  autoPause: boolean,
  now: number,
  days = 7,
): PlannedReminder[] {
  if (!settings.enabled) return [];
  const out: PlannedReminder[] = [];
  const today = periodStart('day', now);
  for (let i = 0; i < days; i++) {
    const day = new Date(shiftPeriodStart('day', today, i));
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), settings.hour, settings.minute).getTime();
    if (at <= now) continue;

    const lines: string[] = [];
    if (settings.streaks) {
      const daily = streak(rides, 'day', at);
      if (!daily.doneThisPeriod && daily.current >= 2) {
        lines.push(`Llevás ${daily.current} días seguidos saliendo: si salís hoy, mantenés la racha.`);
      }
      const weekly = streak(rides, 'week', at);
      // La racha semanal se recuerda desde el viernes si la semana todavía no tiene salida.
      if (!weekly.doneThisPeriod && weekly.current >= 1 && weekdayMondayFirst(at) >= 4) {
        const n = weekly.current;
        lines.push(`Salí antes del domingo para no cortar tu racha de ${n} ${n === 1 ? 'semana' : 'semanas'}.`);
      }
    }
    if (settings.goals) {
      for (const g of goals) {
        const msg = goalNudge(goalProgress(g, rides, at, autoPause));
        if (msg) lines.push(msg);
      }
    }
    if (lines.length === 0) continue;
    out.push({
      at,
      title: '¿Salís hoy?',
      body: lines.join('\n'),
    });
  }
  return out;
}
