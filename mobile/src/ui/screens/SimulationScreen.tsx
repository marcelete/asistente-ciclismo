import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { DEFAULT_LIVE_OPTIONS, LiveStats } from '../../core/live/LiveStats';
import { syntheticRide } from '../../core/sim/synthetic';
import type { LiveSnapshot } from '../../core/types';
import { useStore } from '../../data/store';
import { Button, Card, Chip, Grid, Metric, Screen, useStyles } from '../components';
import { formatDuration, formatKm, formatKmh, formatMeters } from '../format';
import { makeStyles, useTheme } from '../theme';

/** Segundos simulados que avanzan por cada tic (cada 100 ms), es decir, 60x en tiempo real. */
const SAMPLES_PER_TICK = 6;
const TICK_MS = 100;

const EMPTY: LiveSnapshot = {
  speed: 0,
  avgMovingSpeed: 0,
  avgTotalSpeed: 0,
  maxSpeed: 0,
  distance: 0,
  elevationGain: 0,
  elevationLoss: 0,
  maxAltitude: null,
  minAltitude: null,
  altitude: null,
  elapsedSec: 0,
  movingSec: 0,
  hr: null,
  avgHr: null,
  maxHr: null,
};

/**
 * Pantalla de datos en vivo alimentada por una salida sintética. Muestra cómo se calculan en el
 * celular la velocidad, la distancia, el desnivel y la FC mientras grabás, sin salir a pedalear
 * (la grabación real la hace OpenTracks).
 */
export function SimulationScreen() {
  const { settings } = useStore();
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const ride = useMemo(
    () =>
      syntheticRide({
        durationSec: 3600,
        speed: (sec) => (sec > 1500 && sec < 1620 ? 0 : 7 + 2 * Math.sin(sec / 200)),
        altitudeAt: (d) => 120 + 45 * Math.sin(d / 3000) + 20 * Math.sin(d / 900),
        altNoise: 2,
        hr: (sec) => 128 + 22 * Math.sin(sec / 300),
        seed: 11,
      }),
    [],
  );
  const live = useRef(new LiveStats());
  const index = useRef(0);
  const [snap, setSnap] = useState<LiveSnapshot>(EMPTY);
  const [running, setRunning] = useState(true);
  const [finished, setFinished] = useState(false);

  const reset = () => {
    live.current = new LiveStats();
    index.current = 0;
    setSnap(EMPTY);
    setFinished(false);
    setRunning(true);
  };

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      for (let k = 0; k < SAMPLES_PER_TICK && index.current < ride.length; k++) {
        live.current.push(ride[index.current++]);
      }
      setSnap(live.current.snapshot());
      if (index.current >= ride.length) {
        setRunning(false);
        setFinished(true);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, ride]);

  // Con pausa automática el cronómetro principal es el tiempo en movimiento: se frena al pararte.
  const paused = settings.autoPause && running && snap.elapsedSec > 0 && snap.speed < DEFAULT_LIVE_OPTIONS.movingThreshold;

  return (
    // El título ya está en el encabezado de la navegación.
    <Screen header={false}>
      <Text style={s.muted}>Datos en vivo con una salida de prueba a 60x</Text>
      <View style={l.chips}>
        <Chip icon="science" label="Modo simulación" color={t.warn} />
        {paused ? <Chip icon="pause" label="Pausa automática" color={t.warn} /> : null}
        {finished ? <Chip icon="check_circle" label="Salida completa" color={t.good} /> : null}
      </View>
      <Card>
        <Text style={s.label}>Velocidad</Text>
        <Text style={l.speed} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2} accessibilityLabel={`Velocidad ${formatKmh(snap.speed)} kilómetros por hora`}>
          {formatKmh(snap.speed)}
          <Text style={l.speedUnit}> km/h</Text>
        </Text>
      </Card>
      <Card>
        <Grid min={140}>
          <Metric label="Distancia" icon="straighten" tone="distance" value={formatKm(snap.distance)} unit="km" />
          <Metric
            label={settings.autoPause ? 'Tiempo en movimiento' : 'Tiempo'}
            icon="schedule"
            tone="time"
            value={formatDuration(settings.autoPause ? snap.movingSec : snap.elapsedSec)}
          />
          <Metric label="Media en movimiento" icon="speed" tone="speed" value={formatKmh(snap.avgMovingSpeed)} unit="km/h" />
          <Metric label="Media total" icon="avg_pace" tone="speed" value={formatKmh(snap.avgTotalSpeed)} unit="km/h" />
          <Metric label="Velocidad máxima" icon="speed" tone="speed" value={formatKmh(snap.maxSpeed)} unit="km/h" />
          <Metric
            label={settings.autoPause ? 'Transcurrido' : 'En movimiento'}
            icon="timer"
            tone="time"
            value={formatDuration(settings.autoPause ? snap.elapsedSec : snap.movingSec)}
          />
          <Metric label="Desnivel +" icon="trending_up" tone="elevation" value={formatMeters(snap.elevationGain)} unit="m" />
          <Metric label="Desnivel −" icon="trending_down" tone="elevation" value={formatMeters(snap.elevationLoss)} unit="m" />
          <Metric label="Altitud" icon="landscape" tone="elevation" value={formatMeters(snap.altitude)} unit="m s. n. m." />
          <Metric label="Altitud máxima" icon="landscape" tone="elevation" value={formatMeters(snap.maxAltitude)} unit="m" />
          <Metric label="FC" icon="favorite" tone="hr" value={snap.hr === null ? '--' : String(Math.round(snap.hr))} unit="lpm" />
          <Metric label="FC media" icon="favorite" tone="hr" value={snap.avgHr === null ? '--' : String(Math.round(snap.avgHr))} unit="lpm" />
        </Grid>
      </Card>
      <View style={l.buttons}>
        <Button
          title={running ? 'Pausar' : 'Seguir'}
          icon={running ? 'pause' : 'play_arrow'}
          onPress={() => setRunning((r) => !r)}
          disabled={finished}
          style={s.flex}
        />
        <Button title="Reiniciar" icon="replay" variant="secondary" onPress={reset} style={s.flex} />
      </View>
    </Screen>
  );
}

const useLocal = makeStyles((t) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  speed: { color: t.strong, fontSize: 72, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  speedUnit: { color: t.muted, fontSize: 20, fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: 12 },
}));
