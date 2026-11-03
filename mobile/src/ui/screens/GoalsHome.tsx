import { useState } from 'react';
import { Screen, Segmented } from '../components';
import { SportSwitch } from '../SportSwitch';
import { CoachPlanPanel, TodayPanel } from './CoachScreen';
import { GoalsScreen } from './GoalsScreen';
import { PredictionsPanel } from './PredictionsScreen';

type Tab = 'today' | 'plan' | 'goals' | 'predict';
const TABS: { value: Tab; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'plan', label: 'Plan' },
  { value: 'goals', label: 'Metas' },
  { value: 'predict', label: 'Predic.' },
];

const TITLES: Record<Tab, string> = { today: 'Entrenar', plan: 'Plan', goals: 'Metas', predict: 'Predicciones' };

/** Pestaña Entrenar: la sesión de hoy, el plan por periodización, las metas y las predicciones. */
export function GoalsHome() {
  const [tab, setTab] = useState<Tab>('today');
  const switcher = <Segmented label="Vista" options={TABS} value={tab} onChange={setTab} />;
  if (tab === 'goals') return <GoalsScreen switcher={switcher} />;
  return (
    <Screen title={TITLES[tab]} right={<SportSwitch />} keyboard>
      {switcher}
      {tab === 'today' ? <TodayPanel onSetup={() => setTab('plan')} /> : tab === 'plan' ? <CoachPlanPanel /> : <PredictionsPanel />}
    </Screen>
  );
}
