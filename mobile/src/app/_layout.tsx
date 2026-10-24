import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationTheme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { View } from 'react-native';
import { AwardsProvider } from '../data/awards';
import { StoreProvider, useStore } from '../data/store';
import { installGlobalErrorHandlers } from '../services/log';
import { ErrorBoundary as AppErrorBoundary } from '../ui/ErrorBoundary';
import { CelebrationHost } from '../ui/awards/CelebrationHost';
import { IntroOverlay } from '../ui/intro/IntroOverlay';
import { PowerSaverLaunchAlert } from '../ui/PowerSaverNotice';
import { ThemeProvider, useTheme } from '../ui/theme';

installGlobalErrorHandlers();

// El splash nativo se queda hasta que la intro se dibuja (o salta un error, o pasan 3 s): sin destello en blanco.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true });
setTimeout(() => SplashScreen.hide(), 3000);

export { RouteError as ErrorBoundary } from '../ui/ErrorBoundary';

/** Navegación con los colores del tema: fondo de pantallas, encabezados y barra de pestañas. */
function Navigation() {
  const t = useTheme();
  const navTheme = useMemo(() => {
    const base = t.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, primary: t.link, background: t.bg, card: t.surface, text: t.strong, border: t.border, notification: t.danger },
    };
  }, [t]);
  return (
    <NavigationTheme value={navTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.surface },
          headerTintColor: t.strong,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="salida/[id]" options={{ title: 'Salida' }} />
        <Stack.Screen name="perfil" options={{ title: 'Perfil' }} />
        <Stack.Screen name="registro" options={{ title: 'Registro' }} />
        <Stack.Screen name="simulacion" options={{ title: 'Simulación' }} />
        <Stack.Screen name="bienvenida" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="mapa/[id]" options={{ title: 'Mapa' }} />
        <Stack.Screen name="segmento/[id]" options={{ title: 'Segmento' }} />
        <Stack.Screen name="bicis" options={{ title: 'Mis bicis' }} />
        <Stack.Screen name="exportar" options={{ title: 'Exportar e importar' }} />
      </Stack>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
    </NavigationTheme>
  );
}

function Themed() {
  const { settings, startupDone } = useStore();
  return (
    <ThemeProvider preference={settings.theme}>
      <AwardsProvider>
        <View style={{ flex: 1 }}>
          <Navigation />
          <CelebrationHost />
          <IntroOverlay />
          <PowerSaverLaunchAlert ready={startupDone && settings.onboardingDone} />
        </View>
      </AwardsProvider>
    </ThemeProvider>
  );
}

/**
 * Raíz de la app. Si la base no abre, el error lo atrapa `ErrorBoundary` y muestra un aviso con el
 * tema del sistema (todavía no se pudo leer el elegido).
 */
export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <StoreProvider>
        <Themed />
      </StoreProvider>
    </AppErrorBoundary>
  );
}
