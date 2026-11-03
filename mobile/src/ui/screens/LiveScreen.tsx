import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { dateKey } from '../../core/coach/dates';
import { CoachEngine, DEFAULT_ENGINE_OPTIONS, RUN_ENGINE_OPTIONS, steadyPaceBlocks, steadySpeedBlocks, toLiveBlocks } from '../../core/coach/live/engine';
import type { BlockResult, LiveInput, LiveSnapshot, LiveStatus } from '../../core/coach/live/engine';
import { steadinessLabel } from '../../core/coach/live/steadiness';
import { workoutById } from '../../core/coach/workouts';
import { saveBlockLogs, saveCoachSession } from '../../data/dbCoach';
import { useStore } from '../../data/store';
import { deliver } from '../../services/liveFeedback';
import { log } from '../../services/log';
import { stopSpeaking } from '../../services/voice';
import { useZoneContext } from '../coachHooks';
import { Button, Card, Chip, Icon, Notice, Screen, SectionTitle, Segmented, Stepper, useStyles } from '../components';
import { makeStyles, useTheme } from '../theme';
import { formatPace, formatPaceSec } from '../format';
import { summarizeBlocks, targetText } from './CoachScreen';

type Source = 'gps' | 'sim';
type Phase = 'ready' | 'running' | 'done';

const clock = (sec: number) => {
  if (!Number.isFinite(sec)) return '--:--';
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Velocidad de la simulación: 1 min despacio, 1 min en banda, 1 min rápido, y vuelta. Sirve para probar los avisos sin salir. */
function simSpeed(second: number, center: number, run: boolean): number {
  const phase = Math.floor(second / 60) % 3;
  // Corriendo, la diferencia es proporcional: unos 50 s por km más lento o más rápido.
  if (run) return phase === 0 ? center * 0.86 : phase === 1 ? center : center * 1.14;
  return phase === 0 ? center - 4 : phase === 1 ? center : center + 5;
}

/** Pasos por minuto de la simulación: cortos, en banda y largos, desfasados de la velocidad. */
function simCadence(second: number): number {
  const phase = Math.floor((second + 30) / 60) % 3;
  return phase === 0 ? 156 : phase === 1 ? 174 : 192;
}

/** Pasos por minuto a partir del contador del podómetro: los pasos de los últimos ~10 segundos. */
class CadenceMeter {
  private samples: { t: number; steps: number }[] = [];
  add(t: number, steps: number): void {
    this.samples.push({ t, steps });
    while (this.samples.length > 2 && t - this.samples[1].t >= 10_000) this.samples.shift();
  }
  value(now: number): number | null {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    // Sin pasos nuevos en 4 segundos, estás parado.
    if (!first || !last || now - last.t > 4000) return null;
    const dt = (last.t - first.t) / 60_000;
    return dt >= 4 / 60 ? Math.round((last.steps - first.steps) / dt) : null;
  }
}

const STATUS: Record<LiveStatus, { text: string; icon: 'remove' | 'arrow_upward' | 'arrow_downward' | 'check_circle' | 'hourglass_top' }> = {
  none: { text: '', icon: 'remove' },
  grace: { text: 'Entrando en ritmo', icon: 'hourglass_top' },
  below: { text: 'Subí', icon: 'arrow_upward' },
  above: { text: 'Bajá', icon: 'arrow_downward' },
  in: { text: 'En ritmo', icon: 'check_circle' },
};

/**
 * Entrenador en vivo: temporizador de intervalos con avisos de voz, sonido y vibración, y el control de
 * velocidad. Con la pantalla siempre encendida, pensado para ir en el manubrio. Las sesiones fuera de la
 * bici usan solo el temporizador.
 */
export function LiveScreen() {
  const params = useLocalSearchParams<{ mode?: string; workout?: string; min?: string }>();
  const { settings } = useStore();
  const preDef = params.workout ? workoutById(params.workout) : undefined;
  // Una sesión de la biblioteca dice su deporte; el modo libre sigue al deporte elegido.
  const sport = preDef?.where === 'run' || preDef?.where === 'bike' ? preDef.where : settings.sport;
  const ctx = useZoneContext(sport);
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const c = settings.coach;

  const def = preDef;
  const mode: 'session' | 'steady' = params.mode === 'session' && def ? 'session' : 'steady';
  const minutes = Math.max(def?.minMin ?? 10, Math.min(def?.maxMin ?? 600, Number(params.min) || def?.minMin || 30));
  const offBike = def?.where === 'off';
  const run = sport === 'run' && !offBike;

  const [kmh, setKmh] = useState(25);
  const [paceSec, setPaceSec] = useState(360);
  const [source, setSource] = useState<Source>('gps');
  const [phase, setPhase] = useState<Phase>('ready');
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rpe, setRpe] = useState(5);
  const [results, setResults] = useState<BlockResult[]>([]);
  const [saved, setSaved] = useState(false);

  const blocks = useMemo(
    () =>
      mode === 'session' && def
        ? toLiveBlocks(def.build(minutes), ctx, c.speedTolKmh, c.paceTolSec)
        : run
          ? steadyPaceBlocks(paceSec, c.paceTolSec)
          : steadySpeedBlocks(kmh, c.speedTolKmh),
    [mode, def, minutes, ctx, kmh, paceSec, run, c.speedTolKmh, c.paceTolSec],
  );
  const engine = useRef<CoachEngine | null>(null);
  const input = useRef<LiveInput>({ speedKmh: null, hr: null, moving: false });
  const cadence = useRef(new CadenceMeter());
  const [stepsNote, setStepsNote] = useState<string | null>(null);
  const startedAt = useRef(0);

  const finish = () => {
    stopSpeaking();
    setResults(engine.current?.blockResults() ?? []);
    setPhase('done');
  };

  const start = () => {
    engine.current = new CoachEngine(blocks, {
      ...DEFAULT_ENGINE_OPTIONS,
      ...(run ? RUN_ENGINE_OPTIONS : {}),
      cueEverySec: c.cueEverySec,
      // Agua: cada 15 minutos en bici y cada 20 corriendo, en las sesiones largas.
      hydrateEverySec: mode === 'session' && !offBike && minutes >= 75 ? (run ? 1200 : 900) : null,
    });
    input.current = { speedKmh: null, hr: null, moving: offBike, cadence: null };
    cadence.current = new CadenceMeter();
    setStepsNote(null);
    startedAt.current = Date.now();
    setError(null);
    setSnap(null);
    setPhase('running');
  };

  // La pantalla no se apaga mientras se entrena.
  useEffect(() => {
    if (phase !== 'running') return;
    activateKeepAwakeAsync('coach').catch((e: unknown) => log('warn', 'ui', 'No se pudo mantener la pantalla encendida', e));
    return () => {
      deactivateKeepAwake('coach').catch(() => {});
    };
  }, [phase]);

  // GPS solo con la app abierta; la simulación y las sesiones de afuera no lo usan.
  useEffect(() => {
    if (phase !== 'running' || source !== 'gps' || offBike) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          setError('Sin permiso de ubicación no puedo medir la velocidad. Podés darlo en los ajustes del teléfono o probar con la simulación.');
          return;
        }
        const onLocation = (loc: Location.LocationObject) => {
          const v = loc.coords.speed;
          const ok = v !== null && v >= 0 && (loc.coords.accuracy ?? 99) <= 30;
          input.current = { ...input.current, speedKmh: ok ? v * 3.6 : null, moving: ok && v >= 1 };
        };
        let made: Location.LocationSubscription;
        try {
          made = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, onLocation);
        } catch (e) {
          // Si rechazaste el aviso de "precisión de la ubicación" de Android, se prueba con el GPS solo.
          log('warn', 'ui', 'Sin la máxima precisión de ubicación, se prueba con precisión alta', e);
          made = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, onLocation);
        }
        if (cancelled) made.remove();
        else sub = made;
      } catch (e) {
        log('error', 'ui', 'No se pudo leer el GPS', e);
        setError('No pude leer el GPS. Revisá que la ubicación del celular esté activada (con la precisión de ubicación) o probá con la simulación.');
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [phase, source, offBike]);

  // Correr: pasos por minuto con el podómetro del celular (solo con la pantalla abierta). Sin permiso, sigue sin cadencia.
  useEffect(() => {
    if (phase !== 'running' || source !== 'gps' || !run) return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!(await Pedometer.isAvailableAsync())) {
          setStepsNote('Este celular no tiene contador de pasos: la sesión sigue sin pasos por minuto.');
          return;
        }
        const perm = await Pedometer.requestPermissionsAsync();
        if (!perm.granted) {
          setStepsNote('Sin el permiso de actividad física no se cuentan los pasos por minuto. El resto funciona igual.');
          return;
        }
        const made = Pedometer.watchStepCount((r) => cadence.current.add(Date.now(), r.steps));
        if (cancelled) made.remove();
        else sub = made;
      } catch (e) {
        log('warn', 'ui', 'No se pudo usar el contador de pasos', e);
        setStepsNote('No se pudo usar el contador de pasos.');
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [phase, source, run]);

  // Un tic por segundo: la simulación pone la velocidad y el motor devuelve los avisos.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      const eng = engine.current;
      if (!eng) return;
      const now = Date.now();
      if (source === 'sim' && !offBike) {
        const sec = (now - startedAt.current) / 1000;
        const first = blocks.find((b) => b.target?.kind === 'speed')?.target;
        const center = first ? (first.min + first.max) / 2 : run ? 3600 / paceSec : kmh;
        input.current = { speedKmh: simSpeed(sec, center, run), hr: null, moving: true, cadence: run ? simCadence(sec) : null };
      } else if (run && source === 'gps') {
        input.current = { ...input.current, cadence: cadence.current.value(now) };
      }
      for (const e of eng.step(now, input.current)) deliver(e, c, settings.sounds);
      const sn = eng.snapshot();
      setSnap(sn);
      if (sn.finished) finish();
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, source, offBike, blocks, kmh, paceSec, run]);

  const save = () => {
    try {
      const total = results.reduce((sum, r) => sum + r.seconds, 0);
      const date = dateKey(startedAt.current || Date.now());
      if ((def && source === 'gps') || offBike) {
        saveCoachSession({ date, workoutId: def?.id ?? 'libre', status: 'done', rideId: null, rpe, minutes: total / 60, note: null, doneT: Date.now() });
        saveBlockLogs(
          results.map((r) => ({ date, workoutId: def?.id ?? 'libre', block: r.block, seconds: r.seconds, avgValue: r.avgValue, inRange: r.inRange, cv: r.cv })),
        );
      }
      setSaved(true);
    } catch (e) {
      log('error', 'ui', 'No se pudo guardar la sesión', e);
      setError('No se pudo guardar la sesión.');
    }
  };

  if (phase === 'ready') {
    return (
      <Screen header={false} title={mode === 'session' && def ? def.name : run ? 'Mantener ritmo' : 'Mantener velocidad'}>
        {mode === 'session' && def ? (
          <Card>
            <Text style={s.body}>{def.description}</Text>
            <Text style={s.muted}>{Math.round(minutes)} min</Text>
            {summarizeBlocks(def.build(minutes), ctx).map((line, i) => (
              <Text key={i} style={s.muted}>
                {line}
              </Text>
            ))}
          </Card>
        ) : run ? (
          <Card>
            <Text style={s.body}>Elegí el ritmo por km y el entrenador te avisa si vas más lento o más rápido (±{c.paceTolSec} s por km).</Text>
            <Stepper
              label={`${formatPaceSec(paceSec)} /km`}
              a11y="Ritmo a mantener"
              onMinus={() => setPaceSec((v) => Math.max(150, v - 5))}
              onPlus={() => setPaceSec((v) => Math.min(900, v + 5))}
            />
            <Text style={s.muted}>Con ‹ el ritmo es más rápido; con › más lento.</Text>
          </Card>
        ) : (
          <Card>
            <Text style={s.body}>Elegí la velocidad y el entrenador te avisa si vas más lento o más rápido (±{c.speedTolKmh} km/h).</Text>
            <Stepper label={`${kmh} km/h`} a11y="Velocidad a mantener" onMinus={() => setKmh((v) => Math.max(5, v - 1))} onPlus={() => setKmh((v) => Math.min(60, v + 1))} />
          </Card>
        )}
        {!offBike ? (
          <>
            <Text style={s.label}>{run ? 'De dónde sale el ritmo' : 'De dónde sale la velocidad'}</Text>
            <Segmented
              label="Fuente"
              options={[
                { value: 'gps', label: 'GPS' },
                { value: 'sim', label: 'Simulación' },
              ]}
              value={source}
              onChange={setSource}
            />
            {source === 'gps' ? (
              <Text style={s.muted}>
                {run
                  ? 'Usa el GPS y el contador de pasos del celular solo con esta pantalla abierta (se queda encendida). Llevalo en la mano o en un brazalete.'
                  : 'Usa el GPS del celular solo con esta pantalla abierta (se queda encendida). Poné el celular en el manubrio.'}
              </Text>
            ) : (
              <Text style={s.muted}>
                {run ? 'Prueba los avisos sin salir: el ritmo y los pasos por minuto cambian solos cada minuto. No se guarda.' : 'Prueba los avisos sin salir: la velocidad sube y baja sola cada minuto. No se guarda.'}
              </Text>
            )}
          </>
        ) : null}
        <Text style={s.muted}>Avisos: {[c.voice && 'voz', c.beeps && 'pitidos', c.vibrate && 'vibración'].filter(Boolean).join(', ') || 'ninguno'}. Se cambian en Ajustes.</Text>
        <Button title="Empezar" icon="play_arrow" onPress={start} />
      </Screen>
    );
  }

  if (phase === 'done') {
    return (
      <Screen header={false} title="Terminaste">
        {results.map((r) => {
          const b = blocks[r.block];
          if (!b) return null;
          return (
            <Card key={r.block}>
              <Text style={s.h3}>{b.label}</Text>
              <Text style={s.muted}>
                {clock(r.seconds)}
                {r.inRange !== null ? ` · ${Math.round(r.inRange * 100)} % en la banda · ${steadinessLabel(r.inRange, r.cv)}` : ''}
                {r.avgValue !== null ? ` · promedio ${averageText(r.avgValue, b, run)}` : ''}
              </Text>
            </Card>
          );
        })}
        {mode === 'session' && (source === 'gps' || offBike) ? (
          <Card>
            <Text style={s.h3}>¿Qué tan duro se sintió? (1 a 10)</Text>
            <Stepper label={String(rpe)} a11y="Esfuerzo percibido" onMinus={() => setRpe((v) => Math.max(1, v - 1))} onPlus={() => setRpe((v) => Math.min(10, v + 1))} />
            <Button title={saved ? 'Guardado' : 'Guardar sesión'} icon="save" disabled={saved} onPress={save} />
          </Card>
        ) : (
          <Notice text="Fue una prueba con velocidad simulada: no se guarda." />
        )}
        {error ? <Notice tone="bad" text={error} /> : null}
        <Button title="Cerrar" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const b = snap?.block ?? blocks[0];
  const st = STATUS[snap?.status ?? 'none'];
  const tone = snap?.status === 'in' ? t.good : snap?.status === 'below' || snap?.status === 'above' ? t.warn : t.muted;
  const hasSpeed = b?.target?.kind === 'speed';
  const isCadence = b?.target?.kind === 'cadence';
  // Corriendo, el GPS salta mucho de un segundo a otro: se muestra la mediana que usa el entrenador.
  const smoothed = run && b?.target?.kind === 'speed' ? (snap?.value ?? null) : null;
  const speedNow = smoothed ?? snap?.speedKmh ?? null;
  const pace = speedNow !== null ? formatPace(speedNow / 3.6) : '--';
  // Corriendo, "subí" es apurar el ritmo; en un bloque de pasos, acortar el paso.
  const statusText =
    snap?.status === 'below' ? (isCadence ? 'Pasos más rápidos' : run ? 'Apurá' : st.text) : snap?.status === 'above' ? (isCadence ? 'Paso más largo' : run ? 'Aflojá' : st.text) : st.text;
  return (
    <Screen header={false} title={mode === 'session' && def ? def.name : run ? 'Mantener ritmo' : 'Mantener velocidad'}>
      {error ? <Notice tone="bad" text={error} /> : null}
      {stepsNote ? <Notice tone="info" text={stepsNote} /> : null}
      <Card>
        <Text style={s.label}>
          {b?.label ?? ''} · bloque {(snap?.blockIndex ?? 0) + 1} de {blocks.length}
        </Text>
        {run ? (
          <Text style={[l.big, { color: t.strong }]} accessibilityLabel={`Ritmo ${pace} por kilómetro`}>
            {pace}
          </Text>
        ) : (
          <Text style={[l.big, { color: t.strong }]} accessibilityLabel={`Velocidad ${Math.round(speedNow ?? 0)} kilómetros por hora`}>
            {speedNow !== null ? Math.round(speedNow) : '--'}
          </Text>
        )}
        <Text style={s.muted}>
          {run ? 'min/km' : 'km/h'}
          {b?.target ? ` · objetivo ${targetText(b.target)}` : ''}
        </Text>
        {run ? (
          <Text style={[s.body, isCadence ? l.strong : null]}>
            Pasos por minuto: {snap?.cadence ? Math.round(snap.cadence) : '--'}
          </Text>
        ) : null}
        {b?.target && b.target.kind === 'hr' ? <Text style={s.muted}>Tu FC no está conectada todavía: este bloque solo cuenta el tiempo.</Text> : null}
      </Card>

      {hasSpeed || isCadence || b?.target?.kind === 'hr' ? (
        <View style={[l.banner, { borderColor: tone }]} accessibilityLiveRegion="polite">
          <Icon name={st.icon} size={40} color={tone} />
          <Text style={[l.bannerText, { color: tone }]}>{statusText || ' '}</Text>
        </View>
      ) : null}

      <Card>
        <Text style={s.label}>{b && !Number.isFinite(b.durationSec) ? 'Tiempo' : 'Falta en este bloque'}</Text>
        <Text style={[l.time, { color: t.strong }]}>
          {b && !Number.isFinite(b.durationSec) ? clock(snap?.blockElapsedSec ?? 0) : clock(snap?.blockRemainingSec ?? b?.durationSec ?? 0)}
        </Text>
        <Text style={s.muted}>Total {clock(snap?.totalElapsedSec ?? 0)}</Text>
        {snap?.paused ? <Chip icon="pause" label="En pausa" /> : null}
      </Card>

      <SectionTitle title="Controles" />
      <View style={l.row}>
        <Button title={snap?.paused ? 'Seguir' : 'Pausar'} icon={snap?.paused ? 'play_arrow' : 'pause'} variant="secondary" style={l.flex} onPress={() => (snap?.paused ? engine.current?.resume() : engine.current?.pause())?.forEach((e) => deliver(e, c, settings.sounds))} />
        <Button title="Siguiente" icon="skip_next" variant="secondary" style={l.flex} onPress={() => engine.current?.skip().forEach((e) => deliver(e, c, settings.sounds))} />
      </View>
      <Button title="Terminar" icon="stop" variant="danger" onPress={finish} />
    </Screen>
  );
}

/** Promedio de un bloque terminado: ritmo, pasos, FC o velocidad media (los bloques sin objetivo medible guardan la velocidad). */
function averageText(v: number, b: { target: { kind: string; unit: string } | null }, run: boolean): string {
  const t = b.target;
  const judged = t && (t.kind === 'speed' || t.kind === 'hr' || t.kind === 'cadence');
  if (!judged || t.kind === 'speed') return run ? `${formatPace(v / 3.6)} /km` : `${Math.round(v * 10) / 10} km/h`;
  return `${Math.round(v)} ${t.unit}`;
}

const useLocal = makeStyles(() => ({
  strong: { fontWeight: '700' },
  big: { fontSize: 96, fontWeight: '800', lineHeight: 104, fontVariant: ['tabular-nums'] },
  time: { fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'] },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 3, borderRadius: 16, paddingVertical: 14 },
  bannerText: { fontSize: 32, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
}));
