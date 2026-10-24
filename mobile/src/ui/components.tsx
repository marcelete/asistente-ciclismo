import { useSegments } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { AndroidSymbol } from 'expo-symbols';
import { Children, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { RefreshControlProps, StyleProp, TextInputProps, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Change } from './format';
import { makeStyles, useTheme } from './theme';
import type { Palette } from './theme';

/** Ancho máximo del contenido: en tablets o con el celular acostado no se estira de lado a lado. */
export const CONTENT_MAX_WIDTH = 760;

export type IconName = AndroidSymbol;

/**
 * Bici dibujada con SVG. El glifo `directions_bike` de Material Symbols se pasa del cuadro de la
 * letra y Android recorta la rueda delantera; así sale entera y del tamaño pedido.
 */
function BikeIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={5.5} cy={16} r={3.8} />
      <Circle cx={18.5} cy={16} r={3.8} />
      <Path d="M5.5 16 L11 16 L9 8.5 L15.5 8.5 L18.5 16 M11 16 L15.5 8.5 M7.5 8.5 L10.5 8.5 M14 6.5 L17.5 6.5" />
    </Svg>
  );
}

/** Ícono de Material Symbols (el set de Android). */
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  const tint = color ?? t.muted;
  if (name === 'directions_bike') return <BikeIcon size={size} color={tint} />;
  return <SymbolView name={{ android: name, web: name }} size={size} tintColor={tint} />;
}

/** ¿La pantalla está dentro de las cinco pestañas? (La barra de pestañas ya reserva el espacio de los botones de Android.) */
function useInTabs(): boolean {
  return useSegments()[0] === '(tabs)';
}

/**
 * Márgenes de una pantalla: respeta la barra de estado, los botones de Android y los bordes del celular.
 * Dentro de las pestañas la barra de pestañas ya reserva el espacio de los botones; fuera de ellas
 * (perfil, bicis, detalle de salida, bienvenida) lo reserva la pantalla misma.
 */
export function useScreenPadding(withTopInset = true): ViewStyle {
  const insets = useSafeAreaInsets();
  const inTabs = useInTabs();
  return {
    paddingTop: (withTopInset ? insets.top : 0) + 12,
    paddingBottom: 24 + (inTabs ? 0 : insets.bottom),
    paddingLeft: Math.max(16, insets.left + 8),
    paddingRight: Math.max(16, insets.right + 8),
  };
}

/**
 * Fondo detrás de la barra de estado. La app dibuja de borde a borde: sin esto, al desplazar una
 * pestaña el contenido pasa por debajo del reloj y se superpone.
 */
export function StatusBarScrim() {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  if (insets.top === 0) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: t.bg }}
    />
  );
}

/**
 * Fondo detrás de los botones de Android, fuera de las pestañas. La barra de navegación es
 * transparente: sin esto, al desplazar, el contenido pasa por debajo de los botones y se mezcla.
 */
export function NavigationBarScrim() {
  const insets = useSafeAreaInsets();
  const inTabs = useInTabs();
  const t = useTheme();
  if (inTabs || insets.bottom === 0) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: insets.bottom, backgroundColor: t.bg }}
    />
  );
}

/** Columna centrada de ancho máximo, con el espacio entre bloques de todas las pantallas. */
export function Column({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <View style={s.column}>{children}</View>;
}

/**
 * Pantalla con desplazamiento, márgenes seguros y ancho máximo. `title` dibuja el título grande
 * de las pestañas; las pantallas con encabezado de navegación no lo usan (`header={false}`).
 */
export function Screen({
  title,
  subtitle,
  right,
  children,
  header = true,
  refreshControl,
  keyboard,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  /** false si la pantalla ya tiene el encabezado de la navegación (no hace falta el margen de arriba). */
  header?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** La pantalla tiene campos de texto: los toques no cierran el teclado antes de llegar al botón. */
  keyboard?: boolean;
}) {
  const s = useStyles();
  const padding = useScreenPadding(header);
  return (
    <View style={s.flex}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={padding}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps={keyboard ? 'handled' : undefined}
      >
        <Column>
          {title ? <ScreenTitle title={title} subtitle={subtitle} right={right} /> : null}
          {children}
        </Column>
      </ScrollView>
      {header ? <StatusBarScrim /> : null}
      <NavigationBarScrim />
    </View>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.titleRow}>
      <View style={s.flex}>
        <Text style={s.h1} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        {subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.sectionRow}>
      <Text style={s.h2} accessibilityRole="header">
        {title}
      </Text>
      {action}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const s = useStyles();
  const t = useTheme();
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: t.border }}
      style={({ pressed }) => [s.card, pressed && s.pressed, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
}

export type MetricTone = keyof Palette['metric'];

/**
 * Una métrica: etiqueta, valor grande y unidad. `delta` compara con el período anterior y
 * `hint` aclara de dónde sale el dato ("estimado", "del mapa").
 */
export function Metric({
  label,
  value,
  unit,
  icon,
  tone,
  hint,
  delta,
  size = 'md',
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: IconName;
  tone?: MetricTone;
  hint?: string;
  delta?: Change | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const s = useStyles();
  const t = useTheme();
  const color = tone ? t.metric[tone] : t.muted;
  const valueStyle = size === 'lg' ? s.valueLg : size === 'sm' ? s.valueSm : s.value;
  const deltaSpoken = delta
    ? delta.dir === 'same'
      ? ', igual que el período anterior'
      : `, ${delta.dir === 'up' ? 'subió' : 'bajó'} ${delta.text} frente al período anterior`
    : '';
  return (
    <View
      style={s.metric}
      accessible
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}${deltaSpoken}${hint ? `, ${hint}` : ''}`}
    >
      <View style={s.metricHead}>
        {icon ? <Icon name={icon} size={16} color={color} /> : null}
        <Text style={s.metricLabel} numberOfLines={2} maxFontSizeMultiplier={1.4}>
          {label}
        </Text>
      </View>
      <Text style={valueStyle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.3}>
        {value}
        {unit ? <Text style={s.unit}> {unit}</Text> : null}
      </Text>
      {delta ? (
        <Text style={[s.delta, { color: delta.dir === 'up' ? t.good : t.muted }]} maxFontSizeMultiplier={1.4}>
          {delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '='} {delta.text}
        </Text>
      ) : null}
      {hint ? (
        <Text style={s.hint} maxFontSizeMultiplier={1.4}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Grilla que se adapta al ancho y al tamaño de letra: cada celda mide al menos `min` (que crece
 * con la letra agrandada) y entran tantas columnas como quepan. Las celdas quedan parejas.
 */
export function Grid({ children, min = 140, gap = 14 }: { children: ReactNode; min?: number; gap?: number }) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const items = Children.toArray(children).filter(Boolean);
  const minW = min * Math.min(Math.max(fontScale, 1), 1.6);
  const cols = width > 0 ? Math.max(1, Math.floor((width + gap) / (minW + gap))) : 2;
  const itemW = width > 0 ? (width - gap * (cols - 1)) / cols : undefined;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: gap, rowGap: gap + 2 }}
    >
      {items.map((c, i) => (
        <View key={i} style={{ width: itemW ?? '46%' }}>
          {c}
        </View>
      ))}
    </View>
  );
}

export function Button({
  title,
  onPress,
  disabled,
  variant = 'primary',
  icon,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles();
  const t = useTheme();
  const fg = variant === 'primary' ? t.onPrimary : variant === 'danger' ? t.danger : t.link;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={{ color: variant === 'primary' ? '#ffffff33' : t.border }}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        s.button,
        variant === 'primary' && s.buttonPrimary,
        variant === 'secondary' && s.buttonSecondary,
        variant === 'danger' && s.buttonDanger,
        variant === 'ghost' && s.buttonGhost,
        pressed && s.pressed,
        (disabled || loading) && s.disabled,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <Text style={[s.buttonText, { color: fg }]} maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Para lectores de pantalla: qué se elige ("Período"). */
  label?: string;
}) {
  const s = useStyles();
  return (
    <View style={s.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[s.segment, active && s.segmentActive]}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
          >
            <Text style={[s.segmentText, active && s.segmentTextActive]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ fraction, marker, color }: { fraction: number; marker?: number; color?: string }) {
  const s = useStyles();
  const t = useTheme();
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <View style={s.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(f * 100) }}>
      <View style={[s.barFill, { width: `${f * 100}%`, backgroundColor: f >= 1 ? t.good : (color ?? t.primary) }]} />
      {marker !== undefined ? <View style={[s.marker, { left: `${Math.min(1, Math.max(0, marker)) * 100}%` }]} /> : null}
    </View>
  );
}

export function Chip({ label, icon, color }: { label: string; icon?: IconName; color?: string }) {
  const s = useStyles();
  const t = useTheme();
  return (
    <View style={s.chip}>
      {icon ? <Icon name={icon} size={14} color={color ?? t.muted} /> : null}
      <Text style={[s.chipText, color ? { color } : null]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </View>
  );
}

/** Aviso dentro de una pantalla (resultado de una acción, un error, una aclaración). */
export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'good' | 'warn' | 'bad' }) {
  const s = useStyles();
  const t = useTheme();
  const color = tone === 'good' ? t.good : tone === 'warn' ? t.warn : tone === 'bad' ? t.danger : t.link;
  const icon: IconName = tone === 'good' ? 'check_circle' : tone === 'info' ? 'info' : 'warning';
  return (
    <View style={[s.notice, { borderColor: color }]} accessibilityRole={tone === 'bad' ? 'alert' : undefined}>
      <Icon name={icon} size={20} color={color} />
      <Text style={[s.body, s.flex]}>{text}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: ReactNode }) {
  const s = useStyles();
  const t = useTheme();
  return (
    <View style={s.empty}>
      <Icon name={icon} size={40} color={t.faint} />
      <Text style={[s.h2, s.center]}>{title}</Text>
      {text ? <Text style={[s.muted, s.center]}>{text}</Text> : null}
      {children}
    </View>
  );
}

export function Toggle({
  label,
  hint,
  value,
  onChange,
  icon,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: IconName;
}) {
  const s = useStyles();
  const t = useTheme();
  return (
    <Pressable
      style={s.toggle}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      {icon ? <Icon name={icon} color={t.muted} /> : null}
      <View style={s.flex}>
        <Text style={s.body}>{label}</Text>
        {hint ? <Text style={s.muted}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: t.primary, false: t.border }}
        thumbColor={value ? '#FFFFFF' : t.dark ? '#C9D1DB' : '#FFFFFF'}
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

export function Stepper({ label, onMinus, onPlus, a11y }: { label: string; onMinus: () => void; onPlus: () => void; a11y: string }) {
  const s = useStyles();
  const t = useTheme();
  return (
    <View style={s.stepper} accessible accessibilityRole="adjustable" accessibilityLabel={a11y} accessibilityValue={{ text: label }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? onPlus() : onMinus())}
    >
      <Pressable style={s.stepBtn} onPress={onMinus} android_ripple={{ color: t.border }} accessibilityLabel="Menos">
        <Icon name="chevron_left" size={26} color={t.strong} />
      </Pressable>
      <Text style={s.stepValue} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <Pressable style={s.stepBtn} onPress={onPlus} android_ripple={{ color: t.border }} accessibilityLabel="Más">
        <Icon name="chevron_right" size={26} color={t.strong} />
      </Pressable>
    </View>
  );
}

/** Campo numérico con etiqueta, unidad y ayuda o error debajo. */
export function Field({
  label,
  unit,
  hint,
  error,
  inRow,
  ...input
}: {
  label: string;
  unit?: string;
  hint?: string;
  error?: string | null;
  /** Va junto a otro campo en una fila: se reparten el ancho y, si no entran, bajan. */
  inRow?: boolean;
} & TextInputProps) {
  const s = useStyles();
  const t = useTheme();
  return (
    <View style={[s.field, inRow && s.fieldInRow]}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputRow, error ? { borderColor: t.danger } : null]}>
        <TextInput
          style={s.input}
          placeholderTextColor={t.muted}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          {...input}
        />
        {unit ? <Text style={s.inputUnit}>{unit}</Text> : null}
      </View>
      {error ? <Text style={[s.hint, { color: t.danger }]}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Fila de una lista de opciones que lleva a otra pantalla. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const s = useStyles();
  const t = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [s.listRow, pressed && s.pressed]}
      onPress={onPress}
      android_ripple={{ color: t.border }}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      <Icon name={icon} color={t.link} />
      <View style={s.flex}>
        <Text style={s.body}>{title}</Text>
        {subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}
      </View>
      <Icon name="chevron_right" color={t.muted} />
    </Pressable>
  );
}

export function Divider() {
  const s = useStyles();
  return <View style={s.divider} />;
}

/** Textos y estilos comunes, para las pantallas que arman su propio diseño. */
export const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  scroll: { flex: 1, backgroundColor: t.bg },
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  h1: { color: t.strong, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  h2: { color: t.strong, fontSize: 18, fontWeight: '700' },
  h3: { color: t.strong, fontSize: 16, fontWeight: '700' },
  body: { color: t.text, fontSize: 15, lineHeight: 21 },
  muted: { color: t.muted, fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: t.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.border,
    elevation: t.dark ? 0 : 1,
  },
  pressed: { opacity: 0.85 },
  metric: { gap: 2 },
  metricHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: t.muted, fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  // Ancho fijo (lo que deja el ícono): Android mide y dibuja el texto con el mismo ancho y no
  // reserva un renglón vacío que empuje el valor hacia abajo.
  metricLabel: { color: t.muted, fontSize: 12, fontWeight: '600', flex: 1 },
  value: { color: t.strong, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  valueLg: { color: t.strong, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  valueSm: { color: t.strong, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  unit: { color: t.muted, fontSize: 13, fontWeight: '600' },
  delta: { fontSize: 12, fontWeight: '700' },
  hint: { color: t.muted, fontSize: 11.5 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  buttonPrimary: { backgroundColor: t.primary },
  buttonSecondary: { backgroundColor: t.surfaceAlt },
  buttonDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.danger },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonText: { fontWeight: '700', fontSize: 15.5 },
  disabled: { opacity: 0.45 },
  segmented: { flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: 12, padding: 3 },
  segment: { flex: 1, minHeight: 40, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  // En oscuro el elegido se aclara (con la tarjeta, más oscura, parecía apagado).
  segmentActive: { backgroundColor: t.dark ? '#34414F' : t.surface, elevation: t.dark ? 0 : 2 },
  segmentText: { color: t.muted, fontWeight: '600', fontSize: 14 },
  segmentTextActive: { color: t.strong },
  bar: { height: 10, borderRadius: 5, backgroundColor: t.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: t.warn },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: t.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { color: t.muted, fontSize: 12, fontWeight: '600' },
  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: t.surface,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
  },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  stepBtn: {
    backgroundColor: t.surfaceAlt,
    borderRadius: 12,
    width: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stepValue: { color: t.strong, fontSize: 30, fontWeight: '800', minWidth: 110, textAlign: 'center', fontVariant: ['tabular-nums'] },
  field: { gap: 6 },
  // Con poco ancho o letra grande, dos campos en una fila pasan a ir uno debajo del otro.
  fieldInRow: { flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 150 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 12,
  },
  input: { flex: 1, color: t.strong, fontSize: 17, paddingVertical: 10, minHeight: 48 },
  inputUnit: { color: t.muted, fontSize: 15, fontWeight: '600' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8 },
  divider: { height: 1, backgroundColor: t.border },
}));
