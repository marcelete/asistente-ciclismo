import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { altitudeSeries, BIKE_PRESETS } from '../../core/analysis/profileMetrics';
import { bikeOfRide, energyParams } from '../../core/bikes/bikes';
import { bestEfforts, fitDistance, predictTime } from '../../core/predict/distance';
import type { DistancePrediction } from '../../core/predict/distance';
import { powerCurve, powerSeries } from '../../core/predict/powerCurve';
import type { PowerCurvePoint } from '../../core/predict/powerCurve';
import { powerForTime } from '../../core/power/solve';
import { loadProfile } from '../../data/db';
import { loadEfforts, loadSegments } from '../../data/dbSegments';
import { unpackProfile } from '../../data/profileCodec';
import { useStore } from '../../data/store';
import { Card, EmptyState, Metric, Grid, SectionTitle, useStyles } from '../components';
import { formatDuration, formatKmh, formatNumber } from '../format';
import { useNow } from '../hooks';

const DAY_MS = 86_400_000;

interface Data {
  curve: PowerCurvePoint[];
  now40: DistancePrediction | null;
  now100: DistancePrediction | null;
  past40: DistancePrediction | null;
  past100: DistancePrediction | null;
  targets: { name: string; best: number; watts: number | null }[];
}

/** Metas → Predicciones: tu potencia estimada, tiempos para 40 y 100 km y qué hace falta para bajar un récord. */
export function PredictionsPanel() {
  const { rides, bikes, settings } = useStore();
  const s = useStyles();
  const now = useNow(3_600_000);
  const [data, setData] = useState<Data | null>(null);
  const a = settings.athlete;
  const ready = a.weightKg !== null;

  useEffect(() => {
    if (!ready) return;
    // Los cálculos recorren perfiles de varias salidas: se hacen después de dibujar la pantalla.
    const timer = setTimeout(() => {
      const recent = rides.filter((r) => now - r.startT <= 90 * DAY_MS);
      const series: number[][] = [];
      for (const r of recent) {
        const p = loadProfile(r.id);
        const params = energyParams(a.weightKg, bikeOfRide(r, bikes), { bike: a.bike, bikeKg: a.bikeKg });
        if (!p || !params) continue;
        series.push(powerSeries(p, { massKg: params.massKg, crr: params.crr, cdA: BIKE_PRESETS[params.bike].cdA, drivetrainEff: 0.97 }));
      }
      const fitNow = fitDistance(bestEfforts(recent.map((r) => r.efforts)));
      const fitAll = fitDistance(bestEfforts(rides.map((r) => r.efforts)));

      // Potencia para bajar tu mejor tiempo en tus segmentos.
      const names = new Map(loadSegments().map((x) => [x.id, x] as const));
      const best = new Map<string, number>();
      for (const e of loadEfforts()) if (!best.has(e.segmentId) || e.duration < best.get(e.segmentId)!) best.set(e.segmentId, e.duration);
      const def = bikes.find((b) => b.isDefault) ?? null;
      const params = energyParams(a.weightKg, def, { bike: a.bike, bikeKg: a.bikeKg });
      const targets = [...best.entries()]
        .slice(0, 3)
        .map(([id, sec]) => {
          const seg = names.get(id);
          const pts = seg ? unpackProfile(seg.points) : null;
          const alt = pts ? altitudeSeries(pts) : null;
          const watts =
            params && pts && alt
              ? powerForTime(pts, alt.values, { massKg: params.massKg, crr: params.crr, cdA: BIKE_PRESETS[params.bike].cdA, drivetrainEff: 0.97, rho: 1.2 }, sec * 0.99)
              : null;
          return { name: seg?.name ?? 'Segmento', best: sec, watts };
        });

      setData({
        curve: powerCurve(series),
        now40: fitNow ? predictTime(fitNow, 40_000) : null,
        now100: fitNow ? predictTime(fitNow, 100_000) : null,
        past40: fitAll ? predictTime(fitAll, 40_000) : null,
        past100: fitAll ? predictTime(fitAll, 100_000) : null,
        targets,
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [rides, bikes, ready, now, a.weightKg, a.bike, a.bikeKg]);

  if (rides.length === 0) {
    return <EmptyState icon="query_stats" title="Todavía no hay datos" text="Con tus salidas en bici vas a ver acá tu potencia estimada y tus tiempos probables." />;
  }

  const row = (label: string, p: DistancePrediction | null) =>
    p ? (
      <Text style={s.body}>
        {label}: {formatDuration(p.seconds)} ({formatKmh(p.distance / p.seconds)} km/h){p.extrapolated ? ' · extrapolado' : ''}
      </Text>
    ) : (
      <Text style={s.muted}>{label}: hacen falta mejores tiempos de al menos dos distancias.</Text>
    );

  return (
    <>
      <SectionTitle title="Potencia estimada" />
      <Card>
        {!ready ? (
          <Text style={s.muted}>Cargá tu peso en Ajustes → Perfil para estimar la potencia.</Text>
        ) : !data ? (
          <Text style={s.muted}>Calculando…</Text>
        ) : data.curve.length === 0 ? (
          <Text style={s.muted}>Todavía no hay salidas con tiempos en los últimos 90 días.</Text>
        ) : (
          <>
            <Grid min={96}>
              {data.curve.map((c) => (
                <Metric key={c.durationSec} size="sm" label={`${c.durationSec / 60} min`} value={formatNumber(c.watts)} unit="W" hint="estimada" />
              ))}
            </Grid>
            <Text style={s.muted}>Mejor potencia media de cada duración en los últimos 90 días, con un modelo físico (sin medidor de potencia).</Text>
          </>
        )}
      </Card>

      <SectionTitle title="Tiempos probables" />
      <Card>
        <Text style={s.h3}>Con tu forma actual (90 días)</Text>
        {data ? row('40 km', data.now40) : <Text style={s.muted}>Calculando…</Text>}
        {data ? row('100 km', data.now100) : null}
        <Text style={s.h3}>Con tu mejor momento</Text>
        {data ? row('40 km', data.past40) : null}
        {data ? row('100 km', data.past100) : null}
        <Text style={s.muted}>Se ajusta t = a·d^b a tus mejores tiempos (b entre 1,0 y 1,25). Una predicción que duplica tu salida más larga es una extrapolación.</Text>
      </Card>

      {data && data.targets.length > 0 ? (
        <>
          <SectionTitle title="Para bajar tu marca" />
          <Card>
            {data.targets.map((x) => (
              <View key={x.name}>
                <Text style={s.body}>
                  {x.name}: {formatDuration(x.best)}
                  {x.watts !== null ? ` → necesitás ~${formatNumber(x.watts)} W constantes para ganarle 1 %` : ''}
                </Text>
              </View>
            ))}
            <Text style={s.muted}>Estimado con el modelo físico, sin viento y con tu bici por defecto.</Text>
          </Card>
        </>
      ) : null}
    </>
  );
}
