import { useLocalSearchParams } from 'expo-router';
import { RideDetailScreen } from '../../ui/screens/RideDetailScreen';

export { RouteError as ErrorBoundary } from '../../ui/ErrorBoundary';

/** Detalle de una salida: /salida/gpx:1760882051288. */
export default function RideRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RideDetailScreen id={typeof id === 'string' ? id : ''} />;
}
