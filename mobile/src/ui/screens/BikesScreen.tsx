import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { BIKE_TYPE_LABEL, partStatus, tireLabel, totalsByBike } from '../../core/bikes/bikes';
import type { Bike, BikePart } from '../../core/bikes/bikes';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { BikeForm, useBikeDraft } from '../BikeForm';
import { Button, Card, Chip, EmptyState, Field, Notice, Screen, SectionTitle, useStyles } from '../components';
import { formatDate, formatNumber, parseDecimal } from '../format';
import { makeStyles } from '../theme';

const km = (v: number) => `${formatNumber(v, v < 100 ? 1 : 0)} km`;

/** Formulario para crear o cambiar una bici. */
function BikeEditor({ bike, onDone }: { bike?: Bike; onDone: () => void }) {
  const { saveBike } = useStore();
  const draft = useBikeDraft(bike);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setTried(true);
    if (draft.hasErrors) return;
    try {
      await saveBike(draft.toBike(bike));
      onDone();
    } catch (e) {
      log('error', 'bikes', 'No se pudo guardar la bici', e);
      setError('No se pudo guardar la bici. Probá de nuevo.');
    }
  };

  return (
    <Card>
      <BikeForm draft={draft} showNameError={tried} />
      {error ? <Notice text={error} tone="bad" /> : null}
      <View style={useLocal().buttons}>
        <Button title="Guardar" icon="save" onPress={save} />
        <Button title="Cancelar" variant="secondary" onPress={onDone} />
      </View>
    </Card>
  );
}

/** Componentes de una bici: cadena, cubiertas, pastillas… con aviso opcional a los N km. */
function Parts({ bike, parts, kmNow }: { bike: Bike; parts: ReturnType<typeof partStatus>; kmNow: number }) {
  const s = useStyles();
  const l = useLocal();
  const { savePart, removePart } = useStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [alert, setAlert] = useState('');
  const alertKm = alert.trim() === '' ? null : parseDecimal(alert);
  const invalid = name.trim() === '' || (alert.trim() !== '' && (alertKm === null || alertKm <= 0 || alertKm > 100_000));

  const add = async () => {
    if (invalid) return;
    const p: BikePart = {
      id: `part-${Date.now()}`,
      bikeId: bike.id,
      name: name.trim().slice(0, 60),
      startKm: kmNow,
      startT: Date.now(),
      alertKm,
    };
    try {
      await savePart(p);
      setName('');
      setAlert('');
      setAdding(false);
    } catch (e) {
      log('error', 'bikes', 'No se pudo guardar el componente', e);
    }
  };

  const confirmRemove = (p: BikePart) =>
    Alert.alert('Sacar componente', `¿Sacar "${p.name}" de la lista?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sacar', style: 'destructive', onPress: () => removePart(p.id).catch((e) => log('error', 'bikes', 'No se pudo borrar el componente', e)) },
    ]);

  return (
    <View style={l.col}>
      <Text style={s.label}>Componentes</Text>
      {parts.length === 0 ? <Text style={s.muted}>Todavía no cargaste ninguno (cadena, cubiertas, pastillas…).</Text> : null}
      {parts.map(({ part, km: used, due }) => (
        <View key={part.id} style={l.partRow}>
          <View style={s.flex}>
            <Text style={s.body}>
              {part.name}: {km(used)}
              {part.alertKm !== null ? ` de ${km(part.alertKm)}` : ''}
            </Text>
            <Text style={s.muted}>Puesto el {formatDate(part.startT)}</Text>
          </View>
          {due ? <Chip icon="warning" label="Revisar" /> : null}
          <Button title="Sacar" variant="ghost" onPress={() => confirmRemove(part)} />
        </View>
      ))}
      {adding ? (
        <>
          <Field label="Componente" value={name} onChangeText={setName} placeholder="Cadena" maxLength={60} autoCapitalize="sentences" />
          <Field
            label="Avisarme a los"
            unit="km"
            value={alert}
            onChangeText={setAlert}
            keyboardType="decimal-pad"
            placeholder="3000"
            hint="Opcional. Cuenta desde hoy."
          />
          <View style={l.buttons}>
            <Button title="Agregar" icon="add" onPress={add} disabled={invalid} />
            <Button title="Cancelar" variant="secondary" onPress={() => setAdding(false)} />
          </View>
        </>
      ) : (
        <Button title="Agregar componente" icon="add" variant="secondary" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

export function BikesScreen() {
  const { bikes, bikeParts, rides, saveBike, removeBike } = useStore();
  const s = useStyles();
  const l = useLocal();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const totals = useMemo(() => totalsByBike(rides, bikes), [rides, bikes]);
  const statuses = useMemo(() => partStatus(bikeParts, totals), [bikeParts, totals]);

  const attempt = (what: string, fn: () => Promise<void>) =>
    fn().catch((e) => {
      log('error', 'bikes', `Falló: ${what}`, e);
      setNote(`No se pudo ${what}. El detalle quedó en el registro.`);
    });

  const confirmDelete = (b: Bike) =>
    Alert.alert(
      'Borrar bici',
      `Se borra "${b.name}" con sus componentes. Sus salidas pasan a la bici por defecto. No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => attempt('borrar la bici', () => removeBike(b.id)) },
      ],
    );

  const active = bikes.filter((b) => !b.retired);
  const retired = bikes.filter((b) => b.retired);

  const card = (b: Bike) => {
    const t = totals.get(b.id);
    const tire = tireLabel(b);
    if (editing === b.id) return <BikeEditor key={b.id} bike={b} onDone={() => setEditing(null)} />;
    return (
      <Card key={b.id}>
        <View style={l.head}>
          <View style={s.flex}>
            <Text style={s.h2}>{b.name}</Text>
            <Text style={s.muted}>
              {BIKE_TYPE_LABEL[b.type]}
              {b.weightKg !== null ? ` · ${formatNumber(b.weightKg, b.weightKg % 1 ? 1 : 0)} kg` : ''}
              {tire ? ` · cubiertas ${tire}` : ''}
            </Text>
          </View>
          {b.isDefault ? <Chip icon="check_circle" label="Por defecto" /> : null}
        </View>
        <Text style={s.body}>
          {km(t?.km ?? 0)} · {t?.rides ?? 0} {t?.rides === 1 ? 'salida' : 'salidas'}
          {t?.first !== null && t?.first !== undefined && t.last !== null
            ? ` · del ${formatDate(t.first)} al ${formatDate(t.last)}`
            : ''}
        </Text>
        <Parts bike={b} parts={statuses.filter((p) => p.part.bikeId === b.id)} kmNow={t?.km ?? 0} />
        <View style={l.buttons}>
          <Button title="Cambiar datos" icon="edit" variant="secondary" onPress={() => setEditing(b.id)} />
          {!b.isDefault && !b.retired ? (
            <Button title="Usar por defecto" variant="secondary" onPress={() => attempt('cambiar la bici por defecto', () => saveBike({ ...b, isDefault: true }))} />
          ) : null}
          {!b.isDefault ? (
            <Button
              title={b.retired ? 'Volver a usar' : 'Retirar'}
              variant="ghost"
              onPress={() => attempt('cambiar la bici', () => saveBike({ ...b, retired: !b.retired }))}
            />
          ) : null}
          <Button title="Borrar" icon="delete" variant="danger" onPress={() => confirmDelete(b)} />
        </View>
      </Card>
    );
  };

  return (
    <Screen header={false} keyboard>
      <Text style={s.body}>
        Cada salida que entra se asigna a la bici por defecto; en el detalle de la salida la podés cambiar. El peso y las cubiertas
        entran en la potencia estimada.
      </Text>
      {note ? <Notice text={note} tone="bad" /> : null}
      {bikes.length === 0 && editing !== 'new' ? (
        <EmptyState icon="directions_bike" title="Todavía no cargaste ninguna bici" text="Cargala para ver los km de cada una y mejorar la potencia estimada." />
      ) : null}
      {active.map(card)}
      {editing === 'new' ? (
        <BikeEditor onDone={() => setEditing(null)} />
      ) : (
        <Button title="Agregar bici" icon="add" onPress={() => setEditing('new')} />
      )}
      {retired.length > 0 ? (
        <>
          <SectionTitle title="Retiradas" />
          {retired.map(card)}
        </>
      ) : null}
    </Screen>
  );
}

const useLocal = makeStyles(() => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  col: { gap: 10 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
