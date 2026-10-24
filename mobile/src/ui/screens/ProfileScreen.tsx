import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { hrZoneRanges } from '../../core/load/hr';
import { resolveHrProfile } from '../../core/load/training';
import { ageOn, birthDateToText, maskBirthDate, parseBirthDate } from '../../core/profile/birthDate';
import { ATHLETE_LIMITS, sanitizeAthlete } from '../../data/settings';
import type { Athlete, City } from '../../data/settings';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { CityPicker } from '../CityPicker';
import { ZONE_NAMES } from '../charts/ZoneChart';
import { Button, Card, Field, ListRow, Notice, Screen, SectionTitle, Segmented, useStyles } from '../components';
import { formatNumber, parseDecimal } from '../format';
import { useNow, useObservedMaxHr } from '../hooks';
import { makeStyles, useTheme } from '../theme';

type Sex = 'male' | 'female' | 'none';
const SEXES: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
  { value: 'none', label: 'Sin indicar' },
];

const show = (v: number | null) => (v === null ? '' : Number.isInteger(v) ? String(v) : formatNumber(v, 1));

/** Lee un campo: vacío es "no lo sé" (null); fuera de rango devuelve el error a mostrar. */
function read(text: string, limits: { min: number; max: number }, integer = false): { value: number | null; error: string | null } {
  if (text.trim() === '') return { value: null, error: null };
  const v = parseDecimal(text);
  if (v === null) return { value: null, error: 'Escribí solo números.' };
  if (integer && !Number.isInteger(v)) return { value: null, error: 'Sin decimales.' };
  if (v < limits.min || v > limits.max) return { value: null, error: `Entre ${limits.min} y ${limits.max}.` };
  return { value: v, error: null };
}

export function ProfileScreen() {
  const { settings, updateSettings } = useStore();
  const saveCity = (city: City | null) => updateSettings({ city }).catch((e) => log('error', 'ui', 'No se pudo guardar la ciudad', e));
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const now = useNow(3_600_000);
  const observed = useObservedMaxHr();
  const a = settings.athlete;
  const [weight, setWeight] = useState(show(a.weightKg));
  const [birth, setBirth] = useState(birthDateToText(a.birthDate));
  const [sex, setSex] = useState<Sex>(a.sex ?? 'none');
  const [hrMax, setHrMax] = useState(show(a.hrMax));
  const [hrRest, setHrRest] = useState(show(a.hrRest));
  const [note, setNote] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);

  const L = ATHLETE_LIMITS;
  const f = {
    weight: read(weight, L.weightKg),
    birth: parseBirthDate(birth, now, L.birthYear.min, L.birthYear.max),
    hrMax: read(hrMax, L.hrMax, true),
    hrRest: read(hrRest, L.hrRest, true),
  };
  const gapError =
    f.hrMax.value !== null && f.hrRest.value !== null && f.hrMax.value - f.hrRest.value < 40
      ? 'La FC máxima tiene que superar a la de reposo por al menos 40.'
      : null;
  const hasErrors = Object.values(f).some((x) => x.error !== null) || gapError !== null;

  const draft: Athlete = {
    weightKg: f.weight.value,
    // La bici ahora se carga en Ajustes → Mis bicis; los datos viejos del perfil se conservan.
    bikeKg: a.bikeKg,
    bike: a.bike,
    bikeModel: a.bikeModel,
    birthDate: f.birth.iso,
    // Sin fecha se conserva el año que se cargó antes (si lo había); con fecha, el año sale de ella.
    birthYear: f.birth.iso !== null ? Number(f.birth.iso.slice(0, 4)) : a.birthDate !== null ? null : a.birthYear,
    sex: sex === 'none' ? null : sex,
    hrMax: f.hrMax.value,
    hrRest: f.hrRest.value,
  };
  const preview = resolveHrProfile(draft, observed, now);
  const age = ageOn(f.birth.iso, now);
  const onlyYear = f.birth.iso === null && birth.trim() === '' && a.birthDate === null && a.birthYear !== null;

  const save = async () => {
    if (hasErrors) return;
    try {
      await updateSettings({ athlete: sanitizeAthlete(draft) });
      setNote({ text: 'Perfil guardado. Las zonas, la carga y la potencia se recalculan con estos datos.', tone: 'good' });
    } catch (e) {
      log('error', 'ui', 'No se pudo guardar el perfil', e);
      setNote({ text: 'No se pudo guardar el perfil. Probá de nuevo.', tone: 'bad' });
    }
  };

  const clearNote = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setNote(null);
  };

  return (
    <Screen header={false} keyboard>
      <Text style={s.body}>
        Con estos datos se calculan tus zonas de frecuencia cardíaca, la carga de cada salida, tu estado de forma y la potencia
        estimada. Todo es opcional y queda solo en este celular.
      </Text>

      <SectionTitle title="Vos" />
      <Card>
        <View style={l.row}>
          <Field inRow label="Tu peso" unit="kg" value={weight} onChangeText={clearNote(setWeight)} keyboardType="decimal-pad" placeholder="72" error={f.weight.error} />
          <View style={s.flex} />
        </View>
        <ListRow icon="directions_bike" title="Mis bicis" subtitle="Peso, cubiertas y componentes de cada bici." onPress={() => router.push('/bicis')} />
      </Card>

      <SectionTitle title="Ciudad (para el clima)" />
      <Card>
        <CityPicker value={settings.city} onChange={saveCity} enabled={settings.weatherOnline} />
      </Card>

      <SectionTitle title="Frecuencia cardíaca" />
      <Card>
        <View style={l.row}>
          <Field inRow
            label="Fecha de nacimiento"
            value={birth}
            onChangeText={(v) => clearNote(setBirth)(maskBirthDate(v))}
            keyboardType="number-pad"
            placeholder="25/03/1990"
            maxLength={10}
            error={f.birth.error}
            hint={age !== null ? `${age} años` : onlyYear ? `Tenías cargado solo el año (${a.birthYear}). Escribí la fecha completa.` : undefined}
          />
          <View style={s.flex} />
        </View>
        <Text style={s.label}>Sexo</Text>
        <Segmented label="Sexo" options={SEXES} value={sex} onChange={clearNote(setSex)} />
        <Text style={s.muted}>Ajusta la fórmula de la carga (TRIMP); sin indicar se usa la de hombres.</Text>
        <View style={l.row}>
          <Field inRow
            label="FC máxima"
            unit="lpm"
            value={hrMax}
            onChangeText={clearNote(setHrMax)}
            keyboardType="number-pad"
            maxLength={3}
            placeholder={preview && preview.maxSource !== 'perfil' ? String(preview.profile.hrMax) : '185'}
            error={f.hrMax.error ?? gapError}
            hint={
              f.hrMax.value === null && preview
                ? preview.maxSource === 'edad'
                  ? `Se estima ${preview.profile.hrMax} por tu edad.`
                  : `Se usa la más alta registrada: ${preview.profile.hrMax}.`
                : observed !== null
                  ? `La más alta registrada: ${Math.round(observed)}.`
                  : undefined
            }
          />
          <Field inRow
            label="FC en reposo"
            unit="lpm"
            value={hrRest}
            onChangeText={clearNote(setHrRest)}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="60"
            error={f.hrRest.error}
            hint={f.hrRest.value === null && !f.hrRest.error ? 'Tomala al despertarte. Si no, se usa 60.' : undefined}
          />
        </View>
      </Card>

      {preview ? (
        <Card>
          <Text style={s.h3}>Tus zonas</Text>
          {hrZoneRanges(preview.profile).map((z, i) => (
            <View key={z.zone} style={l.zone} accessible accessibilityLabel={`Zona ${z.zone}, ${ZONE_NAMES[i]}: de ${z.min} a ${z.max} latidos por minuto`}>
              <View style={[l.swatch, { backgroundColor: t.zones[i] }]} />
              <Text style={l.zoneName}>Z{z.zone}</Text>
              <Text style={[s.body, s.flex]}>{ZONE_NAMES[i]}</Text>
              <Text style={l.zoneRange}>
                {z.min}–{z.max} lpm
              </Text>
            </View>
          ))}
          <Text style={s.muted}>Por reserva de FC (Karvonen): entre tu FC de reposo y la máxima.</Text>
        </Card>
      ) : null}

      <Button title="Guardar perfil" icon="save" onPress={save} disabled={hasErrors} />
      {note ? <Notice text={note.text} tone={note.tone} /> : null}
      {note?.tone === 'good' ? <Button title="Volver" variant="secondary" onPress={() => router.back()} /> : null}
    </Screen>
  );
}

const useLocal = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  zoneName: { color: t.strong, fontWeight: '800', width: 24 },
  zoneRange: { color: t.strong, fontWeight: '600', fontVariant: ['tabular-nums'] },
}));
