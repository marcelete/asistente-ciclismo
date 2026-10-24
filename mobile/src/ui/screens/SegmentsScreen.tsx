import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStore } from '../../data/store';
import { loadEfforts, loadSegments, routeMembers } from '../../data/dbSegments';
import { Card, EmptyState, SectionTitle, useStyles } from '../components';
import { formatDate, formatDuration, formatKm } from '../format';
import { TraceThumb } from '../map/TraceThumb';
import { makeStyles } from '../theme';

/** Salidas → Segmentos: tus segmentos y los recorridos que repetís. */
export function SegmentsPanel() {
  const { rides, change } = useStore();
  const s = useStyles();
  const l = useLocal();

  const data = useMemo(() => {
    const counted = new Map(rides.map((r) => [r.id, r] as const));
    const efforts = loadEfforts().filter((e) => counted.has(e.rideId));
    const segments = loadSegments().map((seg) => {
      const mine = efforts.filter((e) => e.segmentId === seg.id);
      const best = mine.reduce<number | null>((m, e) => (m === null || e.duration < m ? e.duration : m), null);
      return { seg, count: mine.length, best };
    });
    const routes = [...routeMembers().entries()]
      .map(([route, ids]) => {
        const list = ids.map((id) => counted.get(id)).filter((r): r is NonNullable<typeof r> => r !== undefined);
        return { route, list };
      })
      .filter((r) => r.list.length >= 2)
      .sort((a, b) => b.list.length - a.list.length);
    return { segments, routes };
    // `change.seq` cubre las pasadas que se calculan después de abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rides, change.seq]);

  return (
    <>
      <SectionTitle title="Segmentos" />
      {data.segments.length === 0 ? (
        <EmptyState
          icon="add_road"
          title="Todavía no tenés segmentos"
          text="Abrí una salida y tocá “Guardar subida como segmento”, o creá uno en el mapa ampliado. Se compara con todas tus salidas."
        />
      ) : (
        data.segments.map(({ seg, count, best }) => (
          <Card key={seg.id} onPress={() => router.push({ pathname: '/segmento/[id]', params: { id: seg.id } })} accessibilityLabel={`Segmento ${seg.name}`}>
            <Text style={s.h3}>{seg.name}</Text>
            <Text style={s.muted}>
              {formatKm(seg.length)} km · {count} {count === 1 ? 'pasada' : 'pasadas'}
              {best !== null ? ` · mejor: ${formatDuration(best)}` : ''}
            </Text>
          </Card>
        ))
      )}

      {data.routes.length > 0 ? (
        <>
          <SectionTitle title="Recorridos frecuentes" />
          {data.routes.map(({ route, list }) => {
            const sorted = [...list].sort((a, b) => a.startT - b.startT);
            return (
              <Card key={route}>
                <Pressable style={l.row} onPress={() => router.push({ pathname: '/salida/[id]', params: { id: sorted[sorted.length - 1].id } })} accessibilityRole="button">
                  <TraceThumb rideId={route} width={72} height={52} />
                  <View style={s.flex}>
                    <Text style={s.h3}>{list.length} veces</Text>
                    <Text style={s.muted}>
                      {formatKm(sorted[0].distance)} km · del {formatDate(sorted[0].startT)} al {formatDate(sorted[sorted.length - 1].startT)}
                    </Text>
                  </View>
                </Pressable>
              </Card>
            );
          })}
        </>
      ) : null}
    </>
  );
}

const useLocal = makeStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
}));
