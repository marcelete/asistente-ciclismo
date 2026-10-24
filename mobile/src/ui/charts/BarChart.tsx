import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { makeStyles, useTheme } from '../theme';
import { labelEvery } from './scale';

export interface Bar {
  label: string;
  value: number;
  /** Texto completo de la barra ("Martes 20: 42,5 km"), para el detalle y los lectores de pantalla. */
  detail: string;
}

/**
 * Barras del período (días de la semana o del mes, meses del año). Tocá una barra para ver su
 * detalle arriba; `current` resalta la de hoy.
 */
export function BarChart({
  bars,
  color,
  height = 120,
  current,
  maxLabel,
}: {
  bars: Bar[];
  color: string;
  height?: number;
  current?: number;
  /** Texto del valor máximo ("máx 42 km"). */
  maxLabel?: string;
}) {
  const s = useStyles();
  const t = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
  const every = labelEvery(bars.length, 10);
  const sel = selected !== null && selected < bars.length ? selected : null;
  return (
    <View>
      <View style={s.header}>
        <Text style={[s.detail, sel === null && s.hint]} numberOfLines={1}>
          {sel !== null ? bars[sel].detail : 'Tocá una barra para ver el detalle'}
        </Text>
        {maxLabel ? <Text style={s.hint}>{maxLabel}</Text> : null}
      </View>
      <View style={[s.bars, { height, gap: bars.length > 20 ? 2 : 6 }]}>
        {bars.map((b, i) => {
          const h = max > 0 && b.value > 0 ? Math.max(3, (b.value / max) * (height - 2)) : 0;
          return (
            <Pressable
              key={i}
              style={s.slot}
              onPress={() => setSelected(sel === i ? null : i)}
              accessibilityRole="button"
              accessibilityLabel={b.detail}
              accessibilityState={{ selected: sel === i }}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <View style={[s.track, i === current && { backgroundColor: t.surfaceAlt }]}>
                <View
                  style={{
                    height: h,
                    backgroundColor: sel === i ? t.strong : color,
                    opacity: sel !== null && sel !== i ? 0.5 : 1,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                  }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={[s.labels, { gap: bars.length > 20 ? 2 : 6 }]}>
        {bars.map((b, i) => (
          <Text
            key={i}
            style={[s.label, i === current && s.labelCurrent]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
            importantForAccessibility="no"
          >
            {i % every === 0 || i === current ? b.label : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, minHeight: 20, marginBottom: 8 },
  detail: { color: t.strong, fontWeight: '700', fontSize: 13, flexShrink: 1 },
  hint: { color: t.muted, fontSize: 12, fontWeight: '400' },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  slot: { flex: 1, height: '100%' },
  track: { flex: 1, justifyContent: 'flex-end', borderRadius: 4 },
  labels: { flexDirection: 'row', marginTop: 6 },
  label: { flex: 1, textAlign: 'center', color: t.muted, fontSize: 11 },
  labelCurrent: { color: t.strong, fontWeight: '800' },
}));
