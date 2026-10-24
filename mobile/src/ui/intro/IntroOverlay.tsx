import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Pressable, StyleSheet, Text } from 'react-native';
import { funFact, tipAt } from '../../core/intro/funFacts';
import { loadProfile } from '../../data/db';
import { useStore } from '../../data/store';
import { playSound, preloadBell } from '../../services/sound';
import { makeStyles, useTheme } from '../theme';
import { BikeScene } from './BikeScene';

/** Mínimo que se ve la escena, para que no parpadee si la app carga rápido. */
const MIN_MS = 1600;
/** Si una importación grande sigue después de esto, se ofrece tocar para seguir. */
const LONG_MS = 8000;
const TIP_MS = 2200;
const FADE_MS = 250;
const MAX_POINTS = 48;

/** Altitudes de la última salida, reducidas, para dibujar la colina de fondo. */
function latestAltitudes(id: string | undefined): number[] | null {
  if (!id) return null;
  try {
    const points = loadProfile(id);
    if (!points || points.length < 5) return null;
    const alts = points.map((p) => p.dem ?? p.gps).filter((v): v is number => v !== null);
    if (alts.length < 5) return null;
    const step = Math.max(1, Math.floor(alts.length / MAX_POINTS));
    return alts.filter((_, i) => i % step === 0);
  } catch {
    return null;
  }
}

/**
 * Pantalla de inicio animada, por encima de la navegación, solo cuando la app arranca de cero.
 * Se va cuando terminó la primera lectura de la carpeta (y pasó el mínimo), o al tocarla.
 */
export function IntroOverlay() {
  const { startupDone, progress, rides, settings } = useStore();
  const s = useLocal();
  const t = useTheme();
  const [visible, setVisible] = useState(true);
  const [minElapsed, setMinElapsed] = useState(false);
  const [long, setLong] = useState(false);
  const [still, setStill] = useState(false);
  const [tip, setTip] = useState(0);
  const [opacity] = useState(() => new Animated.Value(1));
  const closing = useRef(false);
  const soundOn = useRef(settings.sounds);
  const [now] = useState(Date.now);

  const altitudes = useMemo(() => latestAltitudes(rides[0]?.id), [rides]);
  const fact = useMemo(() => funFact(rides, now), [rides, now]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => setVisible(false));
  };

  useEffect(() => {
    const minTimer = setTimeout(() => setMinElapsed(true), MIN_MS);
    const longTimer = setTimeout(() => setLong(true), LONG_MS);
    const tipTimer = setInterval(() => setTip((n) => n + 1), TIP_MS);
    if (soundOn.current) preloadBell().then(() => playSound('bell'));
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(longTimer);
      clearInterval(tipTimer);
      motion.remove();
    };
  }, []);

  useEffect(() => {
    if (startupDone && minElapsed) close();
    // `close` solo usa refs y el valor animado: no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startupDone, minElapsed]);

  // El botón "atrás" saltea la intro en lugar de cerrar la app.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const progressText = progress
    ? progress.stage === 'import'
      ? `Importando ${Math.min(progress.done + 1, progress.total)} de ${progress.total}…`
      : `Actualizando ${Math.min(progress.done + 1, progress.total)} de ${progress.total}…`
    : null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.root, { opacity }]} pointerEvents="auto">
      <Pressable
        style={s.fill}
        onPress={close}
        // El splash nativo se oculta cuando la intro ya se dibujó: sin destello en blanco.
        onLayout={() => SplashScreen.hide()}
        accessibilityRole="button"
        accessibilityLabel="Asistente Ciclismo está cargando. Tocá para ir a la app."
      >
        <BikeScene altitudes={altitudes} still={still} />
        <Text style={s.title} maxFontSizeMultiplier={1.3}>
          Asistente Ciclismo
        </Text>
        {progressText ? (
          <Text style={[s.line, { color: t.link }]} maxFontSizeMultiplier={1.3}>
            {progressText}
          </Text>
        ) : null}
        {fact ? (
          <Text style={s.fact} maxFontSizeMultiplier={1.3}>
            {fact}
          </Text>
        ) : null}
        <Text style={s.tip} maxFontSizeMultiplier={1.3}>
          {tipAt(tip, now)}
        </Text>
        {long && !startupDone ? (
          <Text style={[s.line, { color: t.link }]} maxFontSizeMultiplier={1.3}>
            Tocá para seguir usando la app
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const useLocal = makeStyles((t) => ({
  root: { backgroundColor: t.bg, zIndex: 100 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  title: { color: t.strong, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  line: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  fact: { color: t.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  tip: { color: t.muted, fontSize: 14, textAlign: 'center', minHeight: 40 },
}));
