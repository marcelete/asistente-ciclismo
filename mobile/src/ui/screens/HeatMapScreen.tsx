import { useMemo } from 'react';
import { Text } from 'react-native';
import { PRIVACY_ZONE_M } from '../../core/elevation/privacy';
import type { BBox } from '../../core/geo/mercator';
import { decodePolyline } from '../../core/geo/polylineCodec';
import { trimTraceEnds } from '../../core/geo/rideGeo';
import { loadGeos } from '../../data/dbGeo';
import { useStore } from '../../data/store';
import { Card, EmptyState, useStyles } from '../components';
import { MapView } from '../map/MapView';
import type { MapTrack } from '../map/MapView';
import { useTheme } from '../theme';

/** Cuántas salidas y vértices como máximo se dibujan a la vez. */
const MAX_RIDES = 400;
const MAX_VERTICES = 60_000;

/** Mapa de calor: las trazas de tus salidas recientes en bici, semitransparentes; donde se superponen, se ve el calor. */
export function HeatMapPanel() {
  const { rides, settings, change } = useStore();
  const s = useStyles();
  const t = useTheme();
  const hide = settings.hideMapEnds;

  const data = useMemo(() => {
    const ids = rides.slice(0, MAX_RIDES).map((r) => r.id);
    const geos = loadGeos(ids);
    if (geos.length === 0) return null;
    const bbox: BBox = { minLat: 90, minLon: 180, maxLat: -90, maxLon: -180 };
    let vertices = 0;
    const raw = geos.map((g) => {
      bbox.minLat = Math.min(bbox.minLat, g.bbox.minLat);
      bbox.minLon = Math.min(bbox.minLon, g.bbox.minLon);
      bbox.maxLat = Math.max(bbox.maxLat, g.bbox.maxLat);
      bbox.maxLon = Math.max(bbox.maxLon, g.bbox.maxLon);
      let c = decodePolyline(g.trace);
      if (hide) c = trimTraceEnds(c, PRIVACY_ZONE_M);
      vertices += c.length;
      return c;
    });
    // Si hay demasiados vértices se saltean algunos de cada traza.
    const step = Math.max(1, Math.ceil(vertices / MAX_VERTICES));
    const tracks: MapTrack[] = raw
      .filter((c) => c.length >= 2)
      .map((c) => ({ coords: step === 1 ? c : c.filter((_, i) => i % step === 0 || i === c.length - 1), color: t.link, width: 3, opacity: 0.25 }));
    return { bbox, tracks, count: geos.length };
    // `change.seq` cubre las salidas que se indexan después de abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rides, hide, t, change.seq]);

  if (!data) {
    return <EmptyState icon="map" title="Todavía no hay recorridos" text="Cuando se indexen tus salidas en bici vas a ver acá todos tus caminos." />;
  }
  return (
    <>
      <MapView tracks={data.tracks} bounds={data.bbox} height={420} interactive tilesOn={settings.mapTiles} hiddenEnds={hide} />
      <Card>
        <Text style={s.muted}>
          {data.count} {data.count === 1 ? 'salida reciente' : 'salidas recientes'} en bici. Donde más se superponen, más se marca el camino.
        </Text>
      </Card>
    </>
  );
}
