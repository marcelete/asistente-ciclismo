import { useLocalSearchParams } from 'expo-router';
import { SegmentDetailScreen } from '../../ui/screens/SegmentDetailScreen';

export { RouteError as ErrorBoundary } from '../../ui/ErrorBoundary';

/** Detalle de un segmento: /segmento/seg-1760882051288. */
export default function SegmentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SegmentDetailScreen id={typeof id === 'string' ? id : ''} />;
}
