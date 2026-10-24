import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ageOn, birthDateToText, maskBirthDate, parseBirthDate } from '../../core/profile/birthDate';
import { ATHLETE_LIMITS, sanitizeAthlete } from '../../data/settings';
import type { Athlete } from '../../data/settings';
import { useStore } from '../../data/store';
import { log } from '../../services/log';
import { BikeForm, useBikeDraft } from '../BikeForm';
import { CityPicker } from '../CityPicker';
import { Button, Card, Field, Icon, Notice, Screen, Segmented, useStyles } from '../components';
import { formatNumber, parseDecimal } from '../format';
import { useNow } from '../hooks';
import { makeStyles, useTheme } from '../theme';

type Sex = 'male' | 'female' | 'none';
const SEXES: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
  { value: 'none', label: 'Sin indicar' },
];

const show = (v: number | null) => (v === null ? '' : Number.isInteger(v) ? String(v) : formatNumber(v, 1));

function read(text: string, limits: { min: number; max: number }, integer = false): { value: number | null; error: string | null } {
  if (text.trim() === '') return { value: null, error: null };
  const v = parseDecimal(text);
  if (v === null) return { value: null, error: 'Escribí solo números.' };
  if (integer && !Number.isInteger(v)) return { value: null, error: 'Sin decimales.' };
  if (v < limits.min || v > limits.max) return { value: null, error: `Entre ${limits.min} y ${limits.max}.` };
  return { value: v, error: null };
}

/**
 * Bienvenida: el perfil y la bici de quien use la app. Todo es opcional y se puede cambiar después
 * en Ajustes. Nada viene precargado: cada persona carga lo suyo.
 */
export function WelcomeScreen() {
  const { settings, updateSettings, bikes, saveBike } = useStore();
  const [city, setCity] = useState(settings.city);
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const a = settings.athlete;
  const now = useNow(3_600_000);
  const [step, setStep] = useState(0);
  const [birth, setBirth] = useState(birthDateToText(a.birthDate));
  const [sex, setSex] = useState<Sex>(a.sex ?? 'none');
  const [weight, setWeight] = useState(show(a.weightKg));
  const [hrMax, setHrMax] = useState(show(a.hrMax));
  const [hrRest, setHrRest] = useState(show(a.hrRest));
  const defaultBike = bikes.find((b) => b.isDefault);
  const bike = useBikeDraft(defaultBike);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const L = ATHLETE_LIMITS;
  const f = {
    birth: parseBirthDate(birth, now, L.birthYear.min, L.birthYear.max),
    weight: read(weight, L.weightKg),
    hrMax: read(hrMax, L.hrMax, true),
    hrRest: read(hrRest, L.hrRest, true),
  };
  const gapError =
    f.hrMax.value !== null && f.hrRest.value !== null && f.hrMax.value - f.hrRest.value < 40
      ? 'La FC máxima tiene que superar a la de reposo por al menos 40.'
      : null;
  const stepOneBad = Object.values(f).some((x) => x.error !== null) || gapError !== null;
  const age = ageOn(f.birth.iso, now);

  const finish = async (withBike: boolean) => {
    const draft: Athlete = {
      ...a,
      birthDate: f.birth.iso,
      birthYear: f.birth.iso !== null ? Number(f.birth.iso.slice(0, 4)) : a.birthYear,
      sex: sex === 'none' ? null : sex,
      weightKg: f.weight.value,
      hrMax: f.hrMax.value,
      hrRest: f.hrRest.value,
    };
    try {
      await updateSettings({ athlete: sanitizeAthlete(draft), onboardingDone: true, city });
      if (withBike && bike.name.trim() !== '') await saveBike(bike.toBike(defaultBike));
      router.replace('/');
    } catch (e) {
      log('error', 'ui', 'No se pudo guardar la bienvenida', e);
      setError('No se pudo guardar. Probá de nuevo.');
    }
  };

  const skipAll = async () => {
    try {
      await updateSettings({ onboardingDone: true });
      router.replace('/');
    } catch (e) {
      log('error', 'ui', 'No se pudo cerrar la bienvenida', e);
      setError('No se pudo guardar. Probá de nuevo.');
    }
  };

  return (
    // Sin encabezado de navegación (`headerShown: false` en el layout): la pantalla reserva el margen de la barra de estado.
    <Screen keyboard>
      <View style={l.head}>
        <Icon name="directions_bike" size={32} color={t.link} />
        <View style={s.flex}>
          <Text style={s.h1}>Bienvenido</Text>
          <Text style={s.muted}>Paso {step + 1} de 3 · todo es opcional</Text>
        </View>
      </View>

      {step === 0 ? (
        <>
          <Text style={s.body}>
            Con estos datos calculamos tus zonas de frecuencia cardíaca, la carga y la potencia estimada. Quedan solo en este
            celular y los cambiás cuando quieras en Ajustes → Perfil.
          </Text>
          <Card>
            <View style={l.row}>
              <Field
                inRow
                label="Fecha de nacimiento"
                value={birth}
                onChangeText={(v) => setBirth(maskBirthDate(v))}
                keyboardType="number-pad"
                placeholder="25/03/1990"
                maxLength={10}
                error={f.birth.error}
                hint={age !== null ? `${age} años` : undefined}
              />
              <Field inRow label="Tu peso" unit="kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="70" error={f.weight.error} />
            </View>
            <Text style={s.label}>Sexo</Text>
            <Segmented label="Sexo" options={SEXES} value={sex} onChange={setSex} />
            <View style={l.row}>
              <Field
                inRow
                label="FC máxima"
                unit="lpm"
                value={hrMax}
                onChangeText={setHrMax}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="185"
                error={f.hrMax.error ?? gapError}
                hint={f.hrMax.value === null && !f.hrMax.error ? 'Si no la sabés, se estima por tu edad.' : undefined}
              />
              <Field inRow label="FC en reposo" unit="lpm" value={hrRest} onChangeText={setHrRest} keyboardType="number-pad" maxLength={3} placeholder="60" error={f.hrRest.error} />
            </View>
          </Card>
          <Button title="Siguiente" icon="arrow_forward" onPress={() => setStep(1)} disabled={stepOneBad} />
          <Button title="Saltear todo" variant="ghost" onPress={skipAll} />
        </>
      ) : step === 1 ? (
        <>
          <Text style={s.body}>
            Tu bici sirve para los kilómetros de cada una, los componentes y una potencia estimada más fiel (peso y cubiertas).
            Después podés cargar más bicis en Ajustes → Mis bicis.
          </Text>
          <Card>
            <BikeForm draft={bike} showNameError={tried && bike.name.trim() !== ''} />
          </Card>
          <Button
            title="Siguiente"
            icon="arrow_forward"
            onPress={() => {
              setTried(true);
              if (bike.name.trim() !== '' && bike.hasErrors) return;
              setStep(2);
            }}
          />
          <Button
            title="Saltear la bici"
            variant="secondary"
            onPress={() => {
              bike.setName('');
              setStep(2);
            }}
          />
          <Button title="Volver" variant="ghost" onPress={() => setStep(0)} />
        </>
      ) : (
        <>
          <Text style={s.body}>
            Con tu ciudad calculamos el clima de cada salida (temperatura y viento) para afinar la potencia estimada. Es opcional: sin
            ciudad no se consulta el clima.
          </Text>
          <Card>
            <CityPicker value={city} onChange={setCity} enabled={settings.weatherOnline} />
          </Card>
          {error ? <Notice text={error} tone="bad" /> : null}
          <Button title="Listo" icon="check" onPress={() => finish(true)} />
          <Button title="Volver" variant="ghost" onPress={() => setStep(1)} />
        </>
      )}
      {step === 0 && error ? <Notice text={error} tone="bad" /> : null}
    </Screen>
  );
}

const useLocal = makeStyles(() => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
}));
