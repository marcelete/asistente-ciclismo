import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { makeStyles, useTheme } from '../theme';
import { decimate, nearestIndex, niceScale } from './scale';

export interface LineSeries {
  label: string;
  values: (number | null)[];
  color: string;
  /** Rellena el área bajo la línea. */
  fill?: boolean;
  /** No se dibuja: solo aparece su valor al tocar el gráfico (por ejemplo, la pendiente). */
  readoutOnly?: boolean;
  /** Texto del valor en el punto tocado ("245 m"). */
  format: (v: number) => string;
}

const PAD_LEFT = 42;
const PAD_RIGHT = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 20;

/**
 * Gráfico de una o más series a lo largo de `x` (distancia o días). Tocá o deslizá el dedo para
 * leer los valores de un punto; arriba se muestran con el color de cada serie. Los huecos (null)
 * cortan la línea en vez de inventar datos.
 */
export function LineChart({
  x,
  series,
  height = 180,
  formatX,
  formatTick,
  minSpan = 1,
  zero = false,
  reference,
  a11yLabel,
}: {
  x: number[];
  series: LineSeries[];
  height?: number;
  /** Texto del eje x y del punto tocado ("12,4 km"). */
  formatX: (x: number) => string;
  /** Texto de las marcas del eje vertical. */
  formatTick: (v: number) => string;
  minSpan?: number;
  /** El eje vertical arranca en cero (velocidad, carga). */
  zero?: boolean;
  /** Línea horizontal de referencia, por ejemplo la velocidad media. */
  reference?: { value: number; label: string };
  a11yLabel: string;
}) {
  const s = useStyles();
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const drawn = useMemo(() => series.filter((se) => !se.readoutOnly), [series]);
  const scale = useMemo(() => {
    const all = drawn.flatMap((se) => se.values);
    return niceScale(reference ? [...all, reference.value] : all, { minSpan, zero });
  }, [drawn, reference, minSpan, zero]);

  const x0 = x[0] ?? 0;
  const x1 = x[x.length - 1] ?? 1;
  const xSpan = Math.max(1e-9, x1 - x0);
  const plotW = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const px = (v: number) => PAD_LEFT + ((v - x0) / xSpan) * plotW;
  const py = (v: number) => PAD_TOP + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;
  const base = (PAD_TOP + plotH).toFixed(1);

  const paths = useMemo(() => {
    if (width === 0) return [];
    return drawn.map((se) => {
      let line = '';
      let fill = '';
      let runStart: string | null = null;
      let lastX = '';
      const close = () => {
        if (se.fill && runStart !== null) fill += `L${lastX},${base}L${runStart},${base}Z`;
      };
      for (const i of decimate(se.values, Math.max(60, Math.round(plotW)))) {
        const v = se.values[i];
        if (v === null || i >= x.length) {
          close();
          runStart = null;
          continue;
        }
        const X = px(x[i]).toFixed(1);
        const Y = py(v).toFixed(1);
        if (runStart === null) {
          line += `M${X},${Y}`;
          fill += `M${X},${base}L${X},${Y}`;
          runStart = X;
        } else {
          line += `L${X},${Y}`;
          fill += `L${X},${Y}`;
        }
        lastX = X;
      }
      close();
      return { line, fill: se.fill ? fill : null, color: se.color };
    });
    // px/py dependen de width y scale, que ya están en la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, x, width, scale]);

  const onTouch = (e: GestureResponderEvent) => {
    if (x.length === 0) return;
    const xv = x0 + ((e.nativeEvent.locationX - PAD_LEFT) / plotW) * xSpan;
    setActive(nearestIndex(x, Math.max(x0, Math.min(x1, xv))));
  };

  const activeX = active !== null && active < x.length ? px(x[active]) : null;

  return (
    <View accessible accessibilityLabel={a11yLabel}>
      <View style={s.readout}>
        {active !== null ? (
          <>
            <Text style={s.readoutX}>{formatX(x[active])}</Text>
            {series.map((se) => {
              const v = se.values[active];
              return (
                <Text key={se.label} style={[s.readoutValue, { color: se.color }]}>
                  {v === null || v === undefined ? '--' : se.format(v)}
                </Text>
              );
            })}
          </>
        ) : (
          drawn.map((se) => (
            <View key={se.label} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: se.color }]} />
              <Text style={s.legendText}>{se.label}</Text>
            </View>
          ))
        )}
      </View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <>
            <Svg width={width} height={height}>
              {scale.ticks.map((tick) => (
                <Line
                  key={tick}
                  x1={PAD_LEFT}
                  x2={width - PAD_RIGHT}
                  y1={py(tick)}
                  y2={py(tick)}
                  stroke={t.grid}
                  strokeWidth={1}
                />
              ))}
              {paths.map((p, i) =>
                p.fill ? <Path key={`f${i}`} d={p.fill} fill={p.color} fillOpacity={t.dark ? 0.22 : 0.16} /> : null,
              )}
              {paths.map((p, i) => (
                <Path key={`l${i}`} d={p.line} stroke={p.color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {reference ? (
                <Line
                  x1={PAD_LEFT}
                  x2={width - PAD_RIGHT}
                  y1={py(reference.value)}
                  y2={py(reference.value)}
                  stroke={t.muted}
                  strokeWidth={1.5}
                  strokeDasharray="5,4"
                />
              ) : null}
              {activeX !== null ? (
                <>
                  <Line x1={activeX} x2={activeX} y1={PAD_TOP} y2={PAD_TOP + plotH} stroke={t.strong} strokeWidth={1} strokeOpacity={0.6} />
                  {drawn.map((se) => {
                    const v = se.values[active!];
                    return v === null || v === undefined ? null : (
                      <Circle key={se.label} cx={activeX} cy={py(v)} r={4.5} fill={se.color} stroke={t.surface} strokeWidth={2} />
                    );
                  })}
                </>
              ) : null}
            </Svg>
            {scale.ticks.map((tick) => (
              <Text key={tick} style={[s.tick, { top: py(tick) - 8 }]} maxFontSizeMultiplier={1.2}>
                {formatTick(tick)}
              </Text>
            ))}
            {reference ? (
              <Text style={[s.refLabel, { top: Math.max(0, py(reference.value) - 17) }]} maxFontSizeMultiplier={1.2}>
                {reference.label}
              </Text>
            ) : null}
            <Text style={[s.axisX, { left: PAD_LEFT }]} maxFontSizeMultiplier={1.2}>
              {formatX(x0)}
            </Text>
            <Text style={[s.axisX, s.axisMid, { left: PAD_LEFT, right: PAD_RIGHT }]} maxFontSizeMultiplier={1.2}>
              {formatX(x0 + xSpan / 2)}
            </Text>
            <Text style={[s.axisX, { right: PAD_RIGHT }]} maxFontSizeMultiplier={1.2}>
              {formatX(x1)}
            </Text>
            <View
              style={StyleSheet.absoluteFill}
              onStartShouldSetResponder={() => true}
              onResponderGrant={onTouch}
              onResponderMove={onTouch}
              onResponderTerminationRequest={() => true}
              // Si el gesto termina siendo un desplazamiento de la página, no queda la marca puesta.
              onResponderTerminate={() => setActive(null)}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  readout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, minHeight: 22, marginBottom: 6 },
  readoutX: { color: t.strong, fontWeight: '700', fontSize: 13 },
  readoutValue: { fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: t.muted, fontSize: 12.5 },
  tick: { position: 'absolute', left: 0, width: PAD_LEFT - 6, textAlign: 'right', color: t.muted, fontSize: 10.5 },
  refLabel: {
    position: 'absolute',
    right: PAD_RIGHT,
    color: t.muted,
    fontSize: 10.5,
    fontWeight: '600',
    backgroundColor: t.surface,
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
  axisX: { position: 'absolute', bottom: 0, color: t.muted, fontSize: 10.5 },
  axisMid: { textAlign: 'center' },
}));
