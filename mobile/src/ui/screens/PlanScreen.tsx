import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { PROGRAMS, currentWeek, isComplete, programById, programProgress } from '../../core/plan/programs';
import { weeklyPlan } from '../../core/plan/week';
import { DAY_NAMES, KIND_TITLE, sessionText } from '../../core/plan/templates';
import type { PlanGoal } from '../../core/plan/rules';
import { periodStart } from '../../core/stats/periods';
import { useStore } from '../../data/store';
import { abandonProgram, loadActiveProgram, loadCompletedPrograms, startProgram } from '../../data/programs';
import { log } from '../../services/log';
import { Button, Card, Chip, Field, Icon, Notice, ProgressBar, SectionTitle, Segmented, Stepper, useStyles } from '../components';
import { formatDate } from '../format';
import { useHrProfile, useNow } from '../hooks';
import { makeStyles, useTheme } from '../theme';

const GOALS: { value: PlanGoal; label: string }[] = [
  { value: 'general', label: 'Forma' },
  { value: 'endurance', label: 'Resistencia' },
  { value: 'climbing', label: 'Subidas' },
  { value: 'event', label: 'Evento' },
];

/** Metas → Plan: el plan de la semana, o el programa en curso, y los programas para empezar. */
export function PlanPanel() {
  const { rides, settings, updateSettings } = useStore();
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const now = useNow();
  const hr = useHrProfile();
  const plan = settings.plan;
  const [version, setVersion] = useState(0);
  const [eventText, setEventText] = useState(plan.eventDate ?? '');
  const [note, setNote] = useState<string | null>(null);

  // El programa activo vive en la base: se vuelve a leer cuando se empieza o se abandona uno.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const active = useMemo(() => loadActiveProgram(), [version, rides]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const completed = useMemo(() => loadCompletedPrograms(), [version, rides]);
  const def = active ? programById(active.id) : undefined;
  const progress = active && def ? programProgress(def, active.startT, rides) : null;

  const week = useMemo(
    () =>
      weeklyPlan({
        rides,
        goal: plan.goal,
        days: plan.days,
        hoursPerWeek: plan.hoursPerWeek,
        eventDate: plan.eventDate,
        hr: hr?.profile ?? null,
        now,
      }),
    [rides, plan, hr, now],
  );

  const setPlan = (patch: Partial<typeof plan>) => updateSettings({ plan: { ...plan, ...patch } }).catch((e) => log('error', 'ui', 'No se pudo guardar el plan', e));

  const saveEvent = (text: string) => {
    setEventText(text);
    if (text === '') setPlan({ eventDate: null });
    else if (/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T12:00:00`))) setPlan({ eventDate: text });
  };

  const begin = (id: string) =>
    startProgram(id, periodStart('week', now))
      .then(() => setVersion((v) => v + 1))
      .catch((e) => log('error', 'ui', 'No se pudo empezar el programa', e));

  const leave = () =>
    Alert.alert('Abandonar el programa', 'Volvés al plan semanal. Lo que hiciste hasta ahora no se pierde en tu historial.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Abandonar', style: 'destructive', onPress: () => abandonProgram().then(() => setVersion((v) => v + 1)).catch((e) => log('error', 'ui', 'No se pudo abandonar', e)) },
    ]);

  return (
    <>
      {note ? <Notice text={note} /> : null}

      {def && active && progress ? (
        <>
          <SectionTitle title="Programa en curso" />
          <Card>
            <Text style={s.h2}>{def.name}</Text>
            <ProgressBar fraction={progress.total > 0 ? progress.done / progress.total : 0} />
            <Text style={s.muted}>
              {progress.done} de {progress.total} sesiones · semana {Math.min(currentWeek(active.startT, now) + 1, def.weeks.length)} de {def.weeks.length}
            </Text>
            {isComplete(progress) ? <Notice tone="good" text="¡Terminaste el programa! Ganaste un premio." /> : null}
            {progress.weeks.map((sessions, w) => (
              <View key={w} style={l.week}>
                <Text style={[s.label, w === currentWeek(active.startT, now) ? { color: t.link } : null]}>Semana {w + 1}</Text>
                {sessions.map((x, i) => (
                  <View key={i} style={l.row}>
                    <Icon name={x.done ? 'check_circle' : 'radio_button_unchecked'} size={20} color={x.done ? t.good : t.muted} />
                    <Text style={[s.body, s.flex]}>{x.session.title}</Text>
                  </View>
                ))}
              </View>
            ))}
            <Button title="Abandonar el programa" variant="ghost" onPress={leave} />
          </Card>
        </>
      ) : (
        <>
          <SectionTitle title="Tu semana" />
          <Card>
            <Text style={s.label}>Objetivo</Text>
            <Segmented label="Objetivo" options={GOALS} value={plan.goal} onChange={(goal) => setPlan({ goal })} />
            {plan.goal === 'event' ? (
              <Field label="Fecha del evento" value={eventText} onChangeText={saveEvent} placeholder="2026-12-13" maxLength={10} hint="Formato AAAA-MM-DD. La semana anterior baja el volumen." />
            ) : null}
            <Text style={s.label}>Días para entrenar: {plan.days}</Text>
            <Stepper label={`${plan.days} días`} a11y="Días por semana" onMinus={() => setPlan({ days: Math.max(1, plan.days - 1) })} onPlus={() => setPlan({ days: Math.min(7, plan.days + 1) })} />
            <Text style={s.label}>Horas por semana: {plan.hoursPerWeek}</Text>
            <Stepper label={`${plan.hoursPerWeek} h`} a11y="Horas por semana" onMinus={() => setPlan({ hoursPerWeek: Math.max(1, plan.hoursPerWeek - 1) })} onPlus={() => setPlan({ hoursPerWeek: Math.min(30, plan.hoursPerWeek + 1) })} />
          </Card>

          <Card>
            <Text style={s.h3}>Plan de esta semana</Text>
            <Text style={s.muted}>
              Carga prevista: {Math.round(week.plan.targetLoad)} · estado físico {Math.round(week.ctl)} · fatiga {Math.round(week.atl)}
            </Text>
            {week.estimatedLoad && rides.length > 0 ? (
              <Notice tone="info" text="Sin frecuencia cardíaca, la carga se estima en unos 50 puntos por hora." />
            ) : null}
            {week.sessions.length === 0 ? <Text style={s.muted}>{week.plan.notes[0] ?? 'No hay sesiones para esta semana.'}</Text> : null}
            {week.sessions.map((x) => (
              <View key={x.day} style={l.session}>
                <Icon name={x.done ? 'check_circle' : 'radio_button_unchecked'} size={22} color={x.done ? t.good : t.muted} />
                <View style={s.flex}>
                  <Text style={s.h3}>
                    {DAY_NAMES[x.day]} · {KIND_TITLE[x.kind]}
                  </Text>
                  <Text style={s.body}>{sessionText(x.kind, x.durationMin, x.zone, hr?.profile ?? null)}</Text>
                </View>
              </View>
            ))}
            {week.plan.notes.map((n) => (
              <Text key={n} style={s.muted}>
                {n}
              </Text>
            ))}
          </Card>
        </>
      )}

      {!active ? (
        <>
          <SectionTitle title="Programas para seguir" />
          {PROGRAMS.map((p) => (
            <Card key={p.id}>
              <Text style={s.h3}>{p.name}</Text>
              <Text style={s.muted}>{p.description}</Text>
              {completed.some((c) => c.id === p.id) ? <Chip icon="emoji_events" label="Ya lo terminaste" color={t.warn} /> : null}
              <Button
                title="Empezar"
                icon="play_arrow"
                variant="secondary"
                onPress={() => {
                  setNote(null);
                  begin(p.id);
                }}
              />
            </Card>
          ))}
        </>
      ) : null}

      {completed.length > 0 ? (
        <Text style={s.muted}>
          Programas terminados: {completed.map((c) => `${programById(c.id)?.name ?? c.id} (${formatDate(c.t)})`).join(' · ')}
        </Text>
      ) : null}
    </>
  );
}

const useLocal = makeStyles(() => ({
  week: { gap: 4, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  session: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 6 },
}));
