import Svg, { Circle, Path } from 'react-native-svg';
import type { Tier } from '../../core/awards/catalog';
import { Icon } from '../components';
import { useTheme } from '../theme';
import { View } from 'react-native';

export const TIER_COLOR: Record<Tier, { fill: string; ring: string; ribbon: string }> = {
  bronze: { fill: '#C98A4B', ring: '#8C5A28', ribbon: '#B8442F' },
  silver: { fill: '#BFC7D1', ring: '#7C8794', ribbon: '#2F6DB8' },
  gold: { fill: '#F2C230', ring: '#B8860B', ribbon: '#C0392B' },
  platinum: { fill: '#9FD3E8', ring: '#4F8FAA', ribbon: '#6B3FA0' },
};

/**
 * Medalla de un premio. Bloqueada va en gris con un anillo que muestra el progreso (0 a 1).
 */
export function Medal({ tier, size = 56, locked = false, progress = 0 }: { tier: Tier; size?: number; locked?: boolean; progress?: number }) {
  const t = useTheme();
  const c = locked ? { fill: t.surfaceAlt, ring: t.faint, ribbon: t.faint } : TIER_COLOR[tier];
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute' }}>
        {/* Cintas */}
        <Path d={`M${size * 0.3},${size * 0.78} L${size * 0.22},${size * 0.98} L${size * 0.38},${size * 0.9} L${size * 0.46},${size * 0.98} L${size * 0.5},${size * 0.8} Z`} fill={c.ribbon} opacity={locked ? 0.35 : 1} />
        <Path d={`M${size * 0.7},${size * 0.78} L${size * 0.78},${size * 0.98} L${size * 0.62},${size * 0.9} L${size * 0.54},${size * 0.98} L${size * 0.5},${size * 0.8} Z`} fill={c.ribbon} opacity={locked ? 0.35 : 1} />
        <Circle cx={size / 2} cy={size / 2} r={r} fill={c.fill} stroke={c.ring} strokeWidth={3} />
        {locked && progress > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={t.link}
            strokeWidth={3}
            fill="none"
            strokeDasharray={`${circ * Math.min(1, progress)} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <Icon name="emoji_events" size={size * 0.46} color={locked ? t.faint : '#FFFFFF'} />
    </View>
  );
}
