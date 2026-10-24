import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';
import type { ColorValue } from 'react-native';
import { useStore } from '../../data/store';
import { Icon } from '../../ui/components';
import type { IconName } from '../../ui/components';
import { useTheme } from '../../ui/theme';

export { RouteError as ErrorBoundary } from '../../ui/ErrorBoundary';

function tabIcon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} size={26} color={String(color)} />;
  };
}

/** Las cinco pestañas. El botón "atrás" de Android vuelve primero a Resumen. */
export default function TabsLayout() {
  const t = useTheme();
  const { settings } = useStore();
  // La primera vez (o después de borrar todo) se pasa por la bienvenida.
  if (!settings.onboardingDone) return <Redirect href="/bienvenida" />;
  return (
    <Tabs
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.link,
        tabBarInactiveTintColor: t.muted,
        // Margen a los costados: con cinco pestañas repartidas a todo el ancho los íconos quedaban muy separados.
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border, paddingHorizontal: 16 },
        // Un poco de aire debajo del texto: pegado, parecía cortado contra los botones de Android.
        tabBarItemStyle: { paddingBottom: 6, paddingTop: 2 },
        sceneStyle: { backgroundColor: t.bg },
        tabBarLabel: ({ color, children }) => (
          <Text style={{ color: String(color), fontSize: 11.5, fontWeight: '600' }} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {children}
          </Text>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Resumen', tabBarIcon: tabIcon('bar_chart') }} />
      <Tabs.Screen name="salidas" options={{ title: 'Salidas', tabBarIcon: tabIcon('directions_bike') }} />
      <Tabs.Screen name="logros" options={{ title: 'Logros', tabBarIcon: tabIcon('emoji_events') }} />
      <Tabs.Screen name="metas" options={{ title: 'Metas', tabBarIcon: tabIcon('flag') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: tabIcon('settings') }} />
    </Tabs>
  );
}
