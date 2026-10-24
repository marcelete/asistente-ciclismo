import { Pressable, Text, View } from 'react-native';
import { tireLabel } from '../core/bikes/bikes';
import type { Bike } from '../core/bikes/bikes';
import { makeStyles, useTheme } from './theme';

/** Elige una bici de la lista (las retiradas no se ofrecen salvo que sea la actual). */
export function BikePicker({
  bikes,
  value,
  onChange,
  label = 'Bici',
}: {
  bikes: Bike[];
  /** Id de la bici elegida; null para "la de por defecto". */
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
}) {
  const s = useLocal();
  const t = useTheme();
  const shown = bikes.filter((b) => !b.retired || b.id === value);
  return (
    <View style={s.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {shown.map((b) => {
        const selected = b.id === value;
        const tire = tireLabel(b);
        return (
          <Pressable
            key={b.id}
            onPress={() => onChange(b.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${b.name}${tire ? `, cubiertas ${tire}` : ''}`}
            style={[s.chip, { backgroundColor: selected ? t.primary : t.surfaceAlt }]}
          >
            <Text style={[s.text, { color: selected ? t.onPrimary : t.strong }]} numberOfLines={1}>
              {b.name}
              {tire ? ` · ${tire}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useLocal = makeStyles(() => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 44, borderRadius: 22, justifyContent: 'center', maxWidth: '100%' },
  text: { fontSize: 14, fontWeight: '600' },
}));
