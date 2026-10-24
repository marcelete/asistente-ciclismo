import { useState } from 'react';
import { Screen, Segmented } from '../components';
import { GoalsScreen } from './GoalsScreen';
import { PlanPanel } from './PlanScreen';
import { PredictionsPanel } from './PredictionsScreen';

type Tab = 'goals' | 'plan' | 'predict';
const TABS: { value: Tab; label: string }[] = [
  { value: 'goals', label: 'Metas' },
  { value: 'plan', label: 'Plan' },
  { value: 'predict', label: 'Predicciones' },
];

/** Pestaña Metas: las metas, el plan semanal con los programas, y las predicciones. */
export function GoalsHome() {
  const [tab, setTab] = useState<Tab>('goals');
  const switcher = <Segmented label="Vista" options={TABS} value={tab} onChange={setTab} />;
  if (tab === 'goals') return <GoalsScreen switcher={switcher} />;
  return (
    <Screen title={tab === 'plan' ? 'Plan' : 'Predicciones'} keyboard>
      {switcher}
      {tab === 'plan' ? <PlanPanel /> : <PredictionsPanel />}
    </Screen>
  );
}
