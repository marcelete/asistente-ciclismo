import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { PRIVACY_ZONE_M } from '../../core/elevation/privacy';
import type { ReminderSettings } from '../../core/goals/reminders';
import { ageOn } from '../../core/profile/birthDate';
import type { ThemePreference } from '../../data/settings';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { ensureNotificationPermission, sendTestNotification } from '../../services/notifications';
import { Button, Card, Divider, Icon, ListRow, Notice, Screen, SectionTitle, Segmented, Stepper, Toggle, useStyles } from '../components';
import { formatNumber } from '../format';
import { useFeedback, useNow } from '../hooks';
import { makeStyles, useTheme } from '../theme';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

export function SettingsScreen() {
  const { settings, updateSettings, wipeAll, bikes } = useStore();
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const fb = useFeedback();
  const now = useNow(3_600_000);
  const r = settings.reminders;
  const a = settings.athlete;
  const [note, setNote] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);

  /** Corre una acción de la pantalla; si falla, lo registra y lo muestra en vez de perderlo. */
  const attempt = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      log('error', 'ui', `Falló: ${what}`, e);
      setNote({ text: `No se pudo ${what}. El detalle quedó en el registro.`, tone: 'bad' });
    }
  };

  const setReminders = (patch: Partial<ReminderSettings>) =>
    attempt('cambiar los recordatorios', async () => {
      if (patch.enabled) {
        const ok = await ensureNotificationPermission();
        if (!ok) {
          setNote({ text: 'Android no dio permiso para notificaciones. Activalo en Ajustes → Apps → Asistente Ciclismo.', tone: 'bad' });
          return;
        }
        setNote(null);
      }
      await updateSettings({ reminders: { ...r, ...patch } });
    });

  // La hora se mueve de a 30 minutos y da la vuelta al día.
  const shift = (deltaMin: number) => {
    const total = (((r.hour * 60 + r.minute + deltaMin) % 1440) + 1440) % 1440;
    setReminders({ hour: Math.floor(total / 60), minute: total % 60 });
  };
  const hhmm = `${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}`;

  const confirmWipe = () =>
    Alert.alert(
      'Borrar todos mis datos',
      'Se borran las salidas, los perfiles, las metas, las bicis, los segmentos, el clima, los logros, la caché de altitud y de mapas, los ajustes y el registro de esta app. Los GPX de la carpeta de OpenTracks no se tocan. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: () =>
            attempt('borrar los datos', async () => {
              const done = await wipeAll();
              setNote(
                done
                  ? { text: 'Se borraron todos los datos.', tone: 'good' }
                  : { text: 'Ahora se está leyendo la carpeta o consultando la altitud. Esperá a que termine y probá de nuevo.', tone: 'bad' },
              );
            }),
        },
      ],
    );

  const configured = a.weightKg !== null || a.hrMax !== null || a.birthYear !== null;
  const profileSummary = [
    a.birthYear !== null ? `${ageOn(a.birthDate, now) ?? new Date(now).getFullYear() - a.birthYear} años` : null,
    a.weightKg !== null ? `${formatNumber(a.weightKg, a.weightKg % 1 ? 1 : 0)} kg` : null,
    a.hrMax !== null ? `FC máx. ${a.hrMax}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const defaultBike = bikes.find((b) => b.isDefault);

  return (
    <Screen title="Ajustes">
      {note ? <Notice text={note.text} tone={note.tone} /> : null}

      <SectionTitle title="Apariencia" />
      <Card>
        <View style={l.row}>
          <Icon name="contrast" color={t.muted} />
          <Text style={[s.body, s.flex]}>Tema</Text>
        </View>
        <Segmented
          label="Tema"
          options={THEMES}
          value={settings.theme}
          onChange={(v) => attempt('cambiar el tema', () => updateSettings({ theme: v }))}
        />
        <Text style={s.muted}>“Sistema” sigue el modo claro u oscuro del celular, incluso si lo cambia solo a la noche.</Text>
      </Card>

      <SectionTitle title="Sonido y vibración" />
      <Card>
        <Toggle
          icon="volume_up"
          label="Sonidos"
          hint="El timbre al abrir y los sonidos de importar, récords y premios. Si el celular está en silencio, no suenan."
          value={settings.sounds}
          onChange={(v) => attempt('cambiar los sonidos', () => updateSettings({ sounds: v }))}
        />
        <Toggle
          icon="vibration"
          label="Vibración"
          value={settings.haptics}
          onChange={(v) => attempt('cambiar la vibración', () => updateSettings({ haptics: v }))}
        />
        <Toggle
          icon="celebration"
          label="Festejos"
          hint="Confeti y trofeo al superar un récord o ganar un premio."
          value={settings.celebrations}
          onChange={(v) => attempt('cambiar los festejos', () => updateSettings({ celebrations: v }))}
        />
        <Button
          title="Probar"
          icon="play_arrow"
          variant="secondary"
          onPress={() => {
            fb.sound('sparkle');
            fb.haptic('confirm');
          }}
        />
      </Card>

      <SectionTitle title="Tus datos" />
      <Card>
        <ListRow
          icon="person"
          title="Perfil"
          subtitle={
            configured ? profileSummary : 'Edad, peso y frecuencia cardíaca: hacen falta para la potencia, las zonas y la carga.'
          }
          onPress={() => router.push('/perfil')}
        />
        <Divider />
        <ListRow
          icon="directions_bike"
          title="Mis bicis"
          subtitle={
            defaultBike
              ? `${bikes.length} ${bikes.length === 1 ? 'bici' : 'bicis'} · por defecto: ${defaultBike.name}`
              : 'Cargá tu bici: sirve para los km por bici, los componentes y la potencia.'
          }
          onPress={() => router.push('/bicis')}
        />
        <Divider />
        <ListRow
          icon="ios_share"
          title="Exportar e importar"
          subtitle="Llevate tus datos (CSV para la IA y respaldo completo) o restauralos en otro celular."
          onPress={() => router.push('/exportar')}
        />
        <Divider />
        <Toggle
          icon="timer"
          label="Pausa automática"
          hint={
            settings.autoPause
              ? 'El tiempo y la velocidad media cuentan solo mientras te movés.'
              : 'El tiempo cuenta desde que empezás hasta que terminás, con paradas incluidas.'
          }
          value={settings.autoPause}
          onChange={(v) => attempt('cambiar la pausa automática', () => updateSettings({ autoPause: v }))}
        />
        <Text style={s.muted}>
          Siempre se guardan los dos tiempos (transcurrido y en movimiento); esto elige cuál se usa en los totales, la
          velocidad media y las metas de tiempo.
        </Text>
      </Card>

      <SectionTitle title="Recordatorios" />
      <Card>
        <Toggle icon="notifications" label="Recordatorios" value={r.enabled} onChange={(v) => setReminders({ enabled: v })} />
        {r.enabled ? (
          <>
            <Text style={s.muted}>Hora del aviso</Text>
            <Stepper label={hhmm} a11y="Hora del aviso" onMinus={() => shift(-30)} onPlus={() => shift(30)} />
            <Toggle label="Metas" hint="Avisa si una meta va atrasada o está por vencer." value={r.goals} onChange={(v) => setReminders({ goals: v })} />
            <Toggle
              label="Rachas"
              hint="Avisa el día que una racha se corta si no salís."
              value={r.streaks}
              onChange={(v) => setReminders({ streaks: v })}
            />
            <Text style={s.muted}>
              Los avisos se arman con las salidas que ya importaste. Si saliste y todavía no abriste la app, puede llegar un
              aviso de más.
            </Text>
            <Button
              title="Probar notificación"
              icon="notifications_active"
              variant="secondary"
              onPress={() => attempt('mandar la notificación de prueba', sendTestNotification)}
            />
          </>
        ) : null}
      </Card>

      <SectionTitle title="Privacidad" />
      <Card>
        <Toggle
          icon="cloud_sync"
          label="Altitud del mapa por internet"
          hint={`Manda a Open-Meteo las coordenadas del recorrido redondeadas a ~11 m, sin los primeros ni los últimos ${PRIVACY_ZONE_M} m (ahí se usa la altitud del GPS). Apagado, solo se usa el GPS y nada sale del celular.`}
          value={settings.demOnline}
          onChange={(v) => attempt('cambiar la consulta de altitud', () => updateSettings({ demOnline: v }))}
        />
        <Toggle
          icon="thermostat"
          label="Clima de cada salida"
          hint="Consulta a Open-Meteo el clima del centro de tu ciudad (coordenada redondeada, meses enteros). Nunca se manda la ubicación de una salida. Apagado, no se consulta el clima."
          value={settings.weatherOnline}
          onChange={(v) => attempt('cambiar el clima', () => updateSettings({ weatherOnline: v }))}
        />
        <Toggle
          icon="map"
          label="Mapa de fondo (OpenStreetMap)"
          hint="Baja los mosaicos del mapa de OpenStreetMap. OpenStreetMap ve tu IP y la zona que mirás, incluida la de tu casa. Apagado, los mapas muestran solo la traza sobre una cuadrícula y no se usa la red."
          value={settings.mapTiles}
          onChange={(v) => attempt('cambiar el mapa de fondo', () => updateSettings({ mapTiles: v }))}
        />
        <Toggle
          icon="visibility_off"
          label="Ocultar inicio y final en los mapas"
          hint={`Los mapas dibujan la traza sin los primeros ni los últimos ${PRIVACY_ZONE_M} m y avisan "Inicio y final ocultos".`}
          value={settings.hideMapEnds}
          onChange={(v) => attempt('cambiar el ocultar inicio y final', () => updateSettings({ hideMapEnds: v }))}
        />
        <Text style={s.muted}>
          Tus salidas, tu perfil y tu frecuencia cardíaca se guardan solo en este celular y no se copian al backup de Google.
        </Text>
        <Button title="Borrar todos mis datos" icon="delete_forever" variant="danger" onPress={confirmWipe} />
      </Card>

      <SectionTitle title="Ayuda" />
      <Card>
        <ListRow icon="science" title="Simulación" subtitle="Probá la app con una salida simulada." onPress={() => router.push('/simulacion')} />
        <ListRow icon="article" title="Registro" subtitle="Errores y eventos de la app, sin datos personales." onPress={() => router.push('/registro')} />
      </Card>

      <Text style={[s.muted, s.center]}>Asistente Ciclismo {Constants.expoConfig?.version ?? ''}</Text>
    </Screen>
  );
}

const useLocal = makeStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
}));
