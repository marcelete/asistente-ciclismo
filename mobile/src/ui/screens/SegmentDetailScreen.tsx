import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import type { BBox } from '../../core/geo/mercator';
import { loadEfforts, loadSegment, deleteSegment } from '../../data/dbSegments';
import { unpackProfile } from '../../data/profileCodec';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { Medal } from '../awards/Medal';
import { Button, Card, EmptyState, Metric, Grid, Screen, SectionTitle, useStyles } from '../components';
import { formatDate, formatDuration, formatKm, formatKmh } from '../format';
import { MapView } from '../map/MapView';
import { openRide } from '../RideRow';
import { makeStyles, useTheme } from '../theme';

/** Detalle de un segmento: el mapa y tus pasadas, de la más rápida a la más lenta. */
export function SegmentDetailScreen({ id }: { id: string }) {
  const { rides, settings, change, reloadAll } = useStore();
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const seg = useMemo(() => loadSegment(id), [id]);
  const counted = useMemo(() => new Set(rides.map((r) => r.id)), [rides]);
  const efforts = useMemo(
    () => loadEfforts(id).filter((e) => counted.has(e.rideId)).sort((a, b) => a.duration - b.duration),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, counted, change.seq],
  );
  const points = useMemo(() => (seg ? unpackProfile(seg.points) : null), [seg]);

  if (!seg || !points) {
    return (
      <Screen header={false}>
        <EmptyState icon="search_off" title="No se encontró el segmento" text="Puede que se haya borrado.">
          <Button title="Volver" variant="secondary" onPress={() => router.back()} />
        </EmptyState>
      </Screen>
    );
  }

  const bbox: BBox = { minLat: seg.bbox[0], minLon: seg.bbox[1], maxLat: seg.bbox[2], maxLon: seg.bbox[3] };
  const coords = points.map((p) => [p.lat, p.lon] as [number, number]);
  const best = efforts[0];

  const confirmDelete = () =>
    Alert.alert('Borrar segmento', `Se borra "${seg.name}" y sus pasadas. No se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () =>
          deleteSegment(seg.id)
            .then(() => {
              reloadAll([]);
              router.back();
            })
            .catch((e) => log('error', 'segments', 'No se pudo borrar el segmento', e)),
      },
    ]);

  return (
    <Screen header={false}>
      <Text style={s.h1}>{seg.name}</Text>
      <MapView
        tracks={[{ coords, color: t.link, width: 5 }]}
        markers={[
          { lat: coords[0][0], lon: coords[0][1], color: t.good },
          { lat: coords[coords.length - 1][0], lon: coords[coords.length - 1][1], color: t.danger },
        ]}
        bounds={bbox}
        height={220}
        interactive
        tilesOn={settings.mapTiles}
      />
      <Card>
        <Grid min={110}>
          <Metric label="Largo" value={formatKm(seg.length)} unit="km" size="sm" />
          <Metric label="Pasadas" value={String(efforts.length)} size="sm" />
          {best ? <Metric label="Mejor tiempo" value={formatDuration(best.duration)} size="sm" /> : null}
        </Grid>
      </Card>

      <SectionTitle title="Tus pasadas" />
      {efforts.length === 0 ? (
        <Text style={s.muted}>Todavía no pasaste por este segmento en ninguna salida en bici.</Text>
      ) : (
        <Card>
          {efforts.map((e, i) => (
            <Pressable key={`${e.rideId}-${e.startT}`} style={l.row} onPress={() => openRide(e.rideId)} accessibilityRole="button">
              {i < 3 ? <Medal tier={i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze'} size={32} /> : <View style={l.spacer} />}
              <View style={s.flex}>
                <Text style={s.body}>
                  {formatDuration(e.duration)} · {formatKmh(e.speed)} km/h
                </Text>
                <Text style={s.muted}>
                  {formatDate(e.startT)}
                  {e.avgHr !== null ? ` · FC ${Math.round(e.avgHr)}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
      <Button title="Borrar segmento" icon="delete" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}

const useLocal = makeStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  spacer: { width: 32 },
}));
