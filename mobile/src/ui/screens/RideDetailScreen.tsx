import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { altitudeSeries, climbsFromProfile, estimateEnergy, gradeSeries, speedSeries } from '../../core/analysis/profileMetrics';
import type { ClimbDetail } from '../../core/analysis/profileMetrics';
import { bikeOfRide, energyParams } from '../../core/bikes/bikes';
import { PRIVACY_ZONE_M } from '../../core/elevation/privacy';
import { cumulativeGain, demAltitudes } from '../../core/elevation/profile';
import { hrZoneRanges } from '../../core/load/hr';
import { fitnessSeries, formStatus, hrLoad, zoneSeconds } from '../../core/load/training';
import { goalProgress } from '../../core/goals/goals';
import { formatGoalAmount } from '../../core/goals/reminders';
import { rideText } from '../../core/narrative/rideText';
import { programById, programProgress } from '../../core/plan/programs';
import { loadActiveProgram } from '../../data/programs';
import { records } from '../../core/stats/records';
import { rideAvgSpeed, rideElevation, rideTime, rideTitle, rideTypeLabel } from '../../core/stats/rides';
import { countsAsRide } from '../../core/stats/sport';
import { isDemPending, loadProfile } from '../../data/db';
import { useAwards } from '../../data/awards';
import { loadEfforts, loadEffortsOfRide, loadSegments, routeMembers, routeOfRide } from '../../data/dbSegments';
import { loadRideWeather } from '../../data/dbWeather';
import { createSegment, segmentFromProfile } from '../../services/segments';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { LineChart } from '../charts/LineChart';
import { ZoneChart } from '../charts/ZoneChart';
import { BikePicker } from '../BikePicker';
import { RideMap } from '../map/RideMap';
import { Button, Card, Chip, EmptyState, Grid, Icon, Metric, Notice, Screen, SectionTitle, Toggle, useStyles } from '../components';
import {
  cardinal,
  formatClock,
  formatDuration,
  formatEffortDistance,
  formatKm,
  formatKmh,
  formatMeters,
  formatNumber,
} from '../format';
import { useHrProfile } from '../hooks';
import { makeStyles, useTheme } from '../theme';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function longDate(startT: number, endT: number): string {
  const d = new Date(startT);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} · ${formatClock(startT)} a ${formatClock(endT)}`;
}

const km = (m: number) => `${formatKm(m)} km`;

function ClimbRow({ c, index, onSave }: { c: ClimbDetail; index: number; onSave?: () => void }) {
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  return (
    <View style={l.climb}>
      <View style={l.climbHead}>
        <Icon name="terrain" color={t.metric.elevation} />
        <Text style={[s.h3, s.flex]}>
          Subida {index + 1} · km {formatNumber(c.startDist / 1000, 1)}
        </Text>
        {c.category ? <Chip label={c.category === 'HC' ? 'Fuera de categoría' : `Categoría ${c.category}`} color={t.metric.elevation} /> : null}
      </View>
      <Grid min={92} gap={10}>
        <Metric size="sm" label="Largo" value={formatKm(c.length)} unit="km" />
        <Metric size="sm" label="Desnivel" value={formatMeters(c.gain)} unit="m" />
        <Metric size="sm" label="Pendiente media" value={formatNumber(c.avgGrade, 1)} unit="%" />
        <Metric size="sm" label="Pendiente máx." value={formatNumber(c.maxGrade, 1)} unit="%" />
        {c.durationSec ? <Metric size="sm" label="Tiempo" value={formatDuration(c.durationSec)} /> : null}
        {c.vam ? <Metric size="sm" label="Ascenso (VAM)" value={formatNumber(c.vam)} unit="m/h" /> : null}
        {c.avgSpeed ? <Metric size="sm" label="Velocidad" value={formatKmh(c.avgSpeed)} unit="km/h" /> : null}
      </Grid>
      {onSave ? <Button title="Guardar subida como segmento" icon="add_road" variant="secondary" onPress={onSave} /> : null}
    </View>
  );
}

export function RideDetailScreen({ id }: { id: string }) {
  const { change, rides, allRides, bikes, settings, refreshElevation, setRideBike, setRideCounted, reloadAll } = useStore();
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const hr = useHrProfile();
  const awardsMap = useAwards().byRide;
  const awardsOfRide = useMemo(() => awardsMap.get(id) ?? [], [awardsMap, id]);
  // Pasadas por segmentos y veces que se repitió el recorrido; se vuelven a leer cuando cambia algo.
  const segmentEfforts = useMemo(() => {
    const mine = loadEffortsOfRide(id);
    if (mine.length === 0) return [];
    const names = new Map(loadSegments().map((x) => [x.id, x.name] as const));
    const all = loadEfforts();
    return mine.map((e) => ({
      segmentId: e.segmentId,
      startT: e.startT,
      duration: e.duration,
      name: names.get(e.segmentId) ?? 'Segmento',
      rank: 1 + all.filter((o) => o.segmentId === e.segmentId && o.duration < e.duration).length,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, change.seq]);
  const routeTimes = useMemo(() => {
    const route = routeOfRide(id);
    return route ? (routeMembers().get(route)?.length ?? 0) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, change.seq]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ride = allRides.find((r) => r.id === id);
  // Se vuelve a leer cuando cambia la salida (por ejemplo, al llegar la altitud del mapa).
  const profile = useMemo(() => (ride ? loadProfile(ride.id) : null), [ride]);
  const demPending = useMemo(() => (ride ? isDemPending(ride.id) : false), [ride]);
  const allRecords = useMemo(() => records(rides), [rides]);

  const derived = useMemo(() => {
    if (!profile || profile.length < 2) return null;
    const alt = altitudeSeries(profile);
    const d = profile.map((p) => p.d);
    const dem = demAltitudes(profile);
    const gps = profile.every((p) => p.gps !== null) ? profile.map((p) => p.gps!) : null;
    const speeds = speedSeries(profile);
    const hasSpeed = speeds.some((v) => v !== null);
    const hrValues = profile.map((p) => p.hr);
    const hasHr = hrValues.filter((v) => v !== null).length > profile.length / 2;
    return {
      d,
      alt,
      gps,
      dem,
      grade: alt ? gradeSeries(profile, alt.values) : null,
      speed: hasSpeed ? speeds.map((v) => (v === null ? null : v * 3.6)) : null,
      hr: hasHr ? hrValues : null,
      cum: dem ? cumulativeGain(dem) : gps ? cumulativeGain(gps, 5, 5) : null,
      climbs: climbsFromProfile(profile, alt),
    };
  }, [profile]);

  const autoPauseSetting = settings.autoPause;
  const bike = ride ? bikeOfRide(ride, bikes) : null;
  const a = settings.athlete;
  const params = useMemo(
    () => energyParams(a.weightKg, bike, { bike: a.bike, bikeKg: a.bikeKg }),
    [a.weightKg, a.bike, a.bikeKg, bike],
  );
  const mass = params?.massKg ?? null;
  // `change.seq` avisa cuando llega el clima de esta salida.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weatherRow = useMemo(() => loadRideWeather(id), [id, change.seq]);
  const weather = weatherRow?.data ?? null;
  const energy = useMemo(
    () => (profile && params ? estimateEnergy(profile, { ...params, env: weather }, derived?.alt) : null),
    [profile, params, derived, weather],
  );

  const { goals } = useStore();
  const analysis = useMemo(() => {
    if (!ride) return [];
    const upTo = rides.filter((r) => r.startT <= ride.startT);
    const series = hr ? fitnessSeries(upTo, hr.profile, ride.startT, 90) : [];
    const lastForm = series.length > 0 ? series[series.length - 1] : null;
    const climbs = derived?.climbs ?? [];
    const hardest = climbs.length > 0 ? climbs.reduce((m, c) => (c.gain > m.gain ? c : m)) : null;
    const open = goals.map((g) => goalProgress(g, rides, ride.startT, autoPauseSetting)).find((g) => !g.done && g.fraction > 0);
    const active = loadActiveProgram();
    const def = active ? programById(active.id) : undefined;
    const prog = active && def ? programProgress(def, active.startT, rides) : null;
    return rideText({
      ride,
      history: rides,
      autoPause: autoPauseSetting,
      form: lastForm ? formStatus(lastForm.tsb) : null,
      hardestClimb: hardest,
      zoneSeconds: hr && ride.hrHist ? zoneSeconds(ride.hrHist, hr.profile) : null,
      weather,
      victories: awardsOfRide,
      routeTimes,
      goalNudge: open
        ? `Para tu meta ${open.goal.period === 'week' ? 'semanal' : open.goal.period === 'month' ? 'mensual' : 'anual'} te faltan ${formatGoalAmount(open.goal.metric, open.remaining)}.`
        : null,
      program: def && prog ? `${def.name}: ${prog.done} de ${prog.total} sesiones hechas.` : null,
    });
  }, [ride, rides, hr, derived, goals, autoPauseSetting, weather, awardsOfRide, routeTimes]);

  if (!ride) {
    return (
      <Screen header={false}>
        <EmptyState icon="search_off" title="No se encontró la salida" text="Puede que se haya borrado.">
          <Button title="Volver" variant="secondary" onPress={() => router.back()} />
        </EmptyState>
      </Screen>
    );
  }

  const elev = rideElevation(ride);
  const { autoPause } = settings;
  const time = rideTime(ride, autoPause);
  const type = rideTypeLabel(ride);
  const zones = hr && ride.hrHist ? zoneSeconds(ride.hrHist, hr.profile) : null;
  const load = hrLoad(ride.hrHist, hr?.profile ?? null);
  const kmLabel = (x: number) => `${formatNumber(x / 1000, x < 10000 ? 1 : 0)} km`;

  const saveClimb = async (c: ClimbDetail, index: number) => {
    if (!profile) return;
    const seg = segmentFromProfile(`Subida ${index + 1} · km ${formatNumber(c.startDist / 1000, 1)}`, profile.slice(c.startIndex, c.endIndex + 1), ride.id);
    if (!seg) {
      setNote('El segmento tiene que medir entre 300 m y 50 km.');
      return;
    }
    try {
      await createSegment(seg);
      reloadAll([]);
      setNote(`Segmento guardado: "${seg.name}". Se compara con todas tus salidas; lo ves en Salidas → Segmentos.`);
    } catch (e) {
      log('error', 'segments', 'No se pudo guardar el segmento', e);
      setNote('No se pudo guardar el segmento.');
    }
  };

  const retry = async () => {
    setBusy(true);
    try {
      setNote(await refreshElevation());
    } catch (e) {
      log('error', 'dem', 'Falló la consulta manual de altitud', e);
      setNote('No se pudo consultar la altitud del mapa. Probá más tarde.');
    } finally {
      setBusy(false);
    }
  };

  const efforts = Object.entries(ride.efforts ?? {})
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  return (
    <Screen header={false}>
      {/* El nombre va en el encabezado; acá abajo, la fecha y los datos de la grabación. */}
      <Stack.Screen options={{ title: rideTitle(ride) }} />
      <View style={l.titleBlock}>
        <Text style={s.body}>{longDate(ride.startT, ride.endT)}</Text>
        <View style={l.chips}>
          {type ? <Chip icon="directions_bike" label={type} /> : null}
          <Chip
            icon={elev.source === 'dem' ? 'map' : 'satellite_alt'}
            label={elev.source === 'dem' ? 'Altitud del mapa' : 'Altitud del GPS'}
          />
          {ride.avgHr !== null ? <Chip icon="favorite" label="Con FC" color={t.metric.hr} /> : null}
        </View>
      </View>

      {analysis.length > 0 ? (
        <Card>
          <Text style={s.h3}>Análisis</Text>
          {analysis.map((line) => (
            <Text key={line} style={s.body}>
              {line}
            </Text>
          ))}
        </Card>
      ) : null}

      {awardsOfRide.length > 0 ? (
        <Card>
          <Text style={s.h3}>Logros de esta salida</Text>
          <View style={l.chips}>
            {awardsOfRide.map((e) => (
              <Chip key={e.key} icon="emoji_events" label={e.detail ? `${e.title} · ${e.detail}` : e.title} color={t.warn} />
            ))}
          </View>
        </Card>
      ) : null}

      {!countsAsRide(ride) ? (
        <Notice tone="warn" text="Esta actividad no cuenta como salida en bici: no suma a totales, rachas, metas ni récords. Si OpenTracks se equivocó de tipo, activá el interruptor de abajo." />
      ) : null}

      <Card>
        <Grid min={130}>
          <Metric size="lg" label="Distancia" icon="straighten" tone="distance" value={formatKm(ride.distance)} unit="km" />
          <Metric size="lg" label={autoPause ? 'En movimiento' : 'Tiempo'} icon="schedule" tone="time" value={formatDuration(time)} />
          <Metric size="lg" label="Vel. media" icon="speed" tone="speed" value={formatKmh(rideAvgSpeed(ride, autoPause))} unit="km/h" />
          <Metric size="lg" label="Desnivel +" icon="trending_up" tone="elevation" value={formatMeters(elev.gain)} unit="m" />
        </Grid>
      </Card>

      <Card>
        <Text style={s.h3}>Detalle</Text>
        <Grid min={130}>
          <Metric label={autoPause ? 'Tiempo transcurrido' : 'En movimiento'} icon="timer" tone="time" value={formatDuration(autoPause ? ride.elapsedSec : ride.movingSec)} />
          <Metric label="Vel. máxima" icon="speed" tone="speed" value={formatKmh(ride.maxSpeed)} unit="km/h" />
          <Metric
            label={autoPause ? 'Vel. media con paradas' : 'Vel. media en movimiento'}
            icon="avg_pace"
            tone="speed"
            value={formatKmh(rideAvgSpeed(ride, !autoPause))}
            unit="km/h"
          />
          <Metric label="Desnivel −" icon="trending_down" tone="elevation" value={formatMeters(elev.loss)} unit="m" />
          <Metric label="Altitud máxima" icon="landscape" tone="elevation" value={formatMeters(elev.maxAltitude)} unit="m" />
          <Metric label="Altitud mínima" icon="landscape" tone="elevation" value={formatMeters(elev.minAltitude)} unit="m" />
          <Metric
            label="Desnivel por km"
            icon="terrain"
            tone="elevation"
            value={ride.distance > 0 ? formatNumber((elev.gain / ride.distance) * 1000, 1) : '--'}
            unit="m/km"
          />
          {ride.avgHr !== null ? <Metric label="FC media" icon="favorite" tone="hr" value={String(Math.round(ride.avgHr))} unit="lpm" /> : null}
          {ride.maxHr !== null ? <Metric label="FC máxima" icon="favorite" tone="hr" value={String(Math.round(ride.maxHr))} unit="lpm" /> : null}
          {load !== null ? <Metric label="Carga" icon="monitor_heart" tone="hr" value={formatNumber(load)} hint="hrTSS" /> : null}
          {energy ? <Metric label="Potencia media" icon="bolt" tone="power" value={formatNumber(energy.avgPower)} unit="W" hint="estimada" /> : null}
          {energy ? <Metric label="Trabajo" icon="bolt" tone="power" value={formatNumber(energy.workKj)} unit="kJ" hint="estimado" /> : null}
          {energy ? <Metric label="Calorías" icon="local_fire_department" tone="power" value={formatNumber(energy.kcal)} unit="kcal" hint="aprox." /> : null}
        </Grid>
        {!mass ? (
          <Text style={s.muted}>
            Cargá tu peso en Ajustes → Perfil para estimar la potencia, el trabajo y las calorías.
          </Text>
        ) : energy ? (
          <Text style={s.muted}>
            Potencia y calorías estimadas con un modelo físico (peso, bici, pendiente y velocidad), sin medidor ni viento.
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text style={s.h3}>Esta salida</Text>
        <Toggle
          icon="directions_bike"
          label="Contar como salida en bici"
          hint="Si OpenTracks se equivocó de tipo, forzá que cuente (o no) en totales, rachas, metas y récords."
          value={countsAsRide(ride)}
          onChange={(v) => setRideCounted(ride.id, v).catch((e) => log('error', 'ui', 'No se pudo cambiar si cuenta', e))}
        />
        {bikes.length > 0 ? (
          <>
            <Text style={s.label}>Bici de esta salida</Text>
            <BikePicker
              bikes={bikes}
              value={bike?.id ?? null}
              onChange={(bid) => setRideBike(ride.id, bid).catch((e) => log('error', 'ui', 'No se pudo cambiar la bici', e))}
            />
          </>
        ) : (
          <Button title="Cargar mi bici" variant="secondary" icon="directions_bike" onPress={() => router.push('/bicis')} />
        )}
      </Card>

      {segmentEfforts.length > 0 || routeTimes > 1 ? (
        <Card>
          <Text style={s.h3}>Segmentos y recorrido</Text>
          {routeTimes > 1 ? <Chip icon="repeat" label={`Hiciste este recorrido ${routeTimes} veces`} /> : null}
          {segmentEfforts.map((e) => (
            <Text key={`${e.segmentId}-${e.startT}`} style={s.body}>
              {e.name}: {formatDuration(e.duration)} · {e.rank === 1 ? 'tu mejor marca' : `${e.rank}.ª mejor marca`}
            </Text>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={s.h3}>Clima</Text>
        {weather ? (
          <Grid min={110}>
            {weather.tempC !== null ? <Metric size="sm" label="Temperatura" value={formatNumber(weather.tempC, 0)} unit="°C" /> : null}
            {weather.windMs !== null ? (
              <Metric
                size="sm"
                label="Viento"
                value={formatNumber(weather.windMs * 3.6, 0)}
                unit="km/h"
                hint={weather.windDirDeg !== null ? `del ${cardinal(weather.windDirDeg)}` : undefined}
              />
            ) : null}
            {weather.gustMs !== null ? <Metric size="sm" label="Ráfagas" value={formatNumber(weather.gustMs * 3.6, 0)} unit="km/h" /> : null}
            {weather.humidity !== null ? <Metric size="sm" label="Humedad" value={formatNumber(weather.humidity, 0)} unit="%" /> : null}
          </Grid>
        ) : (
          <Text style={s.muted}>
            {weatherRow?.status === 'far'
              ? 'La salida fue a más de 50 km de tu ciudad: no se consultó el clima.'
              : !settings.city
                ? 'Elegí tu ciudad en Ajustes → Perfil para ver el clima de cada salida.'
                : !settings.weatherOnline
                  ? 'La consulta de clima está apagada en Ajustes → Privacidad.'
                  : 'El clima de esta salida todavía no llegó; se consulta solo cuando hay internet.'}
          </Text>
        )}
        {weatherRow?.status === 'provisional' ? <Text style={s.muted}>Datos provisorios: se confirman pasada una semana.</Text> : null}
        {weather ? <Text style={s.muted}>Del centro de tu ciudad, promediado durante la salida. La potencia estimada lo usa (aire y viento).</Text> : null}
      </Card>

      <RideMap rideId={ride.id} height={220} onExpand={() => router.push({ pathname: '/mapa/[id]', params: { id: ride.id } })} version={change.seq} />

      {derived?.alt ? (
        <Card>
          <Text style={s.h3}>Altitud</Text>
          <LineChart
            x={derived.d}
            series={[
              ...(derived.dem && derived.gps
                ? [{ label: 'GPS', values: derived.gps, color: t.metric.gps, format: (v: number) => `${formatMeters(v)} m` }]
                : []),
              {
                label: derived.alt.source === 'dem' ? 'Mapa de terreno' : 'GPS',
                values: derived.alt.values,
                color: derived.alt.source === 'dem' ? t.metric.dem : t.metric.gps,
                fill: true,
                format: (v: number) => `${formatMeters(v)} m`,
              },
              ...(derived.grade
                ? [
                    {
                      label: 'Pendiente',
                      values: derived.grade,
                      color: t.metric.elevation,
                      readoutOnly: true,
                      format: (v: number) => `${v > 0 ? '+' : ''}${formatNumber(v, 1)} %`,
                    },
                  ]
                : []),
            ]}
            formatX={kmLabel}
            formatTick={(v) => formatMeters(v)}
            minSpan={20}
            a11yLabel={`Perfil de altitud: de ${formatMeters(elev.minAltitude)} a ${formatMeters(elev.maxAltitude)} metros en ${km(ride.distance)}`}
          />
          <Text style={s.muted}>
            {elev.source === 'dem'
              ? `Altitud del mapa de terreno. El GPS había medido +${formatMeters(ride.elevationGain)} m.`
              : 'Altitud del GPS (provisoria hasta consultar el mapa de terreno).'}
          </Text>
          {elev.source === 'gps' ? (
            !settings.demOnline ? (
              <Text style={s.muted}>La consulta del mapa está apagada en Ajustes → Privacidad.</Text>
            ) : demPending ? (
              <Button title="Consultar la altitud del mapa" icon="cloud_download" variant="secondary" onPress={retry} loading={busy} />
            ) : (
              <Text style={s.muted}>
                El mapa no alcanzó para esta salida: es muy corta (los primeros y los últimos {PRIVACY_ZONE_M} m nunca se
                consultan) o el GPX no tiene altitud.
              </Text>
            )
          ) : null}
          {note ? <Notice text={note} /> : null}
        </Card>
      ) : (
        <Card>
          <Text style={s.body}>No hay perfil de altitud: el GPX no tiene altitud o no se encontró en la carpeta de OpenTracks.</Text>
        </Card>
      )}

      {derived?.speed ? (
        <Card>
          <Text style={s.h3}>Velocidad</Text>
          <LineChart
            x={derived.d}
            series={[{ label: 'Velocidad', values: derived.speed, color: t.metric.speed, fill: true, format: (v) => `${formatNumber(v, 1)} km/h` }]}
            formatX={kmLabel}
            formatTick={(v) => formatNumber(v)}
            zero
            minSpan={10}
            reference={{ value: (ride.movingSec > 0 ? ride.distance / ride.movingSec : 0) * 3.6, label: 'media' }}
            height={150}
            a11yLabel={`Velocidad a lo largo del recorrido: media ${formatKmh(ride.movingSec > 0 ? ride.distance / ride.movingSec : 0)}, máxima ${formatKmh(ride.maxSpeed)} kilómetros por hora`}
          />
        </Card>
      ) : null}

      {derived?.hr || zones ? (
        <Card>
          <Text style={s.h3}>Frecuencia cardíaca</Text>
          {derived?.hr ? (
            <LineChart
              x={derived.d}
              series={[{ label: 'FC', values: derived.hr, color: t.metric.hr, format: (v) => `${Math.round(v)} lpm` }]}
              formatX={kmLabel}
              formatTick={(v) => formatNumber(v)}
              minSpan={20}
              reference={ride.avgHr !== null ? { value: ride.avgHr, label: 'media' } : undefined}
              height={150}
              a11yLabel={`Frecuencia cardíaca: media ${Math.round(ride.avgHr ?? 0)}, máxima ${Math.round(ride.maxHr ?? 0)} latidos por minuto`}
            />
          ) : null}
          {zones && hr ? (
            <>
              <Text style={s.h3}>Tiempo en zonas</Text>
              <ZoneChart seconds={zones} ranges={hrZoneRanges(hr.profile)} />
              <Text style={s.muted}>
                Zonas por reserva de FC con máxima {hr.profile.hrMax} lpm
                {hr.maxSource === 'edad' ? ' (estimada por tu edad)' : hr.maxSource === 'registrada' ? ' (la más alta registrada)' : ''} y
                reposo {hr.profile.hrRest} lpm{hr.restEstimated ? ' (estimada)' : ''}.
              </Text>
            </>
          ) : ride.hrHist ? (
            <Button title="Cargar FC máxima para ver las zonas" variant="secondary" icon="person" onPress={() => router.push('/perfil')} />
          ) : null}
        </Card>
      ) : null}

      {derived && derived.climbs.length > 0 ? (
        <>
          <SectionTitle title={`Subidas (${derived.climbs.length})`} />
          <Card>
            {derived.climbs.map((c, i) => (
              <ClimbRow key={c.startIndex} c={c} index={i} onSave={() => saveClimb(c, i)} />
            ))}
            <Text style={s.muted}>Tramos de al menos 500 m, 30 m de desnivel y 3 % de pendiente media.</Text>
          </Card>
        </>
      ) : null}

      {efforts.length > 0 ? (
        <>
          <SectionTitle title="Mejores tiempos" />
          <Card>
            {efforts.map(([dist, sec]) => {
              const best = allRecords.bestEfforts[dist];
              const isRecord = best?.rideId === ride.id;
              return (
                <View key={dist} style={l.effort} accessible accessibilityLabel={`${formatEffortDistance(dist)} en ${formatDuration(sec)}${isRecord ? ', récord personal' : ''}`}>
                  <Text style={[s.body, l.effortDist]}>{formatEffortDistance(dist)}</Text>
                  <Text style={l.effortTime}>{formatDuration(sec)}</Text>
                  <Text style={[s.muted, s.flex]}>{formatKmh(dist / sec)} km/h</Text>
                  {isRecord ? <Chip icon="emoji_events" label="Récord" color={t.warn} /> : null}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {derived?.cum ? (
        <Card>
          <Text style={s.h3}>Desnivel positivo acumulado</Text>
          <LineChart
            x={derived.d}
            series={[{ label: 'Acumulado', values: derived.cum, color: t.metric.elevation, fill: true, format: (v) => `+${formatMeters(v)} m` }]}
            formatX={kmLabel}
            formatTick={(v) => formatMeters(v)}
            zero
            minSpan={10}
            height={130}
            a11yLabel={`Desnivel acumulado: ${formatMeters(derived.cum[derived.cum.length - 1])} metros`}
          />
          <Text style={s.muted}>Suma solo los tramos de subida: las bajadas no restan.</Text>
        </Card>
      ) : null}

      <Text style={[s.muted, l.attribution]}>
        Altitud del terreno: Copernicus DEM GLO-90 (© DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018,
        provisto por la ESA en el marco del programa Copernicus), vía Open-Meteo.
      </Text>
    </Screen>
  );
}

const useLocal = makeStyles((t) => ({
  titleBlock: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  climb: { gap: 10, paddingBottom: 4 },
  climbHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  effort: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  effortDist: { width: 64, fontWeight: '700' },
  effortTime: { color: t.strong, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 70 },
  attribution: { fontSize: 11 },
}));
