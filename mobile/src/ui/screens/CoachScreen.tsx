import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { readiness } from '../../core/coach/readiness';
import type { CheckIn } from '../../core/coach/readiness';
import { lessonFor } from '../../core/coach/lessons';
import { EMPHASIS_LABEL, LONG_DAYS, MESO_LABEL, MICRO_HELP, MICRO_LABEL, PERIOD_LABEL, PREPARATION_LABEL, SHORT_DAYS, minutesText } from '../../core/coach/labels';
import { mesoAt } from '../../core/coach/periodization';
import { fitnessBefore, projectPlan, weekLabel } from '../../core/coach/state';
import { workoutById } from '../../core/coach/workouts';
import { resolveTarget } from '../../core/coach/zones';
import type { Block, CoachSession, Target } from '../../core/coach/types';
import type { ZoneContext } from '../../core/coach/zones';
import { RUN_RACE_LIMITS } from '../../data/settings';
import type { PlanGoal } from '../../core/plan/rules';
import { addDays, dateKey } from '../../core/coach/dates';
import { loadCheckIn, saveCheckIn } from '../../data/dbCoach';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { BarChart } from '../charts/BarChart';
import { useCoach, useRunThreshold, useZoneContext } from '../coachHooks';
import { Button, Card, Chip, EmptyState, Field, Icon, Notice, SectionTitle, Segmented, Toggle, useStyles } from '../components';
import { clockText, formatDate, formatPaceSec, parseClock } from '../format';
import { makeStyles, useTheme } from '../theme';
import { PlanPanel as ProgramsPanel } from './PlanScreen';

const GOALS: { value: PlanGoal; label: string }[] = [
  { value: 'general', label: 'Forma' },
  { value: 'endurance', label: 'Resistencia' },
  { value: 'climbing', label: 'Subidas' },
  { value: 'event', label: 'Evento' },
];

/** Un objetivo en texto: "28–30 km/h", "5:20–5:40 /km", "150–165 lpm". */
export function targetText(t: Target): string {
  if (t.kind === 'speed' && t.unit === 'min/km') {
    const fast = formatPaceSec(3600 / t.max);
    const slow = formatPaceSec(3600 / t.min);
    return fast === slow ? `${fast} /km` : `${fast}–${slow} /km`;
  }
  const n = (v: number) => String(v).replace('.', ',');
  return `${t.min === t.max ? n(t.min) : `${n(t.min)}–${n(t.max)}`} ${t.unit}`;
}

/** Una línea por bloque con sus números ("Calentamiento · 10 min · 120–135 lpm"). */
export function blockLine(b: Block, ctx: ZoneContext): string {
  const t = resolveTarget(b.intensity, ctx);
  const target = t ? ` · ${targetText(t)}` : '';
  return `${b.label} · ${minutesText(b.durationSec / 60)}${target}`;
}

/** Mismo trabajo (duración y objetivo) sin el número del bloque: sirve para contar repeticiones. */
const blockKey = (b: Block, ctx: ZoneContext) => blockLine({ ...b, label: b.label.replace(/\s*\d+$/, '') }, ctx);

/**
 * Circuito: una secuencia de 3 o más bloques que se repite entera al menos dos veces (la última
 * vuelta puede no tener su pausa final). Devuelve cuántas vueltas y el largo de la secuencia.
 */
function circuitAt(blocks: Block[], i: number, ctx: ZoneContext): { rounds: number; period: number; consumed: number } | null {
  const same = (a: Block | undefined, b: Block | undefined) => !!a && !!b && blockKey(a, ctx) === blockKey(b, ctx);
  const matches = (from: number, len: number) => {
    for (let k = 0; k < len; k++) if (!same(blocks[i + k], blocks[from + k])) return false;
    return true;
  };
  for (let p = 3; p <= 12; p++) {
    if (blocks[i + p - 1]?.role !== 'recovery') continue;
    // Un circuito tiene ejercicios distintos; "trabajo y pausa" repetidos se resumen como series.
    const kinds = new Set(blocks.slice(i, i + p).filter((b) => b.role !== 'recovery').map((b) => blockKey(b, ctx)));
    if (kinds.size < 2) continue;
    let rounds = 1;
    while (i + (rounds + 1) * p <= blocks.length && matches(i + rounds * p, p)) rounds++;
    let consumed = rounds * p;
    // La última vuelta termina sin su pausa.
    if (i + consumed + p - 1 <= blocks.length && matches(i + consumed, p - 1)) {
      rounds++;
      consumed += p - 1;
    }
    if (rounds >= 2) return { rounds, period: p, consumed };
  }
  return null;
}

/** Junta los bloques de trabajo y pausa que se repiten ("5 × Intervalo · 3 min · … (pausa: …)"). */
export function summarizeBlocks(blocks: Block[], ctx: ZoneContext): string[] {
  const lines: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    const c = circuitAt(blocks, i, ctx);
    if (c) {
      const seq = blocks.slice(i, i + c.period);
      const work = seq.filter((b) => b.role !== 'recovery');
      const pause = seq.find((b) => b.role === 'recovery');
      lines.push(`${c.rounds} vueltas: ${work.map((b) => b.label).join(', ')}`);
      lines.push(`   ${blockKey({ ...work[0], label: 'cada uno' }, ctx)}${pause ? ` · pausa ${minutesText(pause.durationSec / 60)}` : ''}`);
      i += c.consumed;
      continue;
    }
    const b = blocks[i];
    const rest = blocks[i + 1];
    if (b.role === 'work' && rest?.role === 'recovery') {
      const work = blockKey(b, ctx);
      const pause = blockKey(rest, ctx);
      let n = 1;
      let j = i + 2;
      while (j < blocks.length && blocks[j].role === 'work' && blockKey(blocks[j], ctx) === work) {
        n++;
        // La última repetición no lleva pausa detrás.
        if (blocks[j + 1]?.role === 'recovery' && blockKey(blocks[j + 1], ctx) === pause) j += 2;
        else {
          j += 1;
          break;
        }
      }
      if (n > 1) {
        lines.push(`${n} × ${work} (pausa: ${pause})`);
        i = j;
        continue;
      }
    }
    // Un bloque suelto va con su nombre completo ("Rodaje zona 2"): el número final no es una repetición.
    lines.push(blockLine(b, ctx));
    i++;
  }
  return lines;
}

function SessionCard({ s, done, ctx, expanded }: { s: CoachSession; done: 'done' | 'partial' | 'missed' | 'pending'; ctx: ZoneContext; expanded?: boolean }) {
  const st = useStyles();
  const l = useLocal();
  const t = useTheme();
  const def = s.workoutId === 'event' ? null : workoutById(s.workoutId);
  const blocks = useMemo(() => (def && expanded ? def.build(s.durationMin) : []), [def, expanded, s.durationMin]);
  const icon = done === 'done' ? 'check_circle' : done === 'partial' ? 'timelapse' : done === 'missed' ? 'cancel' : 'radio_button_unchecked';
  const color = done === 'done' ? t.good : done === 'missed' ? t.danger : t.muted;
  return (
    <View style={l.session}>
      <Icon name={icon} size={22} color={color} />
      <View style={st.flex}>
        <Text style={st.h3}>
          {LONG_DAYS[s.day].charAt(0).toUpperCase() + LONG_DAYS[s.day].slice(1)} · {s.name}
        </Text>
        <Text style={st.muted}>
          {minutesText(s.durationMin)} · carga {s.targetLoad}
          {s.zone > 0 ? ` · zona ${s.zone}` : ''}
        </Text>
        <View style={l.chips}>
          {s.preparations.map((p) => (
            <Chip key={p} label={PREPARATION_LABEL[p]} />
          ))}
        </View>
        {def ? <Text style={st.body}>{def.description}</Text> : null}
        {summarizeBlocks(blocks, ctx).map((line, i) => (
          <Text key={i} style={st.muted}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const CHECK_LABELS: { key: keyof CheckIn; label: string; low: string; high: string }[] = [
  { key: 'sleep', label: 'Sueño', low: 'mal', high: 'muy bien' },
  { key: 'mood', label: 'Ánimo', low: 'bajo', high: 'alto' },
  { key: 'fatigue', label: 'Cansancio', low: 'fresco', high: 'agotado' },
];

function CheckInCard({ today }: { today: string }) {
  const s = useStyles();
  const [value, setValue] = useState<CheckIn | null>(() => loadCheckIn(today));
  const draft: CheckIn = value ?? { sleep: 3, mood: 3, fatigue: 3 };
  const set = (key: keyof CheckIn, n: number) => {
    const next = { ...draft, [key]: n };
    setValue(next);
    try {
      saveCheckIn(today, next);
    } catch (e) {
      log('error', 'ui', 'No se pudo guardar el check-in', e);
    }
  };
  const r = value ? readiness(value) : null;
  return (
    <Card>
      <Text style={s.h3}>¿Cómo te sentís hoy?</Text>
      <Text style={s.muted}>De 1 a 5. Si estás cansado, el entrenador te baja la sesión.</Text>
      {CHECK_LABELS.map((c) => (
        <View key={c.key}>
          <Text style={s.label}>
            {c.label} ({c.low} → {c.high})
          </Text>
          <Segmented
            label={c.label}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
            value={value ? String(value[c.key]) : ''}
            onChange={(v) => set(c.key, Number(v))}
          />
        </View>
      ))}
      {r ? <Notice tone={r.mode === 'ok' ? 'good' : r.mode === 'easy' ? 'warn' : 'bad'} text={r.why} /> : null}
    </Card>
  );
}

/** Entrenar → Hoy: la sesión del día, cómo te sentís y la ficha de la semana. */
export function TodayPanel({ onSetup }: { onSetup: () => void }) {
  const s = useStyles();
  const coach = useCoach();
  const ctx = useZoneContext();
  const todayKey = dateKey(coach.now);
  const run = coach.sport === 'run';

  if (coach.otherSport) {
    return (
      <EmptyState
        icon={run ? 'directions_run' : 'directions_bike'}
        title={run ? 'Tu plan es de bici' : 'Tu plan es de correr'}
        text={`El entrenador sigue un deporte por vez. Armá un plan de ${run ? 'correr' : 'bici'} (el de ${run ? 'bici' : 'correr'} se reemplaza; lo que ya hiciste queda en tu historial), o volvé a ${run ? 'Bici' : 'Correr'} con el selector de arriba.`}
      >
        <Button title={`Armar un plan de ${run ? 'correr' : 'bici'}`} icon="flag" onPress={onSetup} />
      </EmptyState>
    );
  }
  if (!coach.macro) {
    return (
      <EmptyState icon="flag" title="Armá tu plan" text="Elegí tu objetivo y el tiempo que tenés cada día, y el entrenador te propone qué hacer hoy.">
        <Button title="Armar mi plan" icon="flag" onPress={onSetup} />
      </EmptyState>
    );
  }
  if (!coach.week) {
    return (
      <EmptyState icon="event" title="Tu plan terminó" text="Armá uno nuevo para seguir.">
        <Button title="Armar un plan nuevo" icon="flag" onPress={onSetup} />
      </EmptyState>
    );
  }
  const { micro } = coach.week;
  const mesos = mesoAt(coach.macro, micro.week);
  const todays = coach.results.filter((r) => r.session.date === todayKey);

  return (
    <>
      <Card>
        <Text style={s.h2}>Hoy</Text>
        {todays.length === 0 ? (
          <Text style={s.body}>Hoy es día de descanso. El cuerpo mejora mientras descansa: es la supercompensación.</Text>
        ) : (
          todays.map((r) => (
            <View key={r.session.workoutId}>
              <SessionCard s={r.session} done={r.status} ctx={ctx} expanded />
              {r.session.workoutId !== 'event' && r.status !== 'done' ? (
                <Button title="Empezar" icon="play_arrow" onPress={() => router.push({ pathname: '/entrenar', params: { mode: 'session', workout: r.session.workoutId, min: String(r.session.durationMin) } })} />
              ) : null}
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={s.h3}>{run ? 'Mantener ritmo' : 'Mantener velocidad'}</Text>
        <Text style={s.muted}>
          {run
            ? 'Elegí un ritmo por km y el entrenador te avisa si vas más rápido o más lento.'
            : 'Elegí una velocidad y el entrenador te avisa si te pasás o te quedás corto.'}
        </Text>
        <Button title="Probar" icon="speed" variant="secondary" onPress={() => router.push({ pathname: '/entrenar', params: { mode: 'steady' } })} />
      </Card>

      {run ? <RunLevelCard /> : null}

      <CheckInCard today={todayKey} />

      <Card>
        <Text style={s.h3}>
          Semana de {MICRO_LABEL[micro.kind].toLowerCase()} · bloque {mesos ? MESO_LABEL[mesos.kind].toLowerCase() : ''}
        </Text>
        <Text style={s.muted}>{MICRO_HELP[micro.kind]}</Text>
        {micro.why.map((w, i) => (
          <Text key={i} style={s.muted}>
            • {w}
          </Text>
        ))}
        {coach.week.fitness.estimated && coach.rides.length > 0 ? <Notice tone="info" text="Sin frecuencia cardíaca, la carga se estima en unos 50 puntos por hora." /> : null}
      </Card>

      {mesos ? (
        <Card>
          <Text style={s.label}>Ficha de la semana</Text>
          <Text style={s.h3}>{lessonFor(mesos.kind, micro.week - mesos.startWeek, coach.sport).title}</Text>
          <Text style={s.body}>{lessonFor(mesos.kind, micro.week - mesos.startWeek, coach.sport).text}</Text>
        </Card>
      ) : null}
    </>
  );
}

/** Correr: el ritmo de umbral y de dónde salió (o cómo conseguirlo). */
function RunLevelCard() {
  const s = useStyles();
  const th = useRunThreshold();
  return (
    <Card>
      <Text style={s.h3}>Tu ritmo de umbral</Text>
      {th ? (
        <>
          <Text style={s.body}>
            {formatPaceSec(3600 / th.kmh)} por km, según {th.detail}.
          </Text>
          <Text style={s.muted}>Es el ritmo que sostenés más o menos una hora. De acá salen los ritmos de cada sesión.</Text>
        </>
      ) : (
        <Text style={s.muted}>
          Todavía no sé tu ritmo: cargá una marca reciente en Plan, hacé el test de 30 minutos o importá carreras. Mientras tanto, las sesiones van por frecuencia cardíaca o por esfuerzo.
        </Text>
      )}
    </Card>
  );
}

/** Correr: la marca reciente (distancia, tiempo y fecha) con la que se calcula el umbral. */
function RunRaceCard() {
  const s = useStyles();
  const { settings, updateSettings } = useStore();
  const c = settings.coach;
  const race = c.runRace;
  const [km, setKm] = useState(race ? String(race.km).replace('.', ',') : '');
  const [time, setTime] = useState(race ? clockText(race.sec) : '');
  const [date, setDate] = useState(() => race?.date ?? dateKey(Date.now()));
  const [note, setNote] = useState<string | null>(null);
  const th = useRunThreshold();

  const save = () => {
    const k = Number(km.replace(',', '.'));
    const sec = parseClock(time);
    const L = RUN_RACE_LIMITS;
    if (!Number.isFinite(k) || k < L.km.min || k > L.km.max) return setNote(`La distancia va de ${L.km.min} a ${L.km.max} km.`);
    if (sec === null) return setNote('Escribí el tiempo como 50:00 o 1:45:30.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00`))) return setNote('La fecha va como AAAA-MM-DD.');
    const pace = sec / k;
    if (pace < L.paceSec.min || pace > L.paceSec.max) return setNote('Ese tiempo da un ritmo poco creíble: revisalo.');
    updateSettings({ coach: { ...c, runRace: { km: Math.round(k * 1000) / 1000, sec, date } } })
      .then(() => setNote(`Guardada: ${formatPaceSec(pace)} por km de promedio.`))
      .catch((e) => log('error', 'ui', 'No se pudo guardar la marca', e));
  };
  const clear = () => {
    setKm('');
    setTime('');
    setNote(null);
    updateSettings({ coach: { ...c, runRace: null } }).catch((e) => log('error', 'ui', 'No se pudo borrar la marca', e));
  };

  return (
    <Card>
      <Text style={s.h3}>Tu marca reciente</Text>
      <Text style={s.muted}>Una carrera o prueba a fondo de los últimos meses (5 km, 10 km, media…). Sirve para calcular tus ritmos.</Text>
      <Field label="Distancia" unit="km" value={km} onChangeText={setKm} keyboardType="numeric" maxLength={6} placeholder="10" />
      <Field label="Tiempo" value={time} onChangeText={setTime} maxLength={8} placeholder="50:00" hint="Minutos:segundos u horas:minutos:segundos." />
      <Field label="Fecha" value={date} onChangeText={setDate} maxLength={10} placeholder="2026-10-20" hint="Formato AAAA-MM-DD. Vale 6 meses." />
      <Button title="Guardar marca" icon="save" variant="secondary" onPress={save} />
      {race ? <Button title="Borrar la marca" variant="ghost" onPress={clear} /> : null}
      {note ? <Notice text={note} /> : null}
      {th ? <Text style={s.muted}>Ritmo de umbral: {formatPaceSec(3600 / th.kmh)} por km ({th.detail}).</Text> : null}
    </Card>
  );
}

type Scale = 'week' | 'month' | 'quarter' | 'year';
const SCALES: { value: Scale; label: string }[] = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Año' },
];

/** Entrenar → Plan: objetivo y tiempo disponible, el plan por semana, mes, trimestre y año, y los planes cortos. */
export function CoachPlanPanel() {
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const { settings, updateSettings } = useStore();
  const coach = useCoach();
  const ctx = useZoneContext();
  const c = settings.coach;
  const [scale, setScale] = useState<Scale>('week');
  const [eventText, setEventText] = useState(c.eventDate ?? '');
  const [kmText, setKmText] = useState(c.eventKm !== null ? String(c.eventKm) : '');
  const run = settings.sport === 'run';

  const patch = (p: Partial<typeof c>) => updateSettings({ coach: { ...c, ...p } }).catch((e) => log('error', 'ui', 'No se pudo guardar el plan', e));
  const setMinutes = (day: number, delta: number) => {
    const next = [...c.minutesByDay];
    next[day] = Math.max(0, Math.min(480, next[day] + delta));
    patch({ minutesByDay: next });
  };
  const saveEvent = (text: string) => {
    setEventText(text);
    if (text === '') patch({ eventDate: null });
    else if (/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T12:00:00`))) patch({ eventDate: text });
  };
  const saveKm = (text: string) => {
    setKmText(text);
    const n = Number(text.replace(',', '.'));
    patch({ eventKm: text === '' ? null : Number.isFinite(n) && n >= 1 && n <= 1000 ? n : c.eventKm });
  };
  const rebuild = () => {
    const make = () => {
      try {
        coach.create();
      } catch (e) {
        log('error', 'ui', 'No se pudo armar el plan', e);
      }
    };
    if (coach.otherSport) {
      Alert.alert(
        `Armar un plan de ${run ? 'correr' : 'bici'}`,
        `El plan de ${run ? 'bici' : 'correr'} se reemplaza: el entrenador sigue un deporte por vez. Lo que ya hiciste queda en tu historial.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Armar', onPress: make },
        ],
      );
      return;
    }
    if (!coach.macro) return make();
    Alert.alert('Rearmar el plan', 'Se arma un plan nuevo desde esta semana con el objetivo y el tiempo de arriba. Lo que ya hiciste queda en tu historial.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rearmar', onPress: make },
    ]);
  };

  const hasDays = c.minutesByDay.some((m) => m >= 20);
  const week = coach.macro ? coach.week?.micro.week ?? null : null;

  const projection = useMemo(() => {
    if (!coach.macro || week === null || !coach.week) return [];
    const to = scale === 'month' ? week + 3 : scale === 'quarter' ? week + 11 : scale === 'year' ? coach.macro.totalWeeks - 1 : week;
    const start = fitnessBefore(coach.rides, coach.hr, coach.extra, addDays(coach.macro.startT, week * 7));
    return projectPlan(coach.macro, coach.cfg, week, to, start);
  }, [coach.macro, coach.week, coach.rides, coach.hr, coach.extra, coach.cfg, scale, week]);

  const bars = projection.map((m) => ({
    label: weekLabel(m.startT),
    value: Math.round(m.targetLoad),
    detail: `Semana del ${weekLabel(m.startT)} · ${MICRO_LABEL[m.kind]} · carga ${Math.round(m.targetLoad)}`,
  }));

  return (
    <>
      <SectionTitle title={run ? 'Tu objetivo corriendo' : 'Tu objetivo en bici'} />
      {coach.otherSport ? (
        <Notice tone="warn" text={`Tu plan guardado es de ${coach.otherSport === 'bike' ? 'bici' : 'correr'}. Al armar uno de ${run ? 'correr' : 'bici'}, se reemplaza.`} />
      ) : null}
      <Card>
        <Segmented label="Objetivo" options={GOALS} value={c.goal} onChange={(goal) => patch({ goal })} />
        {c.goal === 'event' ? (
          <>
            <Field
              label={run ? 'Fecha de la carrera' : 'Fecha del evento'}
              value={eventText}
              onChangeText={saveEvent}
              placeholder="2027-03-14"
              maxLength={10}
              hint="Formato AAAA-MM-DD. El plan llega afinado a ese día."
            />
            <Field label={run ? 'Distancia de la carrera' : 'Distancia del evento'} unit="km" value={kmText} onChangeText={saveKm} keyboardType="numeric" maxLength={5} />
          </>
        ) : null}
        <Text style={s.label}>Minutos disponibles cada día (0 = libre)</Text>
        {SHORT_DAYS.map((d, i) => (
          <View key={d} style={l.dayRow}>
            <Text style={[s.body, l.dayName]}>{d}</Text>
            <View style={l.mini}>
              <Pressable style={l.miniBtn} onPress={() => setMinutes(i, -15)} accessibilityRole="button" accessibilityLabel={`Menos tiempo el ${LONG_DAYS[i]}`}>
                <Icon name="remove" size={20} color={t.link} />
              </Pressable>
              <Text style={[s.body, l.miniText]}>{c.minutesByDay[i] >= 20 ? minutesText(c.minutesByDay[i]) : 'Libre'}</Text>
              <Pressable style={l.miniBtn} onPress={() => setMinutes(i, 15)} accessibilityRole="button" accessibilityLabel={`Más tiempo el ${LONG_DAYS[i]}`}>
                <Icon name="add" size={20} color={t.link} />
              </Pressable>
            </View>
          </View>
        ))}
        <Toggle
          label="Fuerza, core y movilidad"
          hint={`Sesiones cortas en casa, en días sin ${run ? 'carrera' : 'salida'}.`}
          value={c.offBike}
          onChange={(v) => patch({ offBike: v })}
          icon="fitness_center"
        />
        {!hasDays ? <Notice tone="warn" text="Poné al menos un día con 20 minutos o más." /> : null}
        <Button
          title={coach.otherSport ? `Armar un plan de ${run ? 'correr' : 'bici'}` : coach.macro ? 'Rearmar el plan' : 'Armar mi plan'}
          icon="flag"
          disabled={!hasDays}
          onPress={rebuild}
        />
      </Card>

      {run ? <RunRaceCard /> : null}

      {coach.macro && coach.week ? (
        <>
          <SectionTitle title="Tu plan" />
          <Segmented label="Escala" options={SCALES} value={scale} onChange={setScale} />
          {coach.macro.eventT !== null ? (
            <Text style={s.muted}>
              Evento: {formatDate(coach.macro.eventT)}
              {coach.macro.eventKm ? ` · ${String(coach.macro.eventKm).replace('.', ',')} km` : ''}
            </Text>
          ) : null}

          {scale === 'week' ? (
            <Card>
              <Text style={s.h3}>
                Semana del {formatDate(coach.week.micro.startT)} · {MICRO_LABEL[coach.week.micro.kind]}
              </Text>
              <Text style={s.muted}>Carga prevista {Math.round(coach.week.micro.targetLoad)} · estado físico {Math.round(coach.week.fitness.ctl)} · fatiga {Math.round(coach.week.fitness.atl)}</Text>
              {coach.results.length === 0 ? <Text style={s.muted}>{coach.week.micro.why[0]}</Text> : null}
              {coach.results.map((r) => (
                <SessionCard key={`${r.session.date}-${r.session.workoutId}`} s={r.session} done={r.status} ctx={ctx} />
              ))}
              {coach.week.micro.why.map((w, i) => (
                <Text key={i} style={s.muted}>
                  • {w}
                </Text>
              ))}
            </Card>
          ) : (
            <Card>
              <Text style={s.h3}>Carga por semana (proyección)</Text>
              <Text style={s.muted}>Supone que cumplís el plan y llegás descansado a cada semana.</Text>
              <BarChart bars={bars} color={t.link} height={110} current={0} />
              {mesosInRange(coach.macro, projection.map((m) => m.week)).map((m) => (
                <View key={m.index} style={l.meso}>
                  <Text style={s.h3}>
                    {MESO_LABEL[m.kind]} · {EMPHASIS_LABEL[m.emphasis]}
                  </Text>
                  <Text style={s.muted}>
                    {PERIOD_LABEL[m.period]} · {m.weeks} semanas desde el {formatDate(addDays(coach.macro!.startT, m.startWeek * 7))}
                  </Text>
                  <View style={l.chips}>
                    {m.micros.map((k, i) => (
                      <Chip key={i} label={MICRO_LABEL[k]} color={k === 'recuperacion' ? t.good : k === 'impacto' ? t.warn : undefined} />
                    ))}
                  </View>
                </View>
              ))}
            </Card>
          )}
          <Text style={s.muted}>Cada semana el plan se rehace con tu forma real, sin mover lo que ya pasó.</Text>
        </>
      ) : null}

      {run ? null : (
        <>
          <SectionTitle title="Planes cortos" />
          <ProgramsPanel />
        </>
      )}
    </>
  );
}

function mesosInRange(macro: NonNullable<ReturnType<typeof useCoach>['macro']>, weeks: number[]) {
  if (weeks.length === 0) return [];
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return macro.mesocycles.filter((m) => m.startWeek + m.weeks - 1 >= first && m.startWeek <= last);
}

const useLocal = makeStyles(() => ({
  session: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayName: { width: 44 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127,127,127,0.18)' },
  miniText: { width: 92, textAlign: 'center' },
  meso: { marginTop: 12, gap: 2 },
}));
