import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { City } from '../data/settings';
import { log } from '../services/log';
import { formatUntil, OpenMeteoWait } from '../services/openMeteo';
import { searchCities } from '../services/weather';
import { Button, Field, Notice, useStyles } from './components';
import { makeStyles, useTheme } from './theme';

export const cityLabel = (c: City) => [c.name, c.region, c.country].filter(Boolean).join(', ');

/**
 * Elige la ciudad para el clima. Se busca con un botón (no a cada letra) y solo se manda lo que
 * escribís. Se guarda con 2 decimales: el clima se pide para el centro de la ciudad, nunca para
 * el lugar de una salida.
 */
export function CityPicker({ value, onChange, enabled = true }: { value: City | null; onChange: (c: City | null) => void; enabled?: boolean }) {
  const s = useStyles();
  const l = useLocal();
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<City[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const search = async () => {
    setBusy(true);
    setNote(null);
    try {
      const found = await searchCities(query);
      setResults(found);
      if (found.length === 0) setNote('No encontré esa ciudad. Probá con otro nombre.');
    } catch (e) {
      if (e instanceof OpenMeteoWait) setNote(`Open-Meteo pide esperar: probá a las ${formatUntil(e.until)}.`);
      else {
        log('warn', 'weather', 'Falló la búsqueda de ciudad', e);
        setNote('No se pudo buscar la ciudad. Revisá la conexión.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={l.col}>
      {value ? (
        <View style={l.current}>
          <Text style={[s.body, s.flex]}>{cityLabel(value)}</Text>
          <Button title="Quitar" variant="ghost" onPress={() => onChange(null)} />
        </View>
      ) : (
        <Text style={s.muted}>Sin ciudad: no se consulta el clima.</Text>
      )}
      <Field label="Buscar ciudad" value={query} onChangeText={setQuery} placeholder="Por ejemplo, Rosario" autoCapitalize="words" maxLength={60} returnKeyType="search" onSubmitEditing={search} />
      <Button title="Buscar" icon="search" variant="secondary" onPress={search} loading={busy} disabled={query.trim().length < 2 || !enabled} />
      {!enabled ? <Text style={s.muted}>La consulta de clima está apagada en Ajustes → Privacidad.</Text> : null}
      {note ? <Notice text={note} tone="info" /> : null}
      {results?.map((c) => (
        <Pressable
          key={`${c.lat},${c.lon}`}
          style={[l.result, { borderColor: t.border }]}
          onPress={() => {
            onChange(c);
            setResults(null);
            setQuery('');
          }}
          accessibilityRole="button"
          accessibilityLabel={`Elegir ${cityLabel(c)}`}
        >
          <Text style={s.body}>{cityLabel(c)}</Text>
        </Pressable>
      ))}
      <Text style={s.muted}>Solo se manda a Open-Meteo el nombre que escribís y, para el clima, la coordenada de la ciudad redondeada.</Text>
    </View>
  );
}

const useLocal = makeStyles(() => ({
  col: { gap: 10 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  result: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 },
}));
