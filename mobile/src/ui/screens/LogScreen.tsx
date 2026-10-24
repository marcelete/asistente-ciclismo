import { useCallback, useState } from 'react';
import { FlatList, Share, Text, View } from 'react-native';
import { clearLogs, loadLogs } from '../../data/db';
import type { LogRow } from '../../data/db';
import { log } from '../../services/log';
import { Button, Card, Column, EmptyState, NavigationBarScrim, Notice, useScreenPadding, useStyles } from '../components';
import { makeStyles, useTheme } from '../theme';

const time = (t: number) =>
  new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const logLine = (l: LogRow) => `${time(l.t)} ${l.level.toUpperCase()} [${l.tag}] ${l.msg}`;

/** Últimos errores y eventos de la app, para entender qué pasó si algo falla. */
export function LogScreen() {
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const padding = useScreenPadding(false);
  const read = useCallback(() => {
    try {
      return loadLogs(200);
    } catch (e) {
      log('error', 'ui', 'No se pudo leer el registro', e);
      return [];
    }
  }, []);
  const [logs, setLogs] = useState<LogRow[]>(read);
  const [note, setNote] = useState<string | null>(null);

  const share = async () => {
    try {
      await Share.share({ message: logs.map(logLine).join('\n') });
    } catch (e) {
      log('error', 'ui', 'No se pudo compartir el registro', e);
      setNote('No se pudo compartir el registro.');
    }
  };

  const clear = async () => {
    try {
      await clearLogs();
      setLogs([]);
    } catch (e) {
      log('error', 'ui', 'No se pudo vaciar el registro', e);
      setNote('No se pudo vaciar el registro.');
    }
  };

  const colorOf = (level: string) => (level === 'error' ? t.danger : level === 'warn' ? t.warn : t.muted);

  return (
    <View style={l.list}>
    <FlatList
      style={l.list}
      contentContainerStyle={padding}
      data={logs}
      keyExtractor={(row, i) => `${row.t}-${i}`}
      ListHeaderComponent={
        <Column>
          <Text style={s.muted}>
            Se guarda solo en el celular, sin ubicaciones ni nombres de archivo. Si algo falla, podés compartirlo para
            revisarlo.
          </Text>
          <View style={l.buttons}>
            <Button title="Actualizar" icon="sync" variant="secondary" onPress={() => setLogs(read())} />
            {logs.length > 0 ? <Button title="Compartir" icon="share" variant="secondary" onPress={share} /> : null}
            {logs.length > 0 ? <Button title="Vaciar" icon="delete" variant="secondary" onPress={clear} /> : null}
          </View>
          {note ? <Notice text={note} tone="bad" /> : null}
          <View style={l.spacer} />
        </Column>
      }
      ListEmptyComponent={
        <Column>
          <Card>
            <EmptyState icon="check_circle" title="El registro está vacío" />
          </Card>
        </Column>
      }
      renderItem={({ item }) => (
        <View style={l.row}>
          <Text style={[l.level, { color: colorOf(item.level) }]}>
            {item.level.toUpperCase()} · {item.tag} · {time(item.t)}
          </Text>
          <Text style={s.body} selectable>
            {item.msg}
          </Text>
        </View>
      )}
    />
    <NavigationBarScrim />
    </View>
  );
}

const useLocal = makeStyles((t) => ({
  list: { flex: 1, backgroundColor: t.bg },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  spacer: { height: 8 },
  row: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    backgroundColor: t.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  level: { fontSize: 12, fontWeight: '700' },
}));
