import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { hydrateSession } from './lib/session';
import { loadAppSettings, startSettingsSync } from './lib/settingsSync';
import './styles.css';

async function boot() {
  const settings = await loadAppSettings();
  hydrateSession({
    presets: settings.presets,
    lightingPresets: settings.lightingPresets,
    activeLayout: settings.activeLayout
  });
  startSettingsSync();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App initialDockLayout={settings.dockLayout} />
    </StrictMode>
  );
}

void boot();
