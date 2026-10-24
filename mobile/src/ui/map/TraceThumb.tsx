import { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { decodePolyline } from '../../core/geo/polylineCodec';
import { loadRideGeo } from '../../data/dbGeo';
import { useTheme } from '../theme';

/** Miniatura de la traza de una salida, solo en SVG (sin mosaicos, no gasta red). */
export function TraceThumb({ rideId, width = 56, height = 40, version }: { rideId: string; width?: number; height?: number; version?: number }) {
  const t = useTheme();
  const d = useMemo(() => {
    const geo = loadRideGeo(rideId);
    if (!geo) return null;
    const pts = decodePolyline(geo.trace);
    if (pts.length < 2) return null;
    const { minLat, maxLat, minLon, maxLon } = geo.bbox;
    // Escala en metros aproximados para que no se deforme.
    const kLon = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const w = Math.max(1e-6, (maxLon - minLon) * kLon);
    const h = Math.max(1e-6, maxLat - minLat);
    const k = Math.min((width - 6) / w, (height - 6) / h);
    const ox = (width - w * k) / 2;
    const oy = (height - h * k) / 2;
    return pts
      .map(([la, lo], i) => `${i === 0 ? 'M' : 'L'}${(ox + (lo - minLon) * kLon * k).toFixed(1)},${(oy + (maxLat - la) * k).toFixed(1)}`)
      .join(' ');
    // `version` fuerza a releer cuando se vuelve a indexar la salida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, width, height, version]);
  if (!d) return null;
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={d} stroke={t.link} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
