import { Pressable, View } from 'react-native';
import { SPORT_WORDS, TRAIN_SPORTS } from '../core/stats/sport';
import { useStore } from '../data/store';
import { log } from '../services/log';
import { Icon } from './components';
import { makeStyles, useTheme } from './theme';

/**
 * Selector del deporte que se mira y se entrena (pedido 15): bici o correr. Va al lado del título
 * de Resumen, Salidas, Logros y Entrenar; el cambio vale para toda la app.
 */
export function SportSwitch() {
  const { settings, updateSettings } = useStore();
  const l = useLocal();
  const t = useTheme();
  return (
    <View style={l.row} accessibilityRole="radiogroup" accessibilityLabel="Deporte">
      {TRAIN_SPORTS.map((sp) => {
        const active = settings.sport === sp;
        return (
          <Pressable
            key={sp}
            style={[l.item, active && l.active]}
            onPress={() => {
              if (!active) updateSettings({ sport: sp }).catch((e) => log('error', 'ui', 'No se pudo cambiar el deporte', e));
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={SPORT_WORDS[sp].name}
            hitSlop={4}
          >
            <Icon name={SPORT_WORDS[sp].icon} size={22} color={active ? t.primary : t.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const useLocal = makeStyles((t) => ({
  row: { flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: 12, padding: 3, alignSelf: 'center' },
  item: { width: 48, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  active: { backgroundColor: t.dark ? '#34414F' : t.surface, elevation: t.dark ? 0 : 2 },
}));
