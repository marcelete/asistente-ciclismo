import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, Modal, Text, View } from 'react-native';
import type { Tier } from '../../core/awards/catalog';
import { soundFor } from '../../core/awards/celebrate';
import type { CelebrationItem } from '../../data/awards';
import { useAwards } from '../../data/awards';
import { useStore } from '../../data/store';
import { rideTitle } from '../../core/stats/rides';
import { Button, Card, useStyles } from '../components';
import { useFeedback } from '../hooks';
import { makeStyles } from '../theme';
import { Medal } from './Medal';

const PARTICLES = 36;
const COLORS = ['#F2C230', '#E8553D', '#2F80ED', '#27AE60', '#9B51E0', '#F2994A'];

/** Confeti: papelitos que caen girando. Deterministas (sin azar) para que sea siempre igual. */
function Confetti() {
  const [values] = useState(() => Array.from({ length: PARTICLES }, () => new Animated.Value(0)));
  const { width, height } = Dimensions.get('window');
  useEffect(() => {
    const anims = values.map((v, i) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 1800 + ((i * 53) % 900),
        delay: (i * 37) % 600,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [values]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) => {
        const x = ((i * 61) % 100) / 100;
        const sway = (i % 2 === 0 ? 1 : -1) * (20 + ((i * 7) % 30));
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: -20,
              left: x * width,
              width: 8 + (i % 3) * 3,
              height: 12 + (i % 4) * 3,
              backgroundColor: COLORS[i % COLORS.length],
              borderRadius: 2,
              opacity: v.interpolate({ inputRange: [0, 0.05, 0.9, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
                { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, sway, 0] }) },
                { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 + i * 40}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

function tierOfItem(item: Extract<CelebrationItem, { type: 'card' }>): Tier {
  const top = item.card.top;
  if (top.kind === 'badge' && top.tier) return top.tier;
  if (top.kind === 'record2') return 'silver';
  if (top.kind === 'record3') return 'bronze';
  return 'gold';
}

/** Festejo en pantalla: confeti, trofeo con rebote, sonido y vibración. Se muestra de a uno. */
export function CelebrationHost() {
  const { queue, next } = useAwards();
  const { allRides } = useStore();
  const fb = useFeedback();
  const s = useStyles();
  const l = useLocal();
  const [still, setStill] = useState(false);
  const [bounce] = useState(() => new Animated.Value(0));
  const item = queue[0];

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
  }, []);

  const id = item?.id;
  useEffect(() => {
    if (!item) return;
    bounce.setValue(0);
    Animated.spring(bounce, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
    fb.sound(item.type === 'card' ? soundFor(item.card) : 'sparkle');
    fb.haptic('confirm');
    // Solo al cambiar de festejo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!item) return null;
  const scale = bounce.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });

  const seeAwards = () => {
    next();
    router.navigate('/logros');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={next} statusBarTranslucent>
      <View style={l.backdrop}>
        {!still ? <Confetti key={item.id} /> : null}
        <Card>
          <View style={l.center}>
            <Animated.View style={{ transform: [{ scale: still ? 1 : scale }] }}>
              {item.type === 'card' ? <Medal tier={tierOfItem(item)} size={96} /> : <Medal tier="gold" size={96} />}
            </Animated.View>
            {item.type === 'card' ? (
              <>
                <Text style={s.h1} accessibilityRole="header">
                  {item.card.top.kind === 'record' ? '¡Nuevo récord!' : item.card.top.kind === 'goal' ? '¡Meta cumplida!' : '¡Premio nuevo!'}
                </Text>
                <Text style={[s.h2, l.text]}>{item.card.top.title}</Text>
                {item.card.top.detail ? <Text style={[s.body, l.text]}>{item.card.top.detail}</Text> : null}
                {item.card.rideId ? (
                  <Text style={s.muted}>
                    {(() => {
                      const r = allRides.find((x) => x.id === item.card.rideId);
                      return r ? rideTitle(r) : '';
                    })()}
                  </Text>
                ) : null}
                {item.card.events
                  .filter((e) => e.key !== item.card.top.key)
                  .slice(0, 4)
                  .map((e) => (
                    <Text key={e.key} style={[s.body, l.text]}>
                      {e.title}
                      {e.detail ? ` · ${e.detail}` : ''}
                    </Text>
                  ))}
                {item.more > 0 ? <Text style={s.muted}>y {item.more} más en Logros</Text> : null}
              </>
            ) : (
              <>
                <Text style={s.h1} accessibilityRole="header">
                  ¡Mirá todo lo que lograste!
                </Text>
                <Text style={[s.body, l.text]}>
                  Encontramos {item.awards} {item.awards === 1 ? 'premio' : 'premios'} y {item.victories}{' '}
                  {item.victories === 1 ? 'victoria' : 'victorias'} en tu historial.
                </Text>
              </>
            )}
          </View>
          <View style={l.buttons}>
            <Button title="Ver logros" icon="emoji_events" onPress={seeAwards} style={l.grow} />
            <Button title="Seguir" variant="secondary" onPress={next} style={l.grow} />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const useLocal = makeStyles(() => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  center: { alignItems: 'center', gap: 8 },
  text: { textAlign: 'center' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  grow: { flexGrow: 1, minWidth: 140 },
}));
