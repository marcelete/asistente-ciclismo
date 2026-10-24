import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { badgeKey, FAMILIES, TIER_LABEL, tierOf } from '../../core/awards/catalog';
import type { AwardEvent, NextAward } from '../../core/awards/engine';
import { monthName } from '../../core/stats/periods';
import { useAwards } from '../../data/awards';
import { Button, Card, EmptyState, ProgressBar, Screen, SectionTitle, useStyles } from '../components';
import { formatDate, formatRemaining } from '../format';
import { Medal } from '../awards/Medal';
import { openRide } from '../RideRow';
import { makeStyles } from '../theme';

function remainingText(n: NextAward): string {
  return formatRemaining(n.target - n.current, n.unit);
}

const monthKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
};
const monthTitle = (key: string) => {
  const [y, m] = key.split('-');
  const name = monthName(Number(m));
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
};

const EFFORT_TITLE = (d: number) => `${d / 1000} km`;
const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

/** Pestaña Logros: la vitrina de premios, lo que sigue, las victorias por mes y los mejores tiempos. */
export function AwardsScreen() {
  const { result } = useAwards();
  const s = useStyles();
  const l = useLocal();
  const [selected, setSelected] = useState<string | null>(null);
  const earned = useMemo(() => new Map(result.badges.map((b) => [b.key, b] as const)), [result.badges]);
  const nextByKey = useMemo(() => new Map(result.next.map((n) => [n.key, n] as const)), [result.next]);

  const byMonth = useMemo(() => {
    const m = new Map<string, AwardEvent[]>();
    for (const e of [...result.victories].reverse()) {
      const k = monthKey(e.t);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()].slice(0, 6);
  }, [result.victories]);

  const sel = selected ? earned.get(selected) : null;
  const podiumDistances = Object.keys(result.podiums)
    .map(Number)
    .sort((a, b) => a - b);

  if (result.events.length === 0 && result.next.length === 0) {
    return (
      <Screen title="Logros">
        <EmptyState icon="emoji_events" title="Todavía no hay logros" text="Cuando importes tus salidas en bici, tus premios y victorias van a aparecer acá." />
      </Screen>
    );
  }

  return (
    <Screen title="Logros" subtitle={`Trofeos: ${result.badges.length} · Victorias: ${result.victories.length}`}>
      {result.next.length > 0 ? (
        <>
          <SectionTitle title="Próximos premios" />
          <Card>
            {result.next.map((n) => (
              <View key={n.key} style={l.nextRow}>
                <Medal tier={tierOf(FAMILIES.find((f) => f.id === n.family)!, n.target)} size={44} locked progress={n.fraction} />
                <View style={s.flex}>
                  <Text style={s.body}>{n.title}</Text>
                  <ProgressBar fraction={n.fraction} />
                  <Text style={s.muted}>{remainingText(n)}</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Vitrina" />
      {FAMILIES.map((fam) => (
        <Card key={fam.id}>
          <Text style={s.h3}>{fam.label}</Text>
          <View style={l.medals}>
            {fam.thresholds.map((th) => {
              const key = badgeKey(fam.id, th);
              const got = earned.get(key);
              const tier = tierOf(fam, th);
              const nxt = nextByKey.get(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => got && setSelected(selected === key ? null : key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${fam.title(th)}, ${got ? `conseguido, ${TIER_LABEL[tier]}` : 'bloqueado'}`}
                  style={l.medalBtn}
                >
                  <Medal tier={tier} size={52} locked={!got} progress={nxt?.fraction ?? 0} />
                </Pressable>
              );
            })}
          </View>
          {sel && fam.thresholds.some((th) => badgeKey(fam.id, th) === sel.key) ? (
            <View style={l.detail}>
              <Text style={s.body}>{sel.title}</Text>
              <Text style={s.muted}>
                {TIER_LABEL[sel.tier ?? 'bronze']} · {formatDate(sel.t)}
              </Text>
              {sel.rideId ? <Button title="Ver la salida" variant="secondary" onPress={() => openRide(sel.rideId!)} /> : null}
            </View>
          ) : null}
        </Card>
      ))}

      {byMonth.length > 0 ? (
        <>
          <SectionTitle title="Victorias" />
          {byMonth.map(([key, list]) => (
            <Card key={key}>
              <Text style={s.h3}>{monthTitle(key)}</Text>
              {list.map((e) => (
                <Pressable key={e.key} onPress={() => e.rideId && openRide(e.rideId)} accessibilityRole="button" style={l.victory}>
                  <Medal tier={e.kind === 'record2' ? 'silver' : e.kind === 'record3' ? 'bronze' : 'gold'} size={32} />
                  <View style={s.flex}>
                    <Text style={s.body}>{e.title}</Text>
                    <Text style={s.muted}>
                      {e.detail ? `${e.detail} · ` : ''}
                      {formatDate(e.t)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </Card>
          ))}
        </>
      ) : null}

      {podiumDistances.length > 0 ? (
        <>
          <SectionTitle title="Mejores tiempos" />
          <Card>
            {podiumDistances.map((d) => {
              const list = result.podiums[d];
              return (
                <View key={d} style={l.podium}>
                  <Text style={s.h3}>{EFFORT_TITLE(d)}</Text>
                  <View style={l.podiumRow}>
                    {list.map((p, i) => (
                      <Pressable key={p.rideId} onPress={() => openRide(p.rideId)} accessibilityRole="button" style={l.podiumItem}>
                        <Medal tier={i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze'} size={32} />
                        <Text style={s.body}>{fmtTime(p.value)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const useLocal = makeStyles(() => ({
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  medals: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  medalBtn: { padding: 2, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  detail: { gap: 6, marginTop: 4 },
  victory: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  podium: { gap: 6, marginBottom: 6 },
  podiumRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  podiumItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
}));
