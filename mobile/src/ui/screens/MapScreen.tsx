import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, useWindowDimensions } from 'react-native';
import { PRIVACY_ZONE_M } from '../../core/elevation/privacy';
import { decodePolyline } from '../../core/geo/polylineCodec';
import { trimTraceEnds } from '../../core/geo/rideGeo';
import { loadProfile } from '../../data/db';
import { loadRideGeo } from '../../data/dbGeo';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { createSegment, SEGMENT_MAX_M, SEGMENT_MIN_M, segmentFromProfile } from '../../services/segments';
import { Button, Card, Field, Notice, Stepper, useStyles } from '../components';
import { MapView } from '../map/MapView';
import { useTheme } from '../theme';

const STEP_KM = 0.1;

/** Mapa de la salida a pantalla casi completa, para mover y acercar; también para crear un segmento. */
export function MapScreen({ id }: { id: string }) {
  const { settings, reloadAll } = useStore();
  const { height } = useWindowDimensions();
  const s = useStyles();
  const t = useTheme();
  const profile = useMemo(() => loadProfile(id), [id]);
  const geo = useMemo(() => loadRideGeo(id), [id]);
  const hide = settings.hideMapEnds;
  const totalKm = profile && profile.length > 0 ? profile[profile.length - 1].d / 1000 : 0;

  const [creating, setCreating] = useState(false);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(Math.min(totalKm, 1));
  const [name, setName] = useState('');
  const [note, setNote] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);

  const slice = useMemo(() => (profile ? profile.filter((p) => p.d / 1000 >= from && p.d / 1000 <= to) : []), [profile, from, to]);
  const lengthM = slice.length > 1 ? slice[slice.length - 1].d - slice[0].d : 0;
  const valid = lengthM >= SEGMENT_MIN_M && lengthM <= SEGMENT_MAX_M;

  const tracks = useMemo(() => {
    if (!geo) return [];
    let coords = decodePolyline(geo.trace);
    if (hide) coords = trimTraceEnds(coords, PRIVACY_ZONE_M);
    const base = { coords, color: t.link, width: 4, opacity: creating ? 0.5 : 1 };
    const sel = creating && slice.length > 1 ? [{ coords: slice.map((p) => [p.lat, p.lon] as [number, number]), color: t.danger, width: 6 }] : [];
    return [base, ...sel];
  }, [geo, hide, t, creating, slice]);

  const create = async () => {
    if (!profile || !valid) return;
    const seg = segmentFromProfile(name || `Segmento km ${from.toFixed(1)}`, slice, id);
    if (!seg) {
      setNote({ text: 'El segmento tiene que medir entre 300 m y 50 km.', tone: 'bad' });
      return;
    }
    try {
      await createSegment(seg);
      reloadAll([]);
      setNote({ text: 'Segmento guardado. Lo ves en Salidas → Segmentos.', tone: 'good' });
      setCreating(false);
    } catch (e) {
      log('error', 'segments', 'No se pudo guardar el segmento', e);
      setNote({ text: 'No se pudo guardar el segmento.', tone: 'bad' });
    }
  };

  if (!geo) return <Text style={s.muted}>Esta salida todavía no tiene mapa.</Text>;

  return (
    <ScrollView contentContainerStyle={{ padding: 8, gap: 8 }}>
      <MapView
        tracks={tracks}
        markers={hide ? [] : [{ lat: geo.start.lat, lon: geo.start.lon, color: t.good }, { lat: geo.end.lat, lon: geo.end.lon, color: t.danger }]}
        bounds={geo.bbox}
        height={Math.max(300, height - (creating ? 420 : 200))}
        interactive
        tilesOn={settings.mapTiles}
        hiddenEnds={hide}
      />
      {note ? <Notice text={note.text} tone={note.tone} /> : null}
      {!creating ? (
        <>
          <Text style={s.muted}>Arrastrá para mover, pellizcá o tocá dos veces para acercar.</Text>
          {profile && totalKm * 1000 >= SEGMENT_MIN_M ? (
            <Button title="Crear segmento" icon="add_road" variant="secondary" onPress={() => setCreating(true)} />
          ) : null}
        </>
      ) : (
        <Card>
          <Text style={s.h3}>Crear segmento</Text>
          <Text style={s.muted}>Elegí desde qué kilómetro hasta cuál (entre 300 m y 50 km). El tramo se marca en rojo.</Text>
          <Text style={s.label}>Desde el km {from.toFixed(1)}</Text>
          <Stepper
            label={`${from.toFixed(1)} km`}
            a11y="Kilómetro de inicio"
            onMinus={() => setFrom((v) => Math.max(0, +(v - STEP_KM).toFixed(1)))}
            onPlus={() => setFrom((v) => Math.min(+(to - STEP_KM).toFixed(1), +(v + STEP_KM).toFixed(1)))}
          />
          <Text style={s.label}>Hasta el km {to.toFixed(1)}</Text>
          <Stepper
            label={`${to.toFixed(1)} km`}
            a11y="Kilómetro de fin"
            onMinus={() => setTo((v) => Math.max(+(from + STEP_KM).toFixed(1), +(v - STEP_KM).toFixed(1)))}
            onPlus={() => setTo((v) => Math.min(+totalKm.toFixed(1), +(v + STEP_KM).toFixed(1)))}
          />
          <Text style={valid ? s.muted : [s.muted, { color: t.danger }]}>
            Largo: {(lengthM / 1000).toFixed(2)} km {valid ? '' : '(tiene que estar entre 0,3 y 50 km)'}
          </Text>
          <Field label="Nombre" value={name} onChangeText={setName} placeholder="Por ejemplo, Subida al dique" maxLength={80} />
          <Button title="Guardar segmento" icon="save" onPress={create} disabled={!valid} />
          <Button title="Cancelar" variant="secondary" onPress={() => setCreating(false)} />
        </Card>
      )}
      <Button title="Volver" variant="ghost" onPress={() => router.back()} />
    </ScrollView>
  );
}
