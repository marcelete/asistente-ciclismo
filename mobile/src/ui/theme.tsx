import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Appearance, StyleSheet, useColorScheme } from 'react-native';
import type { ThemePreference } from '../data/settings';

/**
 * Paletas clara y oscura. Todo texto pasa el contraste AA (4,5:1) sobre los fondos de la app; los
 * colores de cada métrica son los mismos en íconos, gráficos y leyendas.
 */
export interface Palette {
  dark: boolean;
  bg: string;
  /** Fondo de las tarjetas. */
  surface: string;
  /** Fondo de campos, controles segmentados y elementos apretados. */
  surfaceAlt: string;
  border: string;
  text: string;
  strong: string;
  muted: string;
  /** Solo para detalles decorativos o deshabilitados, nunca para texto que haya que leer. */
  faint: string;
  /** Fondo de los botones principales (con texto blanco). */
  primary: string;
  onPrimary: string;
  /** Enlaces e íconos activos sobre el fondo. */
  link: string;
  good: string;
  warn: string;
  danger: string;
  metric: {
    distance: string;
    time: string;
    elevation: string;
    speed: string;
    hr: string;
    power: string;
    dem: string;
    gps: string;
  };
  /** Zonas de FC 1 a 5. */
  zones: [string, string, string, string, string];
  grid: string;
}

export const LIGHT: Palette = {
  dark: false,
  bg: '#F2F4F7',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EDF2',
  border: '#D8DEE6',
  text: '#1C2430',
  strong: '#0A0F16',
  muted: '#5B6675',
  faint: '#A7B0BC',
  primary: '#1F6FD6',
  onPrimary: '#FFFFFF',
  link: '#1A62C0',
  good: '#15712F',
  warn: '#8A5A00',
  danger: '#C42B2B',
  metric: {
    distance: '#1A62C0',
    time: '#7444C4',
    elevation: '#B5400B',
    speed: '#0B7480',
    hr: '#C81E52',
    power: '#8A5A00',
    dem: '#076C94',
    gps: '#5F6977',
  },
  zones: ['#7D8DA1', '#1F6FD6', '#15803D', '#C2620A', '#C42B2B'],
  grid: '#E1E6EC',
};

export const DARK: Palette = {
  dark: true,
  bg: '#0D1218',
  surface: '#161D26',
  surfaceAlt: '#1F2833',
  border: '#2B3644',
  text: '#E3EAF2',
  strong: '#FFFFFF',
  muted: '#97A5B6',
  faint: '#4A5664',
  primary: '#1F6FD6',
  onPrimary: '#FFFFFF',
  link: '#6AAEFF',
  good: '#4AC26B',
  warn: '#E3B341',
  danger: '#FF7070',
  metric: {
    distance: '#5EA8FF',
    time: '#B794F6',
    elevation: '#FB923C',
    speed: '#3CCBD6',
    hr: '#FF7096',
    power: '#E3B341',
    dem: '#56CCF2',
    gps: '#8B98A8',
  },
  zones: ['#8FA3BC', '#5EA8FF', '#4AC26B', '#F5A524', '#FF6B6B'],
  grid: '#233040',
};

const ThemeCtx = createContext<Palette | null>(null);

/**
 * Aplica el tema elegido en Ajustes: el del sistema, o siempre claro u oscuro. También fuerza el
 * modo en lo nativo (diálogos, selectores, teclado) y pinta el fondo raíz para que no haya
 * destellos blancos al girar la pantalla o abrir el teclado.
 */
export function ThemeProvider({ preference, children }: { preference: ThemePreference; children: ReactNode }) {
  const system = useColorScheme();
  useEffect(() => {
    try {
      Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    } catch {
      // Sin módulo nativo de apariencia (pruebas): alcanza con el tema de la app.
    }
  }, [preference]);
  const palette = (preference === 'system' ? system : preference) === 'dark' ? DARK : LIGHT;
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(palette.bg).catch(() => {});
  }, [palette]);
  return <ThemeCtx.Provider value={palette}>{children}</ThemeCtx.Provider>;
}

/** La paleta activa; fuera del proveedor (la pantalla de error raíz) sigue al sistema. */
export function useTheme(): Palette {
  const ctx = useContext(ThemeCtx);
  const system = useColorScheme();
  return ctx ?? (system === 'dark' ? DARK : LIGHT);
}

/**
 * Hojas de estilo que dependen del tema. Se arman una vez por paleta y se reusan:
 * `const useStyles = makeStyles((t) => ({ title: { color: t.strong } }))`.
 */
export function makeStyles<T extends Styles>(
  // El tipo contextual (como en StyleSheet.create) mantiene los literales: 'row' no pasa a string.
  build: (t: Palette) => T & Styles,
): () => Readonly<T> {
  const cache = new Map<Palette, Readonly<T>>();
  return function useStyles() {
    const t = useTheme();
    const hit = cache.get(t);
    if (hit) return hit;
    const created = StyleSheet.create(build(t));
    cache.set(t, created);
    return created;
  };
}

/** Lo que acepta StyleSheet.create (RN 0.88 no exporta el tipo con nombre). */
type Styles = Parameters<typeof StyleSheet.create>[0];
