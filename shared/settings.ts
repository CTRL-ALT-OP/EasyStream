import { parseCameraConfig, type CalibrationProfile, type CalibrationSample, type CameraConfig, type CameraLimits, type GeometricModel, type RbfModel, type ZoomCorrection } from './cameras';

export const SETTINGS_VERSION = 2;

export type CameraLook = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
};

export type PtzPreset = {
  id: string;
  label: string;
  pan: number | null;
  tilt: number | null;
  zoom: number | null;
  thumbnail: string | null;
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
  dockLayout: unknown;
  cameras: CameraConfig;
  calibration: CalibrationProfile | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const optionalNumber = (value: unknown) => (value === null ? null : finiteNumber(value));

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

const parsePreset = (value: unknown, legacy: boolean): PtzPreset | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string') {
    return null;
  }

  if (legacy) {
    return { id: value.id, label: value.label, pan: null, tilt: null, zoom: null, thumbnail: null };
  }

  const pan = optionalNumber(value.pan);
  const tilt = optionalNumber(value.tilt);
  const zoom = optionalNumber(value.zoom);
  if (pan === undefined || tilt === undefined || zoom === undefined) {
    return null;
  }

  return {
    id: value.id,
    label: value.label,
    pan,
    tilt,
    zoom,
    thumbnail: typeof value.thumbnail === 'string' ? value.thumbnail : null
  };
};

const parsePresets = (value: unknown, legacy: boolean): PtzPreset[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const presets: PtzPreset[] = [];
  for (const item of value) {
    const preset = parsePreset(item, legacy);
    if (!preset) {
      return null;
    }
    presets.push(preset);
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

const numberField = (record: Record<string, unknown>, key: string) => finiteNumber(record[key]);

const parseGeometric = (value: unknown): GeometricModel | null => {
  if (!isRecord(value)) {
    return null;
  }
  const cx = numberField(value, 'cx');
  const cy = numberField(value, 'cy');
  const f = numberField(value, 'f');
  const roll = numberField(value, 'roll');
  const pan0 = numberField(value, 'pan0');
  const tilt0 = numberField(value, 'tilt0');
  const panScale = numberField(value, 'panScale');
  const tiltScale = numberField(value, 'tiltScale');
  if ([cx, cy, f, roll, pan0, tilt0, panScale, tiltScale].some((item) => item === null)) {
    return null;
  }
  return { cx: cx!, cy: cy!, f: f!, roll: roll!, pan0: pan0!, tilt0: tilt0!, panScale: panScale!, tiltScale: tiltScale! };
};

const parseResidual = (value: unknown): RbfModel | null => {
  if (!isRecord(value) || !Array.isArray(value.centers) || !Array.isArray(value.panWeights) || !Array.isArray(value.tiltWeights)) {
    return null;
  }
  const sigma = finiteNumber(value.sigma);
  const ridge = finiteNumber(value.ridge);
  if (sigma === null || ridge === null || value.panWeights.length !== value.centers.length || value.tiltWeights.length !== value.centers.length) {
    return null;
  }
  const centers: { x: number; y: number }[] = [];
  for (const center of value.centers) {
    if (!isRecord(center) || finiteNumber(center.x) === null || finiteNumber(center.y) === null) {
      return null;
    }
    centers.push({ x: center.x as number, y: center.y as number });
  }
  const panWeights = value.panWeights.map((item) => finiteNumber(item));
  const tiltWeights = value.tiltWeights.map((item) => finiteNumber(item));
  if (panWeights.some((item) => item === null) || tiltWeights.some((item) => item === null)) {
    return null;
  }
  return { sigma, ridge, centers, panWeights: panWeights as number[], tiltWeights: tiltWeights as number[] };
};

const parseZoomCurve = (value: unknown): ZoomCorrection[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const curve: ZoomCorrection[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }
    const zoom = finiteNumber(item.zoom);
    const panDelta = finiteNumber(item.panDelta);
    const tiltDelta = finiteNumber(item.tiltDelta);
    const widePixels = finiteNumber(item.widePixels);
    const magnification = finiteNumber(item.magnification);
    if (zoom === null || panDelta === null || tiltDelta === null || widePixels === null || magnification === null) {
      return null;
    }
    curve.push({ zoom, panDelta, tiltDelta, widePixels, magnification });
  }
  return curve;
};

const parseSamples = (value: unknown): CalibrationSample[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const samples: CalibrationSample[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }
    const x = finiteNumber(item.x);
    const y = finiteNumber(item.y);
    const pan = finiteNumber(item.pan);
    const tilt = finiteNumber(item.tilt);
    const zoom = finiteNumber(item.zoom);
    const inliers = finiteNumber(item.inliers);
    const widePixels = finiteNumber(item.widePixels);
    if ([x, y, pan, tilt, zoom, inliers, widePixels].some((field) => field === null)) {
      return null;
    }
    samples.push({ x: x!, y: y!, pan: pan!, tilt: tilt!, zoom: zoom!, inliers: inliers!, widePixels: widePixels! });
  }
  return samples;
};

const parseLimits = (value: unknown): CameraLimits | null => {
  if (!isRecord(value)) {
    return null;
  }
  const panMin = numberField(value, 'panMin');
  const panMax = numberField(value, 'panMax');
  const tiltMin = numberField(value, 'tiltMin');
  const tiltMax = numberField(value, 'tiltMax');
  const zoomMin = numberField(value, 'zoomMin');
  const zoomMax = numberField(value, 'zoomMax');
  if ([panMin, panMax, tiltMin, tiltMax, zoomMin, zoomMax].some((item) => item === null)) {
    return null;
  }
  return { panMin: panMin!, panMax: panMax!, tiltMin: tiltMin!, tiltMax: tiltMax!, zoomMin: zoomMin!, zoomMax: zoomMax! };
};

export const parseCalibrationProfile = (value: unknown): CalibrationProfile | null => {
  if (!isRecord(value) || (value.status !== 'valid' && value.status !== 'failed') || typeof value.message !== 'string') {
    return null;
  }
  if (typeof value.wideUrl !== 'string' || typeof value.ptzUrl !== 'string' || typeof value.viscaHost !== 'string') {
    return null;
  }
  const viscaPort = finiteNumber(value.viscaPort);
  const wideWidth = finiteNumber(value.wideWidth);
  const wideHeight = finiteNumber(value.wideHeight);
  const ptzWidth = finiteNumber(value.ptzWidth);
  const ptzHeight = finiteNumber(value.ptzHeight);
  const calibrationZoom = finiteNumber(value.calibrationZoom);
  const geometric = parseGeometric(value.geometric);
  const residual = parseResidual(value.residual);
  const zoomCurve = parseZoomCurve(value.zoomCurve);
  const samples = parseSamples(value.samples);
  const limits = parseLimits(value.limits);
  if (!isRecord(value.validation)) {
    return null;
  }
  const medianError = numberField(value.validation, 'medianError');
  const p95Error = numberField(value.validation, 'p95Error');
  const medianFramePercent = numberField(value.validation, 'medianFramePercent');
  const sampleCount = numberField(value.validation, 'sampleCount');
  const holdoutCount = numberField(value.validation, 'holdoutCount');
  if (
    [viscaPort, wideWidth, wideHeight, ptzWidth, ptzHeight, calibrationZoom, medianError, p95Error, medianFramePercent, sampleCount, holdoutCount].some(
      (item) => item === null
    ) ||
    !geometric ||
    !residual ||
    !zoomCurve ||
    !samples ||
    !limits
  ) {
    return null;
  }

  return {
    status: value.status,
    message: value.message,
    wideUrl: value.wideUrl,
    ptzUrl: value.ptzUrl,
    viscaHost: value.viscaHost,
    viscaPort: viscaPort!,
    wideWidth: wideWidth!,
    wideHeight: wideHeight!,
    ptzWidth: ptzWidth!,
    ptzHeight: ptzHeight!,
    calibrationZoom: calibrationZoom!,
    geometric,
    residual,
    zoomCurve,
    samples,
    limits,
    validation: {
      medianError: medianError!,
      p95Error: p95Error!,
      medianFramePercent: medianFramePercent!,
      sampleCount: sampleCount!,
      holdoutCount: holdoutCount!
    }
  };
};

export const parseSettingsDocument = (value: unknown): AppSettingsDocument | null => {
  if (!isRecord(value) || (value.version !== 1 && value.version !== SETTINGS_VERSION)) {
    return null;
  }

  const legacy = value.version === 1;
  const presets = parsePresets(value.presets, legacy);
  const lightingPresets = parseLightingPresets(value.lightingPresets);
  if (!presets || !lightingPresets) {
    return null;
  }

  return {
    version: SETTINGS_VERSION,
    presets,
    lightingPresets,
    dockLayout: value.dockLayout ?? null,
    cameras: parseCameraConfig(value.cameras),
    calibration: legacy ? null : parseCalibrationProfile(value.calibration)
  };
};
