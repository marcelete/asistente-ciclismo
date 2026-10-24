import { useLowPowerMode } from 'expo-battery';
import { useEffect } from 'react';
import { openPowerSaverSettings, POWER_SAVER_TEXT, POWER_SAVER_TITLE, warnPowerSaverOnLaunch } from '../services/powerSaver';
import { Button, Card, Notice } from './components';

/** Aviso fijo, mientras el ahorro de energía esté encendido (sale solo cuando se apaga). */
export function PowerSaverNotice() {
  const on = useLowPowerMode();
  if (!on) return null;
  return (
    <Card>
      <Notice tone="warn" text={`${POWER_SAVER_TITLE}. ${POWER_SAVER_TEXT}`} />
      <Button title="Abrir ajustes de ahorro de energía" icon="settings" variant="secondary" onPress={() => void openPowerSaverSettings()} />
    </Card>
  );
}

/** Al abrir la app, una vez por arranque, y cuando ya pasó la bienvenida: avisa si el ahorro está encendido. */
export function PowerSaverLaunchAlert({ ready }: { ready: boolean }) {
  const on = useLowPowerMode();
  useEffect(() => {
    if (ready && on) warnPowerSaverOnLaunch();
  }, [ready, on]);
  return null;
}
