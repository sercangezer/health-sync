import React, { useEffect, useState } from 'react';
import { AiScreen } from './screens/AiScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ScaleScreen } from './screens/ScaleScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { UIGalleryScreen } from './screens/UIGalleryScreen';
import { WearablesScreen } from './screens/WearablesScreen';
import { Shell } from './ui/Shell';

function getInitialQueryParams(): {
  tab: string;
  state?: 'default' | 'empty' | 'error';
  theme: 'dark' | 'light';
} {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') || 'dashboard';
  const rawState = params.get('state');
  const state =
    rawState === 'default' || rawState === 'empty' || rawState === 'error'
      ? rawState
      : undefined;
  const rawTheme = params.get('theme');
  const savedTheme = window.localStorage.getItem('hs-theme');
  const theme: 'dark' | 'light' =
    rawTheme === 'light' || rawTheme === 'dark'
      ? rawTheme
      : savedTheme === 'light'
        ? 'light'
        : 'dark';
  return { tab, state, theme };
}

export function App() {
  const initial = getInitialQueryParams();
  const [activeTab, setActiveTab] = useState<string>(initial.tab);
  const [forcedState] = useState<'default' | 'empty' | 'error' | undefined>(initial.state);
  const [theme, setTheme] = useState<'dark' | 'light'>(initial.theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('hs-theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <Shell
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      theme={theme}
      onToggleTheme={handleToggleTheme}
    >
      {activeTab === 'dashboard' ? (
        <DashboardScreen onNavigateTab={setActiveTab} forcedState={forcedState} />
      ) : null}
      {activeTab === 'profile' ? <ProfileScreen forcedState={forcedState} /> : null}
      {activeTab === 'scale' ? <ScaleScreen forcedState={forcedState} /> : null}
      {activeTab === 'insights' ? <InsightsScreen forcedState={forcedState} /> : null}
      {activeTab === 'wearables' ? <WearablesScreen forcedState={forcedState} /> : null}
      {activeTab === 'ai' ? <AiScreen forcedState={forcedState} /> : null}
      {activeTab === 'settings' ? <SettingsScreen forcedState={forcedState} /> : null}
      {activeTab === 'gallery' ? <UIGalleryScreen /> : null}
    </Shell>
  );
}
export default App;
