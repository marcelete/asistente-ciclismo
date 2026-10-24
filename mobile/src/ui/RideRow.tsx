import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { countsAsRide } from '../core/stats/sport';
import { useAwards } from '../data/awards';
import { useStore } from '../data/store';
import { TraceThumb } from './map/TraceThumb';
import { rideAvgSpeed, rideElevation, rideTime, rideTitle, rideTypeLabel } from '../core/stats/rides';
import type { RideRecord } from '../core/stats/rides';
import { Card, Chip, Icon, useStyles } from './components';
import type { IconName } from './components';
import { formatDuration, formatKm, formatKmh, formatMeters, formatRideDate } from './format';
import { makeStyles, useTheme } from './theme';

/** Abre el detalle de una salida. */
export function openRide(id: string) {
  router.push({ pathname: '/salida/[id]', params: { id } });
}

function Mini({ icon, value, unit, color }: { icon: IconName; value: string; unit?: string; color: string }) {
  const s = useLocal();
  return (
    <View style={s.mini}>
      <Icon name={icon} size={15} color={color} />
      <Text style={s.miniValue} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {value}
        {unit ? <Text style={s.miniUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

/** Una salida en una lista: título, fecha y las métricas principales; se toca para ver el detalle. */
export function RideRow({ ride, now, autoPause }: { ride: RideRecord; now: number; autoPause: boolean }) {
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const e = rideElevation(ride);
  const type = rideTypeLabel(ride);
  const title = rideTitle(ride);
  const date = formatRideDate(ride.startT, now);
  const time = rideTime(ride, autoPause);
  const counts = countsAsRide(ride);
  const { change } = useStore();
  const awards = useAwards().byRide.get(ride.id)?.length ?? 0;
  return (
    <Card
      onPress={() => openRide(ride.id)}
      accessibilityLabel={`${title}, ${date}. ${formatKm(ride.distance)} kilómetros en ${formatDuration(time)}, desnivel ${formatMeters(e.gain)} metros${ride.avgHr !== null ? `, frecuencia media ${Math.round(ride.avgHr)}` : ''}`}
    >
      <View style={l.head}>
        <View style={[l.badge, { backgroundColor: t.surfaceAlt }]}>
          <Icon name="directions_bike" size={20} color={t.metric.distance} />
        </View>
        <View style={s.flex}>
          <Text style={s.h3} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.muted} numberOfLines={1}>
            {date}
            {type ? ` · ${type}` : ''}
          </Text>
        </View>
        <TraceThumb rideId={ride.id} version={change.seq} />
        <Icon name="chevron_right" color={t.muted} />
      </View>
      {!counts || awards > 0 ? (
        <View style={l.chips}>
          {!counts ? <Chip icon="block" label={`No cuenta${type ? ` · ${type}` : ''}`} /> : null}
          {awards > 0 ? <Chip icon="emoji_events" label={`Logros ${awards}`} color={t.warn} /> : null}
        </View>
      ) : null}
      <View style={l.metrics}>
        <Mini icon="straighten" value={formatKm(ride.distance)} unit="km" color={t.metric.distance} />
        <Mini icon="schedule" value={formatDuration(time)} color={t.metric.time} />
        <Mini icon="speed" value={formatKmh(rideAvgSpeed(ride, autoPause))} unit="km/h" color={t.metric.speed} />
        <Mini icon="trending_up" value={formatMeters(e.gain)} unit="m" color={t.metric.elevation} />
        {ride.avgHr !== null ? <Mini icon="favorite" value={String(Math.round(ride.avgHr))} unit="lpm" color={t.metric.hr} /> : null}
      </View>
    </Card>
  );
}

const useLocal = makeStyles((t) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniValue: { color: t.strong, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  miniUnit: { color: t.muted, fontSize: 12, fontWeight: '600' },
}));
