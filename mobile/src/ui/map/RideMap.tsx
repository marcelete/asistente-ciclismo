import { useMemo } from 'react';
import { decodePolyline } from '../../core/geo/polylineCodec';
import { trimTraceEnds } from '../../core/geo/rideGeo';
import { PRIVACY_ZONE_M } from '../../core/elevation/privacy';
import { loadRideGeo } from '../../data/dbGeo';
import { useStore } from '../../data/store';
import { useTheme } from '../theme';
import { MapView } from './MapView';
import type { MapMarker, MapTrack } from './MapView';

/** El mapa de una salida: su traza, el inicio y el final (o "ocultos" según el ajuste). */
export function RideMap({ rideId, height, interactive, onExpand, version }: { rideId: string; height: number; interactive?: boolean; onExpand?: () => void; version?: number }) {
  const { settings } = useStore();
  const t = useTheme();
  const hide = settings.hideMapEnds;
  const data = useMemo(() => {
    const geo = loadRideGeo(rideId);
    if (!geo) return null;
    let coords = decodePolyline(geo.trace);
    if (hide) coords = trimTraceEnds(coords, PRIVACY_ZONE_M);
    if (coords.length < 2) return { geo, tracks: [] as MapTrack[], markers: [] as MapMarker[] };
    const markers: MapMarker[] = hide
      ? []
      : [
          { lat: geo.start.lat, lon: geo.start.lon, color: t.good },
          { lat: geo.end.lat, lon: geo.end.lon, color: t.danger },
        ];
    return { geo, tracks: [{ coords, color: t.link, width: 4 }] as MapTrack[], markers };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, hide, t, version]);
  if (!data) return null;
  return (
    <MapView
      tracks={data.tracks}
      markers={data.markers}
      bounds={data.geo.bbox}
      height={height}
      interactive={interactive}
      onExpand={onExpand}
      tilesOn={settings.mapTiles}
      hiddenEnds={hide}
    />
  );
}
