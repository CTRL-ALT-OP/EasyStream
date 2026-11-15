import { dockBlocks } from '../docks/blocks';
import { normalizeStoredDockLayout } from '../docks/layout';
import type { DockLayoutState } from '../docks/types';
import { lightingPresets, ptzPresets } from '../demo/presets';
import { defaultCameraConfig } from '../../shared/cameras';
import { parseSettingsDocument, SETTINGS_VERSION, type AppSettingsDocument } from '../../shared/settings';
import { getCameraState, subscribeCameras } from './cameras';
import { getSessionState, subscribeSession } from './session';

const LEGACY_DOCK_LAYOUT_KEY = 'easystream.dockLayout.v1';
const SAVE_DELAY_MS = 200;

let dockLayout: DockLayoutState | null = null;
let saveTimer: number | null = null;
let ready = false;
let seenPresets = getSessionState().presets;
let seenLightingPresets = getSessionState().lightingPresets;
let seenConfig = getCameraState().config;
let seenCalibration = getCameraState().calibration;

export const currentSettingsDocument = (): AppSettingsDocument => {
  const current = getSessionState();
  const cameras = getCameraState();
  return {
    version: SETTINGS_VERSION,
    presets: current.presets,
    lightingPresets: current.lightingPresets,
    dockLayout,
    cameras: cameras.config,
    calibration: cameras.calibration
  };
};

export const saveSettingsNow = () => {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }

  if (!ready || !window.easystream) {
    return;
  }

  void window.easystream.saveSettings(currentSettingsDocument());
};

const scheduleSave = () => {
  if (!ready) {
    return;
  }

  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }

  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveSettingsNow();
  }, SAVE_DELAY_MS);
};

export const rememberDockLayout = (layout: DockLayoutState) => {
  if (dockLayout === layout) {
    return;
  }

  dockLayout = layout;
  scheduleSave();
};

export const startSettingsSync = () => {
  ready = true;
  const current = getSessionState();
  seenPresets = current.presets;
  seenLightingPresets = current.lightingPresets;
  seenConfig = getCameraState().config;
  seenCalibration = getCameraState().calibration;
  window.addEventListener('beforeunload', saveSettingsNow);
  const stopSession = subscribeSession(() => {
    const next = getSessionState();
    if (next.presets === seenPresets && next.lightingPresets === seenLightingPresets) {
      return;
    }

    seenPresets = next.presets;
    seenLightingPresets = next.lightingPresets;
    scheduleSave();
  });
  const stopCameras = subscribeCameras(() => {
    const next = getCameraState();
    if (next.config === seenConfig && next.calibration === seenCalibration) {
      return;
    }

    seenConfig = next.config;
    seenCalibration = next.calibration;
    scheduleSave();
  });
  return () => {
    stopSession();
    stopCameras();
  };
};

const readLegacyDockLayout = () => {
  try {
    const stored = window.localStorage.getItem(LEGACY_DOCK_LAYOUT_KEY);
    return stored ? normalizeStoredDockLayout(JSON.parse(stored), dockBlocks) : null;
  } catch {
    return null;
  }
};

const clearLegacyDockLayout = () => {
  try {
    window.localStorage.removeItem(LEGACY_DOCK_LAYOUT_KEY);
  } catch {
    // The main-process document is the source of truth even if the old key remains.
  }
};

const defaultDocument = (layout: DockLayoutState | null): AppSettingsDocument => ({
  version: SETTINGS_VERSION,
  presets: ptzPresets.map((preset) => ({ ...preset })),
  lightingPresets: lightingPresets.map((preset) => ({ ...preset, look: { ...preset.look } })),
  dockLayout: layout,
  cameras: defaultCameraConfig,
  calibration: null
});

export const loadAppSettings = async () => {
  let parsed: AppSettingsDocument | null = null;
  if (window.easystream) {
    try {
      parsed = parseSettingsDocument(await window.easystream.loadSettings());
    } catch {
      parsed = null;
    }
  }

  const legacyLayout = readLegacyDockLayout();
  if (!parsed) {
    const document = defaultDocument(legacyLayout);
    dockLayout = legacyLayout;
    if (window.easystream) {
      await window.easystream.saveSettings(document);
      clearLegacyDockLayout();
    }
    return { ...document, dockLayout: legacyLayout };
  }

  const normalizedLayout = normalizeStoredDockLayout(parsed.dockLayout, dockBlocks);
  const layout = normalizedLayout ?? legacyLayout;
  dockLayout = layout;
  if (!normalizedLayout && legacyLayout && window.easystream) {
    await window.easystream.saveSettings({ ...parsed, dockLayout: legacyLayout });
    clearLegacyDockLayout();
  } else if (legacyLayout) {
    clearLegacyDockLayout();
  }

  return { ...parsed, dockLayout: layout };
};
