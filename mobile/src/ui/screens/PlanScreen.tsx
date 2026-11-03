import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { PROGRAMS, currentWeek, isComplete, programById, programProgress } from '../../core/plan/programs';
import { periodStart } from '../../core/stats/periods';
import { useStore } from '../../data/store';
import { abandonProgram, loadActiveProgram, loadCompletedPrograms, startProgram } from '../../data/programs';
import { log } from '../../services/log';
import { Button, Card, Chip, Icon, ProgressBar, SectionTitle, Notice, useStyles } from '../components';
import { formatDate } from '../format';
import { useNow } from '../hooks';
import { makeStyles, useTheme } from '../theme';

/** Entrenar → Plan → Planes cortos: el programa en curso y los programas para empezar. */
export function PlanPanel() {
  const { rides } = useStore();
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const now = useNow();
  const [version, setVersion] = useState(0);

  // El programa activo vive en la base: se vuelve a leer cuando se empieza o se abandona uno.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const active = useMemo(() => loadActiveProgram(), [version, rides]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const completed = useMemo(() => loadCompletedPrograms(), [version, rides]);
  const def = active ? programById(active.id) : undefined;
  const progress = active && def ? programProgress(def, active.startT, rides) : null;

  const begin = (id: string) =>
    startProgram(id, periodStart('week', now))
      .then(() => setVersion((v) => v + 1))
      .catch((e) => log('error', 'ui', 'No se pudo empezar el programa', e));

  const leave = () =>
    Alert.alert('Abandonar el programa', 'Lo que hiciste hasta ahora no se pierde en tu historial.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Abandonar', style: 'destructive', onPress: () => abandonProgram().then(() => setVersion((v) => v + 1)).catch((e) => log('error', 'ui', 'No se pudo abandonar', e)) },
    ]);

  return (
    <>
      {def && active && progress ? (
        <>
          <SectionTitle title="Programa en curso" />
          <Card>
            <Text style={s.h2}>{def.name}</Text>
            <ProgressBar fraction={progress.total > 0 ? progress.done / progress.total : 0} />
            <Text style={s.muted}>
              {progress.done} de {progress.total} sesiones · semana {Math.min(currentWeek(active.startT, now) + 1, def.weeks.length)} de {def.weeks.length}
            </Text>
            {isComplete(progress) ? <Notice tone="good" text="¡Terminaste el programa! Ganaste un premio." /> : null}
            {progress.weeks.map((sessions, w) => (
              <View key={w} style={l.week}>
                <Text style={[s.label, w === currentWeek(active.startT, now) ? { color: t.link } : null]}>Semana {w + 1}</Text>
                {sessions.map((x, i) => (
                  <View key={i} style={l.row}>
                    <Icon name={x.done ? 'check_circle' : 'radio_button_unchecked'} size={20} color={x.done ? t.good : t.muted} />
                    <Text style={[s.body, s.flex]}>{x.session.title}</Text>
                  </View>
                ))}
              </View>
            ))}
            <Button title="Abandonar el programa" variant="ghost" onPress={leave} />
          </Card>
        </>
      ) : null}

      {!active
        ? PROGRAMS.map((p) => (
            <Card key={p.id}>
              <Text style={s.h3}>{p.name}</Text>
              <Text style={s.muted}>{p.description}</Text>
              {completed.some((c) => c.id === p.id) ? <Chip icon="emoji_events" label="Ya lo terminaste" color={t.warn} /> : null}
              <Button title="Empezar" icon="play_arrow" variant="secondary" onPress={() => begin(p.id)} />
            </Card>
          ))
        : null}

      {completed.length > 0 ? (
        <Text style={s.muted}>
          Programas terminados: {completed.map((c) => `${programById(c.id)?.name ?? c.id} (${formatDate(c.t)})`).join(' · ')}
        </Text>
      ) : null}
    </>
  );
}

const useLocal = makeStyles(() => ({
  week: { gap: 4, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
}));
