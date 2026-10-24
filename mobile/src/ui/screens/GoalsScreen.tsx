import { useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { goalProgress } from '../../core/goals/goals';
import type { Goal, GoalMetric, GoalPeriod } from '../../core/goals/goals';
import { formatGoalAmount } from '../../core/goals/reminders';
import { elapsedFraction, periodLabel } from '../../core/stats/periods';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { Button, Card, EmptyState, Field, Icon, Notice, ProgressBar, Screen, SectionTitle, Segmented, useStyles } from '../components';
import type { IconName, MetricTone } from '../components';
import { formatNumber, parseDecimal } from '../format';
import { useNow } from '../hooks';
import { makeStyles, useTheme } from '../theme';

const PERIODS: { value: GoalPeriod; label: string }[] = [
  { value: 'week', label: 'Semanal' },
  { value: 'month', label: 'Mensual' },
  { value: 'year', label: 'Anual' },
];

const METRICS: { value: GoalMetric; label: string; unit: string; toBase: number; max: number; icon: IconName; tone: MetricTone }[] = [
  { value: 'distance', label: 'Distancia', unit: 'km', toBase: 1000, max: 100_000, icon: 'straighten', tone: 'distance' },
  { value: 'rides', label: 'Salidas', unit: 'salidas', toBase: 1, max: 1000, icon: 'directions_bike', tone: 'distance' },
  { value: 'time', label: 'Tiempo', unit: 'horas', toBase: 3600, max: 5000, icon: 'schedule', tone: 'time' },
  { value: 'elevation', label: 'Desnivel', unit: 'm', toBase: 1, max: 1_000_000, icon: 'trending_up', tone: 'elevation' },
];

const PERIOD_NAME: Record<GoalPeriod, string> = { week: 'semanal', month: 'mensual', year: 'anual' };
const METRIC_NAME: Record<GoalMetric, string> = {
  distance: 'Distancia',
  rides: 'Salidas',
  time: 'Tiempo',
  elevation: 'Desnivel positivo',
};

/** El objetivo de una meta en las unidades del formulario ("150" km, "4,5" horas). */
function targetInput(g: Goal): string {
  const m = METRICS.find((x) => x.value === g.metric)!;
  const v = g.target / m.toBase;
  return Number.isInteger(v) ? String(v) : formatNumber(v, 1);
}

function GoalCard({ goal, now, autoPause, onEdit, onDelete }: { goal: Goal; now: number; autoPause: boolean; onEdit: () => void; onDelete: () => void }) {
  const { rides } = useStore();
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const p = goalProgress(goal, rides, now, autoPause);
  const m = METRICS.find((x) => x.value === goal.metric)!;
  const status = p.done
    ? { text: '¡Cumplida!', color: t.good, icon: 'check_circle' as IconName }
    : p.behind
      ? { text: 'Atrasada', color: t.warn, icon: 'warning' as IconName }
      : { text: 'Al día', color: t.good, icon: 'trending_up' as IconName };
  const pct = Math.floor(p.fraction * 100);
  const left = p.daysLeft === 1 ? 'queda hoy' : `quedan ${p.daysLeft} días`;
  return (
    <Card onPress={onEdit} accessibilityLabel={`Meta ${PERIOD_NAME[goal.period]} de ${METRIC_NAME[goal.metric].toLowerCase()}: ${formatGoalAmount(goal.metric, p.value)} de ${formatGoalAmount(goal.metric, goal.target)}, ${pct} por ciento. ${status.text}. Tocá para editarla.`}>
      <View style={l.head}>
        <Icon name={m.icon} color={t.metric[m.tone]} />
        <Text style={[s.h3, s.flex]}>
          {METRIC_NAME[goal.metric]} {PERIOD_NAME[goal.period]}
        </Text>
        <Pressable onPress={onDelete} hitSlop={12} accessibilityRole="button" accessibilityLabel="Borrar la meta" style={l.delete}>
          <Icon name="delete" size={22} color={t.muted} />
        </Pressable>
      </View>
      <View style={l.amountRow}>
        <Text style={l.amount}>{formatGoalAmount(goal.metric, p.value)}</Text>
        <Text style={s.muted}> de {formatGoalAmount(goal.metric, goal.target)}</Text>
        <Text style={[l.pct, { color: p.done ? t.good : t.strong }]}>{pct} %</Text>
      </View>
      <ProgressBar fraction={p.fraction} marker={elapsedFraction(p.range, now)} color={t.metric[m.tone]} />
      <View style={l.statusRow}>
        <Icon name={status.icon} size={18} color={status.color} />
        <Text style={[l.status, { color: status.color }]}>{status.text}</Text>
        <Text style={[s.muted, s.flex]}>
          {p.done ? periodLabel(p.range) : `· faltan ${formatGoalAmount(goal.metric, p.remaining)} (${left})`}
        </Text>
      </View>
      {!p.done ? (
        <Text style={s.muted}>
          {p.daysLeft > 1 ? `Necesitás ${formatGoalAmount(goal.metric, p.perDay)} por día. ` : ''}
          {p.projected !== null ? `A este ritmo terminás con ${formatGoalAmount(goal.metric, p.projected)}.` : ''}
        </Text>
      ) : null}
    </Card>
  );
}

export function GoalsScreen({ switcher }: { switcher?: ReactNode }) {
  const { goals, settings, addGoal, removeGoal } = useStore();
  const now = useNow();
  const s = useStyles();
  const [period, setPeriod] = useState<GoalPeriod>('week');
  const [metric, setMetric] = useState<GoalMetric>('distance');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const m = METRICS.find((x) => x.value === metric)!;
  const parsed = parseDecimal(amount);
  const invalid =
    amount.trim() === ''
      ? null
      : parsed === null
        ? 'Escribí solo números (por ejemplo, 150 o 7,5).'
        : parsed <= 0
          ? 'Tiene que ser mayor que cero.'
          : parsed > m.max
            ? `Como mucho ${formatNumber(m.max)} ${m.unit}.`
            : metric === 'rides' && !Number.isInteger(parsed)
              ? 'Las salidas van sin decimales.'
              : null;
  const valid = parsed !== null && invalid === null;
  const existing = goals.find((g) => g.period === period && g.metric === metric);

  const create = async () => {
    if (!valid || parsed === null) return;
    try {
      await addGoal({ period, metric, target: parsed * m.toBase });
      setSaved(existing ? 'Meta actualizada.' : 'Meta agregada.');
      setAmount('');
      setError(null);
    } catch (e) {
      log('error', 'ui', 'No se pudo guardar la meta', e);
      setError('No se pudo guardar la meta. Probá de nuevo.');
    }
  };

  const edit = (g: Goal) => {
    setPeriod(g.period);
    setMetric(g.metric);
    setAmount(targetInput(g));
    setSaved(null);
  };

  const confirmDelete = (g: Goal) =>
    Alert.alert('Borrar la meta', `¿Borrás la meta ${PERIOD_NAME[g.period]} de ${METRIC_NAME[g.metric].toLowerCase()}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeGoal(g.id);
            setError(null);
          } catch (e) {
            log('error', 'ui', 'No se pudo borrar la meta', e);
            setError('No se pudo borrar la meta. Probá de nuevo.');
          }
        },
      },
    ]);

  return (
    <Screen title="Metas" keyboard>
      {switcher}
      {goals.length === 0 ? (
        <Card>
          <EmptyState icon="flag" title="Todavía no tenés metas" text="Elegí un período, qué querés medir y cuánto. Los recordatorios te avisan si vas atrasado." />
        </Card>
      ) : (
        <>
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} now={now} autoPause={settings.autoPause} onEdit={() => edit(g)} onDelete={() => confirmDelete(g)} />
          ))}
          <Text style={s.muted}>La línea amarilla marca cuánto del período ya pasó. Tocá una meta para cambiarla.</Text>
        </>
      )}

      <SectionTitle title={existing ? 'Cambiar meta' : 'Nueva meta'} />
      <Card>
        <Segmented label="Período de la meta" options={PERIODS} value={period} onChange={setPeriod} />
        <Segmented label="Qué medir" options={METRICS.map(({ value, label }) => ({ value, label }))} value={metric} onChange={setMetric} />
        <Field
          label={`Objetivo ${PERIOD_NAME[period]}`}
          unit={m.unit}
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            setSaved(null);
          }}
          keyboardType="decimal-pad"
          placeholder={existing ? targetInput(existing) : 'Cantidad'}
          error={invalid}
          hint={
            metric === 'time'
              ? `Cuenta el tiempo ${settings.autoPause ? 'en movimiento (pausa automática activada)' : 'transcurrido'}.`
              : existing
                ? `Ya tenés esta meta: ${formatGoalAmount(existing.metric, existing.target)}. Guardar la reemplaza.`
                : undefined
          }
          returnKeyType="done"
          onSubmitEditing={create}
        />
        <Button title={existing ? 'Guardar cambio' : 'Agregar meta'} icon={existing ? 'edit' : 'add'} onPress={create} disabled={!valid} />
        {error ? <Notice text={error} tone="bad" /> : saved ? <Notice text={saved} tone="good" /> : null}
      </Card>
    </Screen>
  );
}

const useLocal = makeStyles((t) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  delete: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  amount: { color: t.strong, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pct: { marginLeft: 'auto', fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  status: { fontWeight: '700' },
}));
