import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import {
  autoBackupIfDue,
  exportToFolder,
  pickBackupFile,
  pickBackupFolder,
  restorePending,
  shareExport,
} from '../../services/exporter';
import type { ExportSnapshot, PendingRestore } from '../../services/exporter';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { Button, Card, Notice, Screen, SectionTitle, Toggle, useStyles } from '../components';

type Note = { text: string; tone: 'good' | 'bad' | 'info' };

/** Resumen de lo que va a pasar al importar, para confirmarlo. */
function restoreSummary(p: PendingRestore): string {
  const { plan, parsed } = p;
  const lines = [
    `Salidas nuevas: ${plan.rides.length}`,
    plan.demUpgrades.length > 0 ? `Salidas que reciben la altitud del mapa: ${plan.demUpgrades.length}` : null,
    plan.goals.length > 0 ? `Metas nuevas: ${plan.goals.length}` : null,
    plan.bikes.length > 0 ? `Bicis nuevas: ${plan.bikes.length}` : null,
    plan.segments.length > 0 ? `Segmentos nuevos: ${plan.segments.length}` : null,
    `Ya estaban y no se tocan: ${plan.alreadyHere}`,
    plan.goalConflicts.length > 0
      ? `Metas con otro objetivo (queda la tuya): ${plan.goalConflicts.length}`
      : null,
    parsed.skipped > 0 ? `Elementos dañados que se saltean: ${parsed.skipped}` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

export function ExportScreen() {
  const { allRides: rides, goals, settings, updateSettings, runExclusive, reloadAll } = useStore();
  const s = useStyles();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const b = settings.backup;

  const snap = (): ExportSnapshot => ({ rides, goals, settings, appVersion: Constants.expoConfig?.version ?? '' });
  const opts = { includePoints: b.includePoints, hideEnds: b.hideEnds };

  /** Corre una acción larga mostrando el estado; un error se registra y se explica en pantalla. */
  const run = async (name: string, what: string, fn: () => Promise<Note | null>) => {
    if (busy) return;
    setBusy(name);
    setNote(null);
    try {
      const res = await runExclusive('export', fn);
      if (res === null) setNote({ text: 'Ya hay otra tarea en curso. Esperá a que termine.', tone: 'bad' });
      else if (res) setNote(res);
    } catch (e) {
      log('error', 'export', `Falló: ${what}`, e);
      setNote({ text: `No se pudo ${what}. El detalle quedó en el registro.`, tone: 'bad' });
    } finally {
      setBusy(null);
    }
  };

  const share = () => run('share', 'exportar los datos', async () => ({ text: await shareExport(snap(), opts), tone: 'info' }));

  const saveToFolder = () =>
    run('folder', 'guardar en la carpeta', async () => {
      const uri = b.folderUri ?? (await pickBackupFolder(null));
      if (!uri) return { text: 'No elegiste ninguna carpeta.', tone: 'info' };
      if (uri !== b.folderUri) await updateSettings({ backup: { ...b, folderUri: uri } });
      return { text: await exportToFolder(snap(), opts, uri), tone: 'good' };
    });

  const changeFolder = () =>
    run('pick', 'elegir la carpeta', async () => {
      const uri = await pickBackupFolder(b.folderUri);
      if (!uri) return { text: 'No elegiste ninguna carpeta.', tone: 'info' };
      await updateSettings({ backup: { ...b, folderUri: uri } });
      return { text: 'Carpeta elegida.', tone: 'good' };
    });

  const setAuto = (auto: boolean) =>
    run('auto', 'cambiar la copia automática', async () => {
      if (auto && !b.folderUri) {
        const uri = await pickBackupFolder(null);
        if (!uri) return { text: 'Para la copia automática hace falta elegir una carpeta.', tone: 'info' };
        await updateSettings({ backup: { ...b, folderUri: uri, auto: true } });
      } else {
        await updateSettings({ backup: { ...b, auto } });
      }
      if (auto) await autoBackupIfDue({ ...snap(), settings: { ...settings, backup: { ...b, auto: true, folderUri: b.folderUri } } }).catch(() => false);
      return null;
    });

  const importBackup = () =>
    run('import', 'importar el respaldo', async () => {
      const picked = await pickBackupFile();
      if (picked.kind === 'cancelled') return { text: 'No elegiste ningún archivo.', tone: 'info' };
      if (picked.kind === 'error') return { text: picked.message, tone: 'bad' };
      const { pending } = picked;
      const answer = await new Promise<'cancel' | 'keep' | 'settings'>((resolve) => {
        Alert.alert(
          'Importar respaldo',
          `${restoreSummary(pending)}\n\nLo que ya está en el celular no se pisa.`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve('cancel') },
            { text: 'Solo los datos', onPress: () => resolve('keep') },
            { text: 'Datos y ajustes', onPress: () => resolve('settings') },
          ],
          { cancelable: true, onDismiss: () => resolve('cancel') },
        );
      });
      if (answer === 'cancel') return { text: 'Importación cancelada. No se cambió nada.', tone: 'info' };
      const ids = await restorePending(pending, settings, answer === 'settings');
      reloadAll(ids);
      return { text: `Listo: se sumaron ${pending.plan.rides.length} salida(s) nuevas.`, tone: 'good' };
    });

  return (
    // El título ya está en el encabezado de la navegación.
    <Screen header={false}>
      {note ? <Notice text={note.text} tone={note.tone} /> : null}

      <SectionTitle title="Qué se exporta" />
      <Card>
        <Text style={s.muted}>
          Un ZIP con las salidas en CSV (para analizarlas con la IA o la planilla que quieras) y un respaldo completo para
          restaurar la app. Adentro hay un LEEME.txt que explica cada columna.
        </Text>
        <Toggle
          icon="my_location"
          label="Incluir los puntos del recorrido"
          hint="Un punto cada 50 m con latitud y longitud. Muestra por dónde andás: sólo si lo necesitás."
          value={b.includePoints}
          onChange={(v) => updateSettings({ backup: { ...b, includePoints: v } })}
        />
        {b.includePoints ? (
          <Toggle
            icon="visibility_off"
            label="Ocultar inicio y final"
            hint="Saca los 300 m de cada punta de los puntos (suele ser tu casa)."
            value={b.hideEnds}
            onChange={(v) => updateSettings({ backup: { ...b, hideEnds: v } })}
          />
        ) : null}
        <Notice
          tone="warn"
          text="El respaldo completo (respaldo.json) siempre lleva los recorridos con coordenadas. No lo compartas con quien no deba saber dónde vivís."
        />
      </Card>

      <SectionTitle title="Exportar" />
      <Card>
        <Button title="Compartir (Drive, PC…)" icon="share" onPress={share} loading={busy === 'share'} disabled={busy !== null} />
        <Text style={s.muted}>Abre el menú de Android: guardar en Drive, enviar a la PC con Quick Share, mandarlo por mail.</Text>
        <Button
          title={b.folderUri ? 'Guardar en la carpeta elegida' : 'Guardar en una carpeta'}
          icon="folder"
          variant="secondary"
          onPress={saveToFolder}
          loading={busy === 'folder'}
          disabled={busy !== null}
        />
        {b.folderUri ? (
          <Button title="Cambiar carpeta" icon="drive_file_move" variant="ghost" onPress={changeFolder} disabled={busy !== null} />
        ) : null}
        <Text style={s.muted}>
          Sirve una carpeta que se vea desde la PC por USB o una que sincronice Syncthing. Cada vez se borra el archivo anterior
          y se crea uno nuevo.
        </Text>
        <Toggle
          icon="sync"
          label="Copia automática"
          hint="Después de importar salidas nuevas actualiza asistente-ciclismo-respaldo.zip en esa carpeta, como mucho una vez por hora."
          value={b.auto}
          onChange={setAuto}
        />
      </Card>

      <SectionTitle title="Importar" />
      <Card>
        <Button title="Importar respaldo" icon="upload_file" variant="secondary" onPress={importBackup} loading={busy === 'import'} disabled={busy !== null} />
        <Text style={s.muted}>
          Elegí el ZIP o el respaldo.json. Antes de aplicar nada te muestro cuántas salidas se suman. Las que ya tenés no se
          pisan.
        </Text>
      </Card>
    </Screen>
  );
}
