import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useTheme } from '../theme';

/** Una colina por tramo; la línea se repite dos veces para poder desplazarla sin cortes. */
const W = 360;
const H = 60;

function hillsPath(alts: number[] | null): string {
  // Sin salidas guardadas, unas colinas genéricas.
  const base = alts && alts.length > 4 ? alts : Array.from({ length: 24 }, (_, i) => 20 + 12 * Math.sin(i / 2.3) + 6 * Math.sin(i / 0.9));
  const lo = Math.min(...base);
  const hi = Math.max(...base);
  const span = hi - lo || 1;
  const pts = base.map((a, i) => [(i / (base.length - 1)) * W, H - 8 - ((a - lo) / span) * (H - 20)] as const);
  const one = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const two = pts.map(([x, y]) => `L${(x + W).toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `${one} ${two}`;
}

/** Rueda con rayos que gira (Animated nativo, sin librerías). */
function Wheel({ spin, color }: { spin: Animated.AnimatedInterpolation<string>; color: string }) {
  return (
    <Animated.View style={{ width: 44, height: 44, transform: [{ rotate: spin }] }}>
      <Svg width={44} height={44} viewBox="0 0 44 44">
        <Circle cx={22} cy={22} r={20} stroke={color} strokeWidth={3} fill="none" />
        {[0, 45, 90, 135].map((deg) => (
          <Line
            key={deg}
            x1={22}
            y1={3}
            x2={22}
            y2={41}
            stroke={color}
            strokeWidth={1.5}
            transform={`rotate(${deg} 22 22)`}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

/**
 * Un ciclista con las ruedas girando sobre la línea de altitud de tu última salida, que se
 * desplaza. Con "reducir movimiento" la escena queda quieta.
 */
export function BikeScene({ altitudes, still }: { altitudes: number[] | null; still: boolean }) {
  const t = useTheme();
  const [spin] = useState(() => new Animated.Value(0));
  const [scroll] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));
  const path = useMemo(() => hillsPath(altitudes), [altitudes]);

  useEffect(() => {
    if (still) return;
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 600, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.timing(scroll, { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    ];
    loops.forEach((a) => a.start());
    return () => loops.forEach((a) => a.stop());
  }, [still, spin, scroll, bob]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const translateX = scroll.interpolate({ inputRange: [0, 1], outputRange: [0, -W] });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

  return (
    <View style={{ width: 280, height: 150, overflow: 'hidden', alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ position: 'absolute', bottom: 0, left: 0, width: 280, height: H, overflow: 'hidden' }}>
        <Animated.View style={{ width: W * 2, transform: [{ translateX }] }}>
          <Svg width={W * 2} height={H} viewBox={`0 0 ${W * 2} ${H}`}>
            <Path d={path} stroke={t.metric.dem} strokeWidth={3} fill="none" strokeLinejoin="round" />
          </Svg>
        </Animated.View>
      </View>
      <Animated.View style={{ position: 'absolute', bottom: 30, width: 120, height: 76, transform: [{ translateY }] }}>
        <View style={{ position: 'absolute', left: 0, top: 32 }}>
          <Wheel spin={rotate} color={t.strong} />
        </View>
        <View style={{ position: 'absolute', left: 76, top: 32 }}>
          <Wheel spin={rotate} color={t.strong} />
        </View>
        <Svg width={120} height={76} viewBox="0 0 120 76" style={{ position: 'absolute', left: 0, top: 0 }}>
          {/* Cuadro: vainas, tubo del asiento, tubo superior, diagonal y horquilla */}
          <Path d="M22,54 L54,54 L48,28 L88,28 L98,54 M22,54 L48,28 M54,54 L88,28 M88,28 L90,22" stroke={t.link} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* Ciclista: cadera, espalda, brazo y pierna */}
          <Path d="M46,24 L70,12 L89,24 M46,24 L62,40 L56,54" stroke={t.strong} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={77} cy={6} r={5.5} fill={t.strong} />
        </Svg>
      </Animated.View>
    </View>
  );
}
