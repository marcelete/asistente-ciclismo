import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fitnessSeries, formStatus, localDateKey } from '../../core/load/training';
import { monthName, periodBuckets, periodLabel, periodRange, rideCounts, ridesIn, totals } from '../../core/stats/periods';
import type { Bucket, PeriodKind } from '../../core/stats/periods';
import { records } from '../../core/stats/records';
import type { RecordEntry } from '../../core/stats/records';
import { streak } from '../../core/stats/streaks';
import { useAwards } from '../../data/awards';
import { useStore } from '../../data/store';
import { BarChart } from '../charts/BarChart';
import { LineChart } from '../charts/LineChart';
import { Button, Card, Chip, EmptyState, Grid, Icon, Metric, ProgressBar, Screen, SectionTitle, Segmented, useStyles } from '../components';
import type { IconName } from '../components';
import {
  formatChange,
  formatDay,
  formatDuration,
  formatEffortDistance,
  formatHours,
  formatKm,
  formatKmh,
  formatMeters,
  formatNumber,
  formatRemaining,
} from '../format';
import { useHrProfile, useNow } from '../hooks';
import { PowerSaverNotice } from '../PowerSaverNotice';
import { openRide, RideRow } from '../RideRow';
import { makeStyles, useTheme } from '../theme';

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
];

const PREVIOUS: Record<PeriodKind, string> = {
  day: 'el día anterior',
  week: 'la semana anterior',
  month: 'el mes anterior',
  year: 'el año anterior',
};

type BarMetric = 'distance' | 'time' | 'elevation' | 'rides';

const BAR_METRICS: { value: BarMetric; label: string }[] = [
  { value: 'distance', label: 'Distancia' },
  { value: 'time', label: 'Tiempo' },
  { value: 'elevation', label: 'Desnivel' },
  { value: 'rides', label: 'Salidas' },
];

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function bucketValue(b: Bucket, m: BarMetric, autoPause: boolean): number {
  if (m === 'distance') return b.distance;
  if (m === 'time') return autoPause ? b.movingSec : b.elapsedSec;
  if (m === 'elevation') return b.elevationGain;
  return b.rides;
}

function formatBucketValue(v: number, m: BarMetric): string {
  if (m === 'distance') return `${formatKm(v)} km`;
  if (m === 'time') return formatHours(v);
  if (m === 'elevation') return `${formatMeters(v)} m`;
  return plural(v, 'salida', 'salidas');
}

function bucketTitle(b: Bucket, kind: PeriodKind): string {
  const d = new Date(b.start);
  if (kind === 'year') {
    const name = monthName(d.getMonth());
    return name[0].toUpperCase() + name.slice(1);
  }
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** Flechas para ir a los períodos anteriores y volver al actual. */
function PeriodNav({ label, offset, onChange }: { label: string; offset: number; onChange: (o: number) => void }) {
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  return (
    <View style={l.nav}>
      <Pressable style={l.arrow} onPress={() => onChange(offset - 1)} accessibilityRole="button" accessibilityLabel="Período anterior" hitSlop={8}>
        <Icon name="chevron_left" size={30} color={t.strong} />
      </Pressable>
      <View style={l.navLabel}>
        <Text style={[s.h2, s.center]} accessibilityLiveRegion="polite">
          {label}
        </Text>
        {offset !== 0 ? (
          <Pressable onPress={() => onChange(0)} accessibilityRole="button" hitSlop={8}>
            <Text style={l.link}>Volver al actual</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        style={l.arrow}
        onPress={() => onChange(Math.min(0, offset + 1))}
        disabled={offset === 0}
        accessibilityRole="button"
        accessibilityLabel="Período siguiente"
        accessibilityState={{ disabled: offset === 0 }}
        hitSlop={8}
      >
        <Icon name="chevron_right" size={30} color={offset === 0 ? t.faint : t.strong} />
      </Pressable>
    </View>
  );
}

function StreakCard() {
  const { rides } = useStore();
  const now = useNow();
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const daily = streak(rides, 'day', now);
  const weekly = streak(rides, 'week', now);
  const item = (title: string, st: typeof daily, unit: [string, string], pending: string) => (
    <View style={s.flex} accessible accessibilityLabel={`${title}: ${st.current}. Mejor: ${st.best}.`}>
      <Text style={s.label}>{title}</Text>
      <Text style={l.big}>
        {st.current}
        <Text style={s.unit}> {st.current === 1 ? unit[0] : unit[1]}</Text>
      </Text>
      <Text style={s.muted}>mejor: {st.best}</Text>
      {st.current > 0 && !st.doneThisPeriod ? <Text style={[l.pending, { color: t.warn }]}>{pending}</Text> : null}
    </View>
  );
  return (
    <Card>
      <View style={l.cardHead}>
        <Icon name="local_fire_department" color={t.metric.elevation} />
        <Text style={s.h3}>Rachas</Text>
      </View>
      <View style={l.row}>
        {item('Días seguidos', daily, ['día', 'días'], 'Salí hoy para seguirla')}
        {item('Semanas seguidas', weekly, ['semana', 'semanas'], 'Falta salir esta semana')}
      </View>
    </Card>
  );
}

/** Estado físico, fatiga y forma de los últimos 90 días, a partir de la FC. */
function FitnessCard() {
  const { rides } = useStore();
  const hr = useHrProfile();
  const now = useNow();
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  // El día de hoy en hora local: la serie se recalcula una vez por día, no en cada minuto.
  const today = localDateKey(now);
  const hasHr = rides.some((r) => r.hrHist !== null);
  const series = useMemo(() => {
    if (!hr || !hasHr) return [];
    const [y, m, d] = today.split('-').map(Number);
    return fitnessSeries(rides, hr.profile, new Date(y, m - 1, d, 12).getTime());
  }, [rides, hr, hasHr, today]);
  if (!hasHr) return null;
  if (!hr) {
    return (
      <Card>
        <View style={l.cardHead}>
          <Icon name="monitor_heart" color={t.metric.hr} />
          <Text style={s.h3}>Carga y forma</Text>
        </View>
        <Text style={s.body}>
          Para calcular tu carga de entrenamiento y tu estado de forma hace falta tu FC máxima o tu año de nacimiento.
        </Text>
        <Button title="Completar el perfil" variant="secondary" icon="person" onPress={() => router.push('/perfil')} />
      </Card>
    );
  }
  if (series.length === 0) return null;
  const last = series[series.length - 1];
  const form = formStatus(last.tsb);
  const toneColor = form.tone === 'good' ? t.good : form.tone === 'warn' ? t.warn : form.tone === 'bad' ? t.danger : t.link;
  const dayLabel = (i: number) => {
    const p = series[Math.round(Math.max(0, Math.min(series.length - 1, i)))];
    const [, m, d] = p.date.split('-');
    return `${Number(d)}/${Number(m)}`;
  };
  return (
    <Card>
      <View style={l.cardHead}>
        <Icon name="monitor_heart" color={t.metric.hr} />
        <Text style={[s.h3, s.flex]}>Carga y forma</Text>
        <Chip label={form.label} color={toneColor} />
      </View>
      <Text style={s.body}>{form.advice}</Text>
      <Grid min={96}>
        <Metric label="Estado físico" value={formatNumber(last.ctl)} hint="promedio de 6 semanas" size="sm" />
        <Metric label="Fatiga" value={formatNumber(last.atl)} hint="promedio de 1 semana" size="sm" />
        <Metric label="Forma" value={formatNumber(last.tsb)} hint="físico − fatiga" size="sm" />
      </Grid>
      <LineChart
        x={series.map((_, i) => i)}
        series={[
          { label: 'Estado físico', values: series.map((p) => p.ctl), color: t.metric.distance, fill: true, format: (v) => formatNumber(v) },
          { label: 'Fatiga', values: series.map((p) => p.atl), color: t.metric.time, format: (v) => formatNumber(v) },
        ]}
        formatX={dayLabel}
        formatTick={(v) => formatNumber(v)}
        zero
        minSpan={10}
        height={150}
        a11yLabel={`Estado físico ${formatNumber(last.ctl)}, fatiga ${formatNumber(last.atl)}, forma ${formatNumber(last.tsb)} en los últimos ${series.length} días`}
      />
      <Text style={s.muted}>
        Se calcula con la FC de cada salida (una hora a tu umbral suma 100 puntos).
        {hr.maxSource !== 'perfil' ? ' La FC máxima es estimada: cargala en Perfil para más precisión.' : ''}
      </Text>
    </Card>
  );
}

function RecordRow({
  icon,
  color,
  label,
  value,
  entry,
  when,
}: {
  icon: IconName;
  color: string;
  label: string;
  value: string;
  entry: { startT: number; rideId?: string };
  /** Cuándo fue, si no es la fecha de una salida ("12/10 al 18/10/2026"). */
  when?: string;
}) {
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const body = (
    <>
      <Icon name={icon} color={color} />
      <View style={s.flex}>
        <Text style={s.body}>{label}</Text>
        <Text style={s.muted}>{when ?? formatDay(entry.startT)}</Text>
      </View>
      <Text style={l.recordValue}>{value}</Text>
      {entry.rideId ? <Icon name="chevron_right" size={18} color={t.muted} /> : null}
    </>
  );
  if (!entry.rideId) {
    return (
      <View style={l.recordRow} accessible accessibilityLabel={`${label}: ${value}`}>
        {body}
      </View>
    );
  }
  const id = entry.rideId;
  return (
    <Pressable
      style={({ pressed }) => [l.recordRow, pressed && s.pressed]}
      onPress={() => openRide(id)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}, ${when ?? formatDay(entry.startT)}`}
    >
      {body}
    </Pressable>
  );
}

function RecordsCard() {
  const { rides } = useStore();
  const s = useStyles();
  const t = useTheme();
  const r = useMemo(() => records(rides), [rides]);
  const efforts = Object.entries(r.bestEfforts)
    .map(([d, e]) => [Number(d), e] as [number, RecordEntry])
    .sort((a, b) => a[0] - b[0]);
  const rows: [IconName, string, string, string, RecordEntry | null][] = [
    ['straighten', t.metric.distance, 'Salida más larga', r.longestDistance ? `${formatKm(r.longestDistance.value)} km` : '', r.longestDistance],
    ['schedule', t.metric.time, 'Más tiempo en movimiento', r.longestMoving ? formatDuration(r.longestMoving.value) : '', r.longestMoving],
    ['trending_up', t.metric.elevation, 'Mayor desnivel', r.maxGain ? `${formatMeters(r.maxGain.value)} m` : '', r.maxGain],
    ['landscape', t.metric.elevation, 'Altitud más alta', r.maxAltitude ? `${formatMeters(r.maxAltitude.value)} m` : '', r.maxAltitude],
    ['speed', t.metric.speed, 'Velocidad máxima', r.maxSpeed ? `${formatKmh(r.maxSpeed.value)} km/h` : '', r.maxSpeed],
    ['avg_pace', t.metric.speed, 'Mejor velocidad media (10 km o más)', r.fastestAvgSpeed ? `${formatKmh(r.fastestAvgSpeed.value)} km/h` : '', r.fastestAvgSpeed],
  ];
  return (
    <>
      <SectionTitle title="Récords" />
      <Card>
        {rows.map(([icon, color, label, value, entry]) =>
          entry ? <RecordRow key={label} icon={icon} color={color} label={label} value={value} entry={entry} /> : null,
        )}
        {r.biggestWeek ? (
          <RecordRow
            icon="calendar_month"
            color={t.metric.distance}
            label="Semana con más kilómetros"
            value={`${formatKm(r.biggestWeek.distance)} km`}
            entry={r.biggestWeek}
            when={periodLabel(periodRange('week', r.biggestWeek.startT))}
          />
        ) : null}
        {r.biggestMonth ? (
          <RecordRow
            icon="calendar_month"
            color={t.metric.distance}
            label="Mes con más kilómetros"
            value={`${formatKm(r.biggestMonth.distance)} km`}
            entry={r.biggestMonth}
            when={periodLabel(periodRange('month', r.biggestMonth.startT))}
          />
        ) : null}
      </Card>
      {efforts.length > 0 ? (
        <>
          <SectionTitle title="Mejores tiempos" />
          <Card>
            {efforts.map(([d, e]) => (
              <RecordRow
                key={d}
                icon="emoji_events"
                color={t.warn}
                label={formatEffortDistance(d)}
                value={`${formatDuration(e.value)} · ${formatKmh(d / e.value)} km/h`}
                entry={e}
              />
            ))}
            <Text style={s.muted}>El tramo más rápido de esa distancia dentro de una salida, con las paradas incluidas.</Text>
          </Card>
        </>
      ) : null}
    </>
  );
}

export function StatsScreen() {
  const { rides, settings } = useStore();
  const { result: awardsResult } = useAwards();
  const now = useNow();
  const s = useStyles();
  const t = useTheme();
  const [kind, setKind] = useState<PeriodKind>('week');
  const [offset, setOffset] = useState(0);
  const [barMetric, setBarMetric] = useState<BarMetric>('distance');
  const { autoPause } = settings;

  // Son sumas sobre unas cientos de salidas: se recalculan en cada render sin costo apreciable.
  const counts = rideCounts(rides, now);
  const range = periodRange(kind, now, offset);
  const prevRange = periodRange(kind, now, offset - 1);
  const inRange = ridesIn(rides, range);
  const tt = totals(inRange);
  const prev = totals(ridesIn(rides, prevRange));
  const time = autoPause ? tt.movingSec : tt.elapsedSec;
  const prevTime = autoPause ? prev.movingSec : prev.elapsedSec;
  const buckets = periodBuckets(rides, range);
  const current = offset === 0 ? buckets.findIndex((b) => now >= b.start && now < b.end) : -1;
  const barColor =
    barMetric === 'distance' ? t.metric.distance : barMetric === 'time' ? t.metric.time : barMetric === 'elevation' ? t.metric.elevation : t.link;
  const maxBucket = buckets.reduce((m, b) => Math.max(m, bucketValue(b, barMetric, autoPause)), 0);

  if (rides.length === 0) {
    return (
      <Screen title="Resumen">
        <PowerSaverNotice />
        <Card>
          <EmptyState
            icon="directions_bike"
            title="Todavía no hay salidas"
            text="Grabá con OpenTracks y elegí su carpeta de exportación en la pestaña Salidas: acá vas a ver tus totales, rachas y récords."
          >
            <Button title="Ir a Salidas" icon="folder_open" onPress={() => router.navigate('/salidas')} />
          </EmptyState>
        </Card>
      </Screen>
    );
  }

  const nextAward = awardsResult.next[0];
  const lastWins = awardsResult.victories.slice(-3).reverse();
  const a = settings.athlete;
  const profileIncomplete = a.weightKg === null || (a.hrMax === null && a.birthYear === null);

  return (
    <Screen title="Resumen">
      <PowerSaverNotice />
      {profileIncomplete ? (
        <Card>
          <Text style={s.body}>Completá tu perfil para ver la potencia estimada y las zonas de frecuencia cardíaca.</Text>
          <Button title="Completar perfil" icon="person" variant="secondary" onPress={() => router.push('/perfil')} />
        </Card>
      ) : null}
      {nextAward || lastWins.length > 0 ? (
        <Card onPress={() => router.navigate('/logros')} accessibilityLabel="Ver todos los logros">
          {nextAward ? (
            <>
              <Text style={s.label}>Próximo premio</Text>
              <Text style={s.body}>{nextAward.title}</Text>
              <ProgressBar fraction={nextAward.fraction} />
              <Text style={s.muted}>{formatRemaining(nextAward.target - nextAward.current, nextAward.unit)}</Text>
            </>
          ) : null}
          {lastWins.length > 0 ? (
            <>
              <Text style={s.label}>Últimas victorias</Text>
              {lastWins.map((e) => (
                <Text key={e.key} style={s.body}>
                  {e.title}
                  {e.detail ? ` · ${e.detail}` : ''}
                </Text>
              ))}
            </>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <Text style={s.label}>Cantidad de salidas</Text>
        <Grid min={64}>
          <Metric label="Hoy" value={String(counts.day)} size="sm" />
          <Metric label="Esta semana" value={String(counts.week)} size="sm" />
          <Metric label="Este mes" value={String(counts.month)} size="sm" />
          <Metric label="Este año" value={String(counts.year)} size="sm" />
        </Grid>
      </Card>

      <Segmented
        label="Período"
        options={KINDS}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setOffset(0);
        }}
      />
      <PeriodNav label={periodLabel(range)} offset={offset} onChange={setOffset} />

      <Card>
        <Metric
          size="lg"
          label="Distancia"
          icon="straighten"
          tone="distance"
          value={formatKm(tt.distance)}
          unit="km"
          delta={formatChange(tt.distance, prev.distance)}
        />
        <Grid min={96}>
          <Metric label="Salidas" icon="directions_bike" tone="distance" value={String(tt.rides)} delta={formatChange(tt.rides, prev.rides)} />
          <Metric label={autoPause ? 'En movimiento' : 'Tiempo'} icon="schedule" tone="time" value={formatHours(time)} delta={formatChange(time, prevTime)} />
          <Metric label="Desnivel +" icon="trending_up" tone="elevation" value={formatMeters(tt.elevationGain)} unit="m" delta={formatChange(tt.elevationGain, prev.elevationGain)} />
        </Grid>
        <Text style={s.muted}>
          Las flechas comparan con {PREVIOUS[kind]} ({periodLabel(prevRange)}): {plural(prev.rides, 'salida', 'salidas')},{' '}
          {formatKm(prev.distance)} km.
        </Text>
      </Card>

      {buckets.length > 0 && tt.rides > 0 ? (
        <Card>
          <Text style={s.h3}>{kind === 'year' ? 'Por mes' : 'Por día'}</Text>
          <Segmented label="Métrica del gráfico" options={BAR_METRICS} value={barMetric} onChange={setBarMetric} />
          <BarChart
            bars={buckets.map((b) => {
              const v = bucketValue(b, barMetric, autoPause);
              return { label: b.label, value: v, detail: `${bucketTitle(b, kind)}: ${formatBucketValue(v, barMetric)}` };
            })}
            color={barColor}
            current={current >= 0 ? current : undefined}
            maxLabel={maxBucket > 0 ? `máx ${formatBucketValue(maxBucket, barMetric)}` : undefined}
          />
        </Card>
      ) : null}

      {tt.rides > 0 ? (
        <Card>
          <Text style={s.h3}>Detalle del período</Text>
          <Grid min={140}>
            <Metric label={autoPause ? 'Vel. media en movimiento' : 'Vel. media total'} icon="speed" tone="speed" value={formatKmh(time > 0 ? tt.distance / time : 0)} unit="km/h" />
            <Metric label="Vel. máxima" icon="speed" tone="speed" value={formatKmh(tt.maxSpeed)} unit="km/h" />
            <Metric label="Altitud máxima" icon="landscape" tone="elevation" value={formatMeters(tt.maxAltitude)} unit="m" />
            <Metric label="Mayor desnivel en una salida" icon="trending_up" tone="elevation" value={formatMeters(tt.maxRideGain)} unit="m" />
            <Metric label="Salida más larga" icon="straighten" tone="distance" value={formatKm(tt.longestDistance)} unit="km" />
            <Metric label={autoPause ? 'Tiempo transcurrido' : 'En movimiento'} icon="timer" tone="time" value={formatHours(autoPause ? tt.elapsedSec : tt.movingSec)} />
            {kind !== 'day' ? <Metric label="Días con salida" icon="calendar_month" tone="time" value={String(tt.activeDays)} /> : null}
            <Metric label="Desnivel por km" icon="terrain" tone="elevation" value={tt.distance > 0 ? formatNumber((tt.elevationGain / tt.distance) * 1000, 1) : '--'} unit="m/km" />
            {tt.avgHr !== null ? <Metric label="FC media" icon="favorite" tone="hr" value={String(Math.round(tt.avgHr))} unit="lpm" /> : null}
            {tt.maxHr !== null ? <Metric label="FC máxima" icon="favorite" tone="hr" value={String(Math.round(tt.maxHr))} unit="lpm" /> : null}
          </Grid>
        </Card>
      ) : (
        <Card>
          <EmptyState icon="event_busy" title="Sin salidas en este período" text="Usá las flechas para ver otros períodos." />
        </Card>
      )}

      <StreakCard />
      <FitnessCard />

      {inRange.length > 0 ? (
        <>
          <SectionTitle title={`Salidas del período (${inRange.length})`} />
          {inRange.map((r) => (
            <RideRow key={r.id} ride={r} now={now} autoPause={autoPause} />
          ))}
        </>
      ) : null}

      <RecordsCard />
    </Screen>
  );
}

const useLocal = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: 12 },
  nav: { flexDirection: 'row', alignItems: 'center' },
  navLabel: { flex: 1, alignItems: 'center', gap: 2 },
  arrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  link: { color: t.link, fontSize: 13, fontWeight: '600' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  big: { color: t.strong, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pending: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  recordValue: { color: t.strong, fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 1 },
}));
