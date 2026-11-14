export const SETTINGS_VERSION = 1;

export const layoutPresetIds = [
  'ptz-full',
  'media-full',
  'media-portrait-right',
  'media-portrait-tight',
  'media-camera-below',
  'media-camera-above'
] as const;

export type LayoutPresetId = (typeof layoutPresetIds)[number];

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CameraLook = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
};

export type PtzPreset = {
  id: string;
  label: string;
  crop: CropRect;
};

export type LightingPreset = {
  id: string;
  label: string;
  description: string;
  look: CameraLook;
};

export type PersistedDockCell = {
  id: string;
  blockIds: string[];
  activeBlockId: string;
  size: number;
};

export type PersistedDockRow = {
  id: string;
  cells: PersistedDockCell[];
  size: number;
};

export type PersistedDockLayout = {
  rows: PersistedDockRow[];
};

export type AppSettingsDocument = {
  version: typeof SETTINGS_VERSION;
  presets: PtzPreset[];
  lightingPresets: LightingPreset[];
  activeLayout: LayoutPresetId;
  dockLayout: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const parseCrop = (value: unknown): CropRect | null => {
  if (!isRecord(value)) {
    return null;
  }

  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const width = finiteNumber(value.width);
  const height = finiteNumber(value.height);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  return { x, y, width, height };
};

const parseLook = (value: unknown): CameraLook | null => {
  if (!isRecord(value)) {
    return null;
  }

  const brightness = finiteNumber(value.brightness);
  const contrast = finiteNumber(value.contrast);
  const saturation = finiteNumber(value.saturation);
  const warmth = finiteNumber(value.warmth);
  if (brightness === null || contrast === null || saturation === null || warmth === null) {
    return null;
  }

  return { brightness, contrast, saturation, warmth };
};

const parsePresets = (value: unknown): PtzPreset[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const presets: PtzPreset[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.label !== 'string') {
      return null;
    }

    const crop = parseCrop(item.crop);
    if (!crop) {
      return null;
    }

    presets.push({ id: item.id, label: item.label, crop });
  }

  return presets;
};

const parseLightingPresets = (value: unknown): LightingPreset[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const presets: LightingPreset[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.label !== 'string' || typeof item.description !== 'string') {
      return null;
    }

    const look = parseLook(item.look);
    if (!look) {
      return null;
    }

    presets.push({ id: item.id, label: item.label, description: item.description, look });
  }

  return presets;
};

const isLayoutPresetId = (value: unknown): value is LayoutPresetId =>
  typeof value === 'string' && layoutPresetIds.some((id) => id === value);

export const parseSettingsDocument = (value: unknown): AppSettingsDocument | null => {
  if (!isRecord(value) || value.version !== SETTINGS_VERSION) {
    return null;
  }

  const presets = parsePresets(value.presets);
  const lightingPresets = parseLightingPresets(value.lightingPresets);
  if (!presets || !lightingPresets || !isLayoutPresetId(value.activeLayout)) {
    return null;
  }

  return {
    version: SETTINGS_VERSION,
    presets,
    lightingPresets,
    activeLayout: value.activeLayout,
    dockLayout: value.dockLayout ?? null
  };
};
