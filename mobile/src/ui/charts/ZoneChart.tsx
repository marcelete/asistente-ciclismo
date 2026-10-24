import { Text, View } from 'react-native';
import { formatHours } from '../format';
import { makeStyles, useTheme } from '../theme';

export const ZONE_NAMES = ['Recuperación', 'Resistencia', 'Tempo', 'Umbral', 'Máximo'];

/**
 * Tiempo en cada zona de FC: una barra apilada y una fila por zona con su rango, el tiempo y el
 * porcentaje. `seconds` tiene 6 lugares: debajo de la zona 1 y las zonas 1 a 5.
 */
export function ZoneChart({ seconds, ranges }: { seconds: number[]; ranges: { min: number; max: number }[] }) {
  const s = useStyles();
  const t = useTheme();
  // El tiempo por debajo de la zona 1 se suma a la zona 1 (es casi siempre al parar o al bajar).
  const zones = [seconds[0] + seconds[1], seconds[2], seconds[3], seconds[4], seconds[5]];
  const total = zones.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return (
    <View style={s.wrap}>
      <View style={s.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {zones.map((sec, i) =>
          sec > 0 ? <View key={i} style={{ flex: sec, backgroundColor: t.zones[i] }} /> : null,
        )}
      </View>
      {zones.map((sec, i) => {
        const pct = Math.round((sec / total) * 100);
        const range = i === 0 ? `< ${ranges[0].max}` : i === 4 ? `≥ ${ranges[4].min}` : `${ranges[i].min}–${ranges[i].max}`;
        return (
          <View
            key={i}
            style={s.row}
            accessible
            accessibilityLabel={`Zona ${i + 1}, ${ZONE_NAMES[i]}, ${range} latidos: ${formatHours(sec)}, ${pct} por ciento`}
          >
            <View style={[s.swatch, { backgroundColor: t.zones[i] }]} />
            <Text style={s.zone}>Z{i + 1}</Text>
            <View style={s.flex}>
              <Text style={s.name}>{ZONE_NAMES[i]}</Text>
              <Text style={s.range}>{range} lpm</Text>
            </View>
            <Text style={s.time}>{formatHours(sec)}</Text>
            <Text style={s.pct}>{pct} %</Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: 10 },
  stack: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: t.surfaceAlt },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  zone: { color: t.strong, fontWeight: '800', width: 24 },
  flex: { flex: 1 },
  name: { color: t.text, fontSize: 14 },
  range: { color: t.muted, fontSize: 12 },
  time: { color: t.strong, fontWeight: '600', fontVariant: ['tabular-nums'] },
  pct: { color: t.muted, width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
}));
