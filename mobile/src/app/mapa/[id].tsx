import { useLocalSearchParams } from 'expo-router';
import { MapScreen } from '../../ui/screens/MapScreen';

export { RouteError as ErrorBoundary } from '../../ui/ErrorBoundary';

/** Mapa ampliado de una salida: /mapa/gpx:1760882051288. */
export default function MapRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MapScreen id={typeof id === 'string' ? id : ''} />;
}
