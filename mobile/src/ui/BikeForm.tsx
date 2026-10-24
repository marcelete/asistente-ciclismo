import { useState } from 'react';
import { Text, View } from 'react-native';
import type { BikeType } from '../core/analysis/profileMetrics';
import { BIKE_LIMITS, BIKE_TYPE_LABEL, MAX_BIKE_NAME, WHEELS } from '../core/bikes/bikes';
import type { Bike } from '../core/bikes/bikes';
import { Field, Segmented, useStyles } from './components';
import { formatNumber, parseDecimal } from './format';
import { makeStyles } from './theme';

const TYPES = (Object.keys(BIKE_TYPE_LABEL) as BikeType[]).map((value) => ({ value, label: BIKE_TYPE_LABEL[value] }));
const show = (v: number | null) => (v === null ? '' : Number.isInteger(v) ? String(v) : formatNumber(v, 1));

function read(text: string, limits: { min: number; max: number }): { value: number | null; error: string | null } {
  if (text.trim() === '') return { value: null, error: null };
  const v = parseDecimal(text);
  if (v === null) return { value: null, error: 'Escribí solo números.' };
  if (v < limits.min || v > limits.max) return { value: null, error: `Entre ${limits.min} y ${limits.max}.` };
  return { value: v, error: null };
}

/** Los campos de una bici y su validación; `toBike` arma la bici lista para guardar. */
export function useBikeDraft(initial?: Partial<Bike>) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<BikeType>(initial?.type ?? 'road');
  const [weight, setWeight] = useState(show(initial?.weightKg ?? null));
  const [wheel, setWheel] = useState<string>(initial?.wheel ?? '');
  const [tire, setTire] = useState(show(initial?.tireMm ?? null));
  const w = read(weight, BIKE_LIMITS.weightKg);
  const ti = read(tire, BIKE_LIMITS.tireMm);
  const nameError = name.trim() === '' ? 'Poné un nombre.' : null;
  const hasErrors = w.error !== null || ti.error !== null || nameError !== null;
  return {
    name,
    setName,
    type,
    setType,
    weight,
    setWeight,
    wheel,
    setWheel,
    tire,
    setTire,
    errors: { weight: w.error, tire: ti.error, name: nameError },
    hasErrors,
    /** Una bici nueva (id y fecha nuevos) o la misma bici con los datos cambiados. */
    toBike(base?: Bike): Bike {
      return {
        id: base?.id ?? `bike-${Date.now()}`,
        name: name.trim().slice(0, MAX_BIKE_NAME),
        type,
        weightKg: w.value,
        wheel: wheel || null,
        tireMm: ti.value === null ? null : Math.round(ti.value),
        retired: base?.retired ?? false,
        isDefault: base?.isDefault ?? false,
        createdT: base?.createdT ?? Date.now(),
      };
    },
  };
}

export type BikeDraft = ReturnType<typeof useBikeDraft>;

/** Formulario de una bici: nombre, tipo, peso, rodado y ancho de cubierta. */
export function BikeForm({ draft, showNameError }: { draft: BikeDraft; showNameError?: boolean }) {
  const s = useStyles();
  const l = useLocal();
  return (
    <View style={l.col}>
      <Field
        label="Nombre"
        value={draft.name}
        onChangeText={draft.setName}
        placeholder="Por ejemplo, Trek Domane AL 2"
        maxLength={MAX_BIKE_NAME}
        autoCapitalize="words"
        error={showNameError ? draft.errors.name : null}
      />
      <Text style={s.label}>Tipo de bici</Text>
      <Segmented label="Tipo de bici" options={TYPES} value={draft.type} onChange={draft.setType} />
      <View style={l.row}>
        <Field
          inRow
          label="Peso de la bici"
          unit="kg"
          value={draft.weight}
          onChangeText={draft.setWeight}
          keyboardType="decimal-pad"
          placeholder="10"
          error={draft.errors.weight}
          hint={draft.weight.trim() === '' && !draft.errors.weight ? 'Si no lo sabés, se usan 10 kg.' : undefined}
        />
        <Field
          inRow
          label="Ancho de cubierta"
          unit="mm"
          value={draft.tire}
          onChangeText={draft.setTire}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="45"
          error={draft.errors.tire}
        />
      </View>
      <Text style={s.label}>Rodado</Text>
      <Segmented
        label="Rodado"
        options={[{ value: '', label: '—' }, ...WHEELS]}
        value={draft.wheel}
        onChange={draft.setWheel}
      />
      <Text style={s.muted}>{`700c equivale a 29" y 650b a 27,5".`}</Text>
      <Text style={s.muted}>
        El ancho de cubierta cambia la resistencia a la rodadura de la potencia estimada: más ancho, un poco más de resistencia
        en asfalto.
      </Text>
    </View>
  );
}

const useLocal = makeStyles(() => ({
  col: { gap: 12 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
}));
