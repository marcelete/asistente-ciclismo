import { useState } from 'react';
import { Screen, Segmented } from '../components';
import { HeatMapPanel } from './HeatMapScreen';
import { RidesScreen } from './RidesScreen';
import { SegmentsPanel } from './SegmentsScreen';

type Tab = 'list' | 'map' | 'segments';
const TABS: { value: Tab; label: string }[] = [
  { value: 'list', label: 'Lista' },
  { value: 'map', label: 'Mapa' },
  { value: 'segments', label: 'Segmentos' },
];

/** Pestaña Salidas: la lista y el mapa de calor. */
export function RidesHome() {
  const [tab, setTab] = useState<Tab>('list');
  const switcher = <Segmented label="Vista" options={TABS} value={tab} onChange={setTab} />;
  if (tab === 'list') return <RidesScreen switcher={switcher} />;
  return (
    <Screen title="Salidas">
      {switcher}
      {tab === 'map' ? <HeatMapPanel /> : <SegmentsPanel />}
    </Screen>
  );
}
