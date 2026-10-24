import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { RefreshControl, SectionList, Text, View } from 'react-native';
import { monthName } from '../../core/stats/periods';
import { countsAsRide } from '../../core/stats/sport';
import type { RideRecord } from '../../core/stats/rides';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { OPENTRACKS_FDROID, openOpenTracks } from '../../services/openTracks';
import { confirmRecordingWithPowerSaver } from '../../services/powerSaver';
import { Button, Card, Column, Icon, Notice, ProgressBar, ScreenTitle, StatusBarScrim, Toggle, useScreenPadding, useStyles } from '../components';
import { formatKm, formatRideDate } from '../format';
import { useNow } from '../hooks';
import { PowerSaverNotice } from '../PowerSaverNotice';
import { RideRow } from '../RideRow';
import { makeStyles, useTheme } from '../theme';

interface MonthSection {
  key: string;
  title: string;
  summary: string;
  data: RideRecord[];
}

/** Agrupa las salidas (ya ordenadas de la más nueva a la más vieja) por mes. */
function byMonth(rides: RideRecord[]): MonthSection[] {
  const out: MonthSection[] = [];
  for (const r of rides) {
    const d = new Date(r.startT);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let sec = out[out.length - 1];
    if (!sec || sec.key !== key) {
      const name = monthName(d.getMonth());
      sec = { key, title: `${name[0].toUpperCase()}${name.slice(1)} de ${d.getFullYear()}`, summary: '', data: [] };
      out.push(sec);
    }
    sec.data.push(r);
  }
  for (const sec of out) {
    const km = sec.data.reduce((a, r) => a + r.distance, 0);
    sec.summary = `${sec.data.length} ${sec.data.length === 1 ? 'salida' : 'salidas'} · ${formatKm(km)} km`;
  }
  return out;
}

/** Cómo configurar OpenTracks, para la primera vez. */
function Onboarding({ onPick, busy }: { onPick: () => void; busy: boolean }) {
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const steps = [
    'En OpenTracks: Ajustes → Import and Export → elegí una carpeta de exportación.',
    'Activá "Instant post-workout export" y poné el formato en GPX.',
    'Acá, tocá "Elegir carpeta" y elegí esa misma carpeta. Desde ahí, cada salida nueva se importa sola al abrir la app.',
  ];
  return (
    <Card>
      <View style={l.head}>
        <Icon name="folder_open" size={28} color={t.link} />
        <Text style={[s.h2, s.flex]}>Conectá la carpeta de OpenTracks</Text>
      </View>
      {steps.map((text, i) => (
        <View key={i} style={l.step}>
          <View style={[l.stepNum, { backgroundColor: t.surfaceAlt }]}>
            <Text style={l.stepNumText}>{i + 1}</Text>
          </View>
          <Text style={[s.body, s.flex]}>{text}</Text>
        </View>
      ))}
      <Button title="Elegir carpeta" icon="folder_open" onPress={onPick} loading={busy} />
    </Card>
  );
}

export function RidesScreen({ switcher }: { switcher?: ReactNode }) {
  const { rides, allRides, settings, syncFolder, syncing, progress, lastSync, pendingDem } = useStore();
  const now = useNow();
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const padding = useScreenPadding();
  const [note, setNote] = useState<{ text: string; at: number; ok: boolean } | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const others = allRides.length - rides.length;
  const sections = useMemo(
    () => byMonth(showOthers ? allRides : allRides.filter(countsAsRide)),
    [allRides, showOthers],
  );

  const openTracks = async () => {
    const at = Date.now();
    try {
      // Con el ahorro de energía encendido el GPS se corta al bloquear: se avisa antes de grabar.
      if (!(await confirmRecordingWithPowerSaver())) return;
      if (!(await openOpenTracks())) {
        setNote({ text: `OpenTracks no está instalada. Se baja de F-Droid: ${OPENTRACKS_FDROID}`, at, ok: false });
      }
    } catch (e) {
      log('error', 'ui', 'No se pudo abrir OpenTracks', e);
      setNote({ text: 'No se pudo abrir OpenTracks.', at, ok: false });
    }
  };

  const run = async (pick: boolean) => {
    const at = Date.now();
    try {
      setNote({ text: await syncFolder(pick), at, ok: true });
    } catch (e) {
      log('error', 'import', 'Falló la lectura de la carpeta', e);
      setNote({ text: 'No se pudo leer la carpeta. El detalle quedó en Ajustes → Registro.', at, ok: false });
    }
  };

  // Se muestra el resultado más nuevo: el de tu búsqueda o el de la automática al volver a la app.
  const status = lastSync;
  const latest = status && (!note || status.at >= note.at) ? status : note;
  const message = latest ? ('message' in latest ? latest.message : latest.text) : null;
  const tone = latest && !latest.ok ? 'bad' : 'info';

  const header = (
    <Column>
      <ScreenTitle title="Salidas" subtitle={rides.length > 0 ? `${rides.length} en el historial` : undefined} />
      {switcher}
      <PowerSaverNotice />
      {!settings.folderUri ? (
        <Onboarding onPick={() => run(true)} busy={syncing} />
      ) : (
        <Card>
          <View style={l.head}>
            <Icon name="folder_open" color={t.link} />
            <View style={s.flex}>
              <Text style={s.h3}>Carpeta de OpenTracks</Text>
              <Text style={s.muted}>
                {status ? `Última búsqueda: ${formatRideDate(status.at, now).toLowerCase()}` : 'Se revisa sola al abrir la app.'}
              </Text>
            </View>
          </View>
          {syncing && progress && progress.total > 0 ? (
            <View style={l.progress}>
              <Text style={s.muted}>
                {progress.stage === 'import'
                  ? `Importando ${Math.min(progress.done + 1, progress.total)} de ${progress.total} archivos…`
                  : `Actualizando ${Math.min(progress.done + 1, progress.total)} de ${progress.total} salidas guardadas…`}
              </Text>
              <ProgressBar fraction={progress.done / progress.total} />
            </View>
          ) : null}
          <View style={l.buttons}>
            <Button title="Buscar salidas nuevas" icon="sync" onPress={() => run(false)} loading={syncing} style={l.mainButton} />
            <Button title="Cambiar carpeta" variant="secondary" onPress={() => run(true)} disabled={syncing} style={l.grow} />
          </View>
          <Button title="Abrir OpenTracks" icon="open_in_new" variant="ghost" onPress={openTracks} />
        </Card>
      )}
      {others > 0 ? (
        <Card>
          <Toggle
            icon="visibility"
            label="Mostrar otras actividades"
            hint={`${others} ${others === 1 ? 'actividad no cuenta' : 'actividades no cuentan'} como salida en bici (caminatas, por ejemplo). Se ven en la lista pero no suman a nada.`}
            value={showOthers}
            onChange={setShowOthers}
          />
        </Card>
      ) : null}
      {message ? <Notice text={message} tone={tone} /> : null}
      {pendingDem > 0 ? (
        <Notice
          tone="info"
          text={
            settings.demOnline
              ? `${pendingDem} ${pendingDem === 1 ? 'salida espera' : 'salidas esperan'} la altitud del mapa: se consulta sola cuando hay internet.`
              : `${pendingDem} ${pendingDem === 1 ? 'salida usa' : 'salidas usan'} la altitud del GPS: la consulta del mapa está apagada en Ajustes → Privacidad.`
          }
        />
      ) : null}
    </Column>
  );

  return (
    <View style={s.flex}>
      <SectionList
        style={l.list}
        contentContainerStyle={padding}
        sections={sections}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        refreshControl={
          settings.folderUri ? (
            <RefreshControl
              refreshing={false}
              onRefresh={() => run(false)}
              colors={[t.primary]}
              progressBackgroundColor={t.surface}
              tintColor={t.link}
            />
          ) : undefined
        }
        renderSectionHeader={({ section }) => (
          <View style={l.sectionHead} accessibilityRole="header">
            <Text style={s.h2}>{section.title}</Text>
            <Text style={s.muted}>{section.summary}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={l.item}>
            <RideRow ride={item} now={now} autoPause={settings.autoPause} />
          </View>
        )}
        ListEmptyComponent={
          settings.folderUri && !syncing ? (
            <View style={l.item}>
              <Card>
                <Text style={s.body}>
                  Todavía no hay salidas en la carpeta. Cuando termines una grabación en OpenTracks, volvé a la app o deslizá
                  hacia abajo para buscarla.
                </Text>
                <Button title="Abrir OpenTracks" icon="open_in_new" variant="secondary" onPress={openTracks} />
              </Card>
            </View>
          ) : undefined
        }
        initialNumToRender={8}
        windowSize={7}
      />
      <StatusBarScrim />
    </View>
  );
}

const useLocal = makeStyles((t) => ({
  list: { flex: 1, backgroundColor: t.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: t.strong, fontWeight: '800' },
  progress: { gap: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Si los dos no entran en una fila (celular angosto o letra grande), cada uno va en la suya.
  mainButton: { flexGrow: 1, minWidth: 220 },
  grow: { flexGrow: 1 },
  sectionHead: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 20,
    marginBottom: 10,
  },
  item: { width: '100%', maxWidth: 760, alignSelf: 'center', marginBottom: 12 },
}));
