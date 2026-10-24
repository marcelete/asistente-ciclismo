import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { fitBounds, MAX_ZOOM, MIN_ZOOM, project, TILE, unproject, visibleTiles } from '../../core/geo/mercator';
import type { BBox } from '../../core/geo/mercator';
import { getTile, LAYERS, CYCLOSM_ENABLED } from '../../services/tiles';
import type { MapLayer } from '../../services/tiles';
import { Icon } from '../components';
import { makeStyles, useTheme } from '../theme';

export interface MapTrack {
  coords: [number, number][];
  color: string;
  width?: number;
  opacity?: number;
}

export interface MapMarker {
  lat: number;
  lon: number;
  color: string;
  label?: string;
}

interface Props {
  tracks: MapTrack[];
  markers?: MapMarker[];
  bounds: BBox;
  height: number;
  /** Se puede arrastrar, pellizcar y cambiar de capa. */
  interactive?: boolean;
  /** Mosaicos de OpenStreetMap prendidos (Ajustes → Privacidad). Apagado, se ve una cuadrícula y no se usa la red. */
  tilesOn: boolean;
  hiddenEnds?: boolean;
  onExpand?: () => void;
  /** Punto extra (por ejemplo, tu ubicación actual). */
  me?: { lat: number; lon: number } | null;
}

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/**
 * Mapa propio con mosaicos de OpenStreetMap y trazas en SVG. Se arrastra y se pellizca con
 * PanResponder (sin Gesture Handler); al soltar se ajusta a un zoom entero. El norte queda siempre
 * arriba, así que la brújula es una flecha "N" fija.
 */
export function MapView({ tracks, markers = [], bounds, height, interactive = false, tilesOn, hiddenEnds, onExpand, me }: Props) {
  const s = useLocal();
  const t = useTheme();
  const [size, setSize] = useState({ w: 0, h: height });
  const [view, setView] = useState<{ zoom: number; lat: number; lon: number } | null>(null);
  const [layer, setLayer] = useState<MapLayer>('standard');
  const [uris, setUris] = useState<Record<string, string>>({});
  const [pan] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [scale] = useState(() => new Animated.Value(1));

  // Encuadre inicial: todo el recorrido.
  const initial = useMemo(() => (size.w > 0 ? fitBounds(bounds, size.w, size.h) : null), [bounds, size.w, size.h]);
  const cur = useMemo(() => view ?? (initial ? { zoom: initial.zoom, ...initial.center } : null), [view, initial]);

  // Los gestos leen siempre la vista más nueva.
  const live = useRef({
    cur: null as { zoom: number; lat: number; lon: number } | null,
    interactive: false,
    startDist: 0,
    lastTap: 0,
  });
  useEffect(() => {
    live.current.cur = cur;
    live.current.interactive = interactive;
  });

  const [responder, setResponder] = useState<ReturnType<typeof PanResponder.create> | null>(null);
  useEffect(() => {
    setResponder(
      PanResponder.create({
        onStartShouldSetPanResponder: () => live.current.interactive,
        onMoveShouldSetPanResponder: () => live.current.interactive,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            const d = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
            if (live.current.startDist === 0) live.current.startDist = d;
            scale.setValue(Math.max(0.4, Math.min(4, d / live.current.startDist)));
          } else if (live.current.startDist === 0) {
            pan.setValue({ x: g.dx, y: g.dy });
          }
        },
        onPanResponderRelease: (e, g) => {
          const c = live.current.cur;
          const pinch = live.current.startDist !== 0;
          const sc = (scale as unknown as { __getValue: () => number }).__getValue();
          live.current.startDist = 0;
          pan.setValue({ x: 0, y: 0 });
          scale.setValue(1);
          if (!c) return;
          if (pinch) {
            setView({ ...c, zoom: clampZoom(c.zoom + Math.round(Math.log2(sc))) });
            return;
          }
          const moved = Math.hypot(g.dx, g.dy);
          if (moved < 6) {
            // Doble toque: acerca un nivel.
            const now = e.nativeEvent.timestamp;
            if (now - live.current.lastTap < 300) setView({ ...c, zoom: clampZoom(c.zoom + 1) });
            live.current.lastTap = now;
            return;
          }
          const center = project(c.lat, c.lon, c.zoom);
          const next = unproject({ x: center.x - g.dx, y: center.y - g.dy }, c.zoom);
          setView({ zoom: c.zoom, lat: next.lat, lon: next.lon });
        },
      }),
    );
  }, [pan, scale]);

  const tiles = useMemo(() => {
    if (!cur || size.w === 0) return [];
    return visibleTiles(project(cur.lat, cur.lon, cur.zoom), cur.zoom, size.w, size.h);
  }, [cur, size.w, size.h]);

  useEffect(() => {
    if (!tilesOn) return;
    let alive = true;
    for (const tl of tiles) {
      const key = `${layer}/${tl.z}/${tl.x}/${tl.y}`;
      getTile(layer, tl.z, tl.x, tl.y).then((uri) => {
        if (alive && uri) setUris((u) => (u[key] === uri ? u : { ...u, [key]: uri }));
      });
    }
    return () => {
      alive = false;
    };
  }, [tiles, layer, tilesOn]);

  const paths = useMemo(() => {
    if (!cur || size.w === 0) return [];
    const c = project(cur.lat, cur.lon, cur.zoom);
    const to = (lat: number, lon: number) => {
      const p = project(lat, lon, cur.zoom);
      return [p.x - c.x + size.w / 2, p.y - c.y + size.h / 2] as const;
    };
    return tracks.map((tr) => ({
      d: tr.coords.map(([la, lo], i) => {
        const [x, y] = to(la, lo);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' '),
      tr,
    }));
  }, [cur, size.w, size.h, tracks]);

  const pts = useMemo(() => {
    if (!cur || size.w === 0) return [];
    const c = project(cur.lat, cur.lon, cur.zoom);
    return [...markers, ...(me ? [{ ...me, color: t.link, label: undefined }] : [])].map((m) => {
      const p = project(m.lat, m.lon, cur.zoom);
      return { x: p.x - c.x + size.w / 2, y: p.y - c.y + size.h / 2, color: m.color, label: m.label };
    });
  }, [cur, size.w, size.h, markers, me, t.link]);

  const zoomBy = (dz: number) => cur && setView({ ...cur, zoom: clampZoom(cur.zoom + dz) });
  const recenter = () => setView(null);
  const attribution = LAYERS.find((l) => l.id === layer)!.attribution;

  return (
    <View
      style={[s.box, { height, backgroundColor: t.surfaceAlt }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: height })}
      {...(interactive && responder ? responder.panHandlers : {})}
      accessibilityLabel="Mapa de la salida"
    >
      {cur ? (
        <Animated.View style={[s.layer, { width: size.w, height: size.h, transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] }]}>
          {tilesOn ? (
            tiles.map((tl) => {
              const uri = uris[`${layer}/${tl.z}/${tl.x}/${tl.y}`];
              return uri ? (
                <Image key={`${tl.x}/${tl.y}/${tl.left}`} source={{ uri }} style={{ position: 'absolute', left: tl.left, top: tl.top, width: TILE, height: TILE }} />
              ) : null;
            })
          ) : (
            <Svg width={size.w} height={size.h} style={{ position: 'absolute' }}>
              {tiles.map((tl) => (
                <Path key={`${tl.x}/${tl.y}/${tl.left}`} d={`M${tl.left},${tl.top} h${TILE} v${TILE} h-${TILE} Z`} stroke={t.border} strokeWidth={1} fill="none" />
              ))}
            </Svg>
          )}
          <Svg width={size.w} height={size.h} style={{ position: 'absolute' }}>
            {paths.map(({ d, tr }, i) => (
              <Path key={i} d={d} stroke={tr.color} strokeWidth={tr.width ?? 4} strokeOpacity={tr.opacity ?? 1} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {pts.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={7} fill={p.color} stroke="#FFFFFF" strokeWidth={2} />
            ))}
          </Svg>
        </Animated.View>
      ) : null}

      {/* Brújula: el norte siempre está arriba. */}
      <View style={s.compass} accessibilityLabel="Norte arriba">
        <Svg width={28} height={28} viewBox="0 0 28 28">
          <Circle cx={14} cy={14} r={13} fill="#FFFFFFE6" stroke={t.border} />
          <Path d="M14,4 L18,15 L14,13 L10,15 Z" fill="#C0392B" />
          <SvgText x={14} y={25} fontSize={8} fontWeight="bold" fill="#222" textAnchor="middle">
            N
          </SvgText>
          <Line x1={14} y1={13} x2={14} y2={19} stroke="#555" strokeWidth={1} />
        </Svg>
      </View>

      {hiddenEnds ? (
        <View style={s.hidden}>
          <Text style={s.hiddenText}>Inicio y final ocultos</Text>
        </View>
      ) : null}

      {interactive ? (
        <View style={s.controls}>
          <Ctl icon="add" label="Acercar" onPress={() => zoomBy(1)} />
          <Ctl icon="remove" label="Alejar" onPress={() => zoomBy(-1)} />
          <Ctl icon="my_location" label="Centrar el recorrido" onPress={recenter} />
          {tilesOn ? (
            <Ctl
              icon="layers"
              label={`Capa: ${LAYERS.find((l) => l.id === layer)!.label}`}
              onPress={() => setLayer(layer === 'standard' && CYCLOSM_ENABLED ? 'cycle' : 'standard')}
              disabled={!CYCLOSM_ENABLED}
            />
          ) : null}
        </View>
      ) : onExpand ? (
        <Pressable style={s.expand} onPress={onExpand} accessibilityRole="button" accessibilityLabel="Ampliar el mapa">
          <Icon name="open_in_full" size={18} color={t.strong} />
          <Text style={s.expandText}>Ampliar</Text>
        </Pressable>
      ) : null}

      {tilesOn ? (
        <Text style={s.attr} numberOfLines={1}>
          {attribution}
        </Text>
      ) : null}
    </View>
  );
}

function Ctl({ icon, label, onPress, disabled }: { icon: 'add' | 'remove' | 'my_location' | 'layers'; label: string; onPress: () => void; disabled?: boolean }) {
  const s = useLocal();
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={[s.ctl, disabled && { opacity: 0.5 }]}>
      <Icon name={icon} size={22} color={t.strong} />
    </Pressable>
  );
}

const useLocal = makeStyles((t) => ({
  box: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  layer: { position: 'absolute', left: 0, top: 0 },
  compass: { position: 'absolute', left: 8, top: 8 },
  hidden: { position: 'absolute', left: 8, bottom: 8, backgroundColor: t.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  hiddenText: { color: t.strong, fontSize: 12, fontWeight: '600' },
  controls: { position: 'absolute', right: 8, top: 8, gap: 6 },
  ctl: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border },
  expand: { position: 'absolute', right: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  expandText: { color: t.strong, fontWeight: '600', fontSize: 13 },
  attr: { position: 'absolute', right: 6, bottom: 4, fontSize: 10, color: '#222', backgroundColor: '#FFFFFFB3', paddingHorizontal: 4, borderRadius: 4, maxWidth: '70%' },
}));
