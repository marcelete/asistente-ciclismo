import * as SplashScreen from 'expo-splash-screen';
import { Component, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { describeError } from '../core/log/redact';
import { log } from '../services/log';
import { Button, Card, Icon, Screen, useStyles } from './components';
import { useTheme } from './theme';

/** Aviso de error con la opción de reintentar. Sin datos personales: el texto pasa por `redact`. */
export function ErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  // Si la app falla al arrancar, el splash nativo no puede quedar tapando el aviso.
  useEffect(() => {
    SplashScreen.hide();
  }, []);
  const s = useStyles();
  const t = useTheme();
  return (
    <Screen title="Algo salió mal">
      <Card>
        <Icon name="error" size={36} color={t.danger} />
        <Text style={s.body}>
          La app tuvo un error y no pudo mostrar esta pantalla. Tus datos no se borraron. Probá de nuevo; si se repite,
          cerrá la app y volvé a abrirla.
        </Text>
        <Text style={s.muted} selectable>
          {describeError(error)}
        </Text>
        <Button title="Reintentar" icon="replay" onPress={onRetry} />
      </Card>
    </Screen>
  );
}

interface State {
  error: unknown;
}

/**
 * Atrapa los errores al dibujar fuera de la navegación (por ejemplo, si la base no abre) y muestra
 * el aviso, en lugar de que la app se cierre sin decir nada.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown): void {
    log('error', 'ui', 'Error al dibujar la app', error);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return <ErrorScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />;
  }
}

/** Para exportar como `ErrorBoundary` desde cada ruta: un error en una pantalla no tumba las demás. */
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    log('error', 'ui', 'Error al dibujar la pantalla', error);
  }, [error]);
  return <ErrorScreen error={error} onRetry={retry} />;
}
