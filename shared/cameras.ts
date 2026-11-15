export type CameraConfig = {
  wideUrl: string;
  ptzUrl: string;
  viscaHost: string;
  viscaPort: number;
  panMin: number;
  panMax: number;
  tiltMin: number;
  tiltMax: number;
  zoomMin: number;
  zoomMax: number;
};

export type CameraLimits = Pick<CameraConfig, 'panMin' | 'panMax' | 'tiltMin' | 'tiltMax' | 'zoomMin' | 'zoomMax'>;

export type CameraPose = {
  pan: number;
  tilt: number;
  zoom: number;
};

export type CameraLink = 'connecting' | 'live' | 'offline';

export type ViscaLinkState = 'connecting' | 'open' | 'offline';

export type CameraFrame = {
  feed: 'wide' | 'ptz';
  image: string;
  width: number;
  height: number;
};

export type CameraStatus = {
  wide: CameraLink;
  ptz: CameraLink;
  visca: ViscaLinkState;
  message: string;
};

export type CalibrationProgress = {
  phase: string;
  completed: number;
  total: number;
};

export type CalibrationOutcome = {
  ok: boolean;
  message: string;
  profile: CalibrationProfile | null;
};

export const defaultCameraConfig: CameraConfig = {
  wideUrl: 'rtsp://127.0.0.1:8554/1',
  ptzUrl: 'rtsp://127.0.0.1:8554/2',
  viscaHost: '127.0.0.1',
  viscaPort: 1259,
  panMin: -2448,
  panMax: 2448,
  tiltMin: -432,
  tiltMax: 1296,
  zoomMin: 0,
  zoomMax: 0x4000
};

export const limitsOf = (config: CameraConfig): CameraLimits => ({
  panMin: config.panMin,
  panMax: config.panMax,
  tiltMin: config.tiltMin,
  tiltMax: config.tiltMax,
  zoomMin: config.zoomMin,
  zoomMax: config.zoomMax
});

const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

const text = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value.trim() : fallback);

export const parseCameraConfig = (value: unknown): CameraConfig => {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const config: CameraConfig = {
    wideUrl: text(record.wideUrl, defaultCameraConfig.wideUrl),
    ptzUrl: text(record.ptzUrl, defaultCameraConfig.ptzUrl),
    viscaHost: text(record.viscaHost, defaultCameraConfig.viscaHost),
    viscaPort: Math.round(finite(record.viscaPort, defaultCameraConfig.viscaPort)),
    panMin: finite(record.panMin, defaultCameraConfig.panMin),
    panMax: finite(record.panMax, defaultCameraConfig.panMax),
    tiltMin: finite(record.tiltMin, defaultCameraConfig.tiltMin),
    tiltMax: finite(record.tiltMax, defaultCameraConfig.tiltMax),
    zoomMin: finite(record.zoomMin, defaultCameraConfig.zoomMin),
    zoomMax: finite(record.zoomMax, defaultCameraConfig.zoomMax)
  };
  if (config.panMin > config.panMax) {
    [config.panMin, config.panMax] = [config.panMax, config.panMin];
  }
  if (config.tiltMin > config.tiltMax) {
    [config.tiltMin, config.tiltMax] = [config.tiltMax, config.tiltMin];
  }
  if (config.zoomMin > config.zoomMax) {
    [config.zoomMin, config.zoomMax] = [config.zoomMax, config.zoomMin];
  }
  config.viscaPort = Math.min(65535, Math.max(1, config.viscaPort));
  return config;
};

export const sameCameraSetup = (a: CameraConfig, b: CameraConfig) =>
  a.wideUrl === b.wideUrl &&
  a.ptzUrl === b.ptzUrl &&
  a.viscaHost === b.viscaHost &&
  a.viscaPort === b.viscaPort &&
  a.panMin === b.panMin &&
  a.panMax === b.panMax &&
  a.tiltMin === b.tiltMin &&
  a.tiltMax === b.tiltMax &&
  a.zoomMin === b.zoomMin &&
  a.zoomMax === b.zoomMax;

export const shrinkLimits = (config: CameraConfig, attempted: { pan: number; tilt: number }, known: CameraPose | null): CameraConfig => {
  if (!known) {
    return config;
  }

  const next = { ...config };
  if (attempted.pan > known.pan) {
    next.panMax = Math.min(next.panMax, known.pan);
  }
  if (attempted.pan < known.pan) {
    next.panMin = Math.max(next.panMin, known.pan);
  }
  if (attempted.tilt > known.tilt) {
    next.tiltMax = Math.min(next.tiltMax, known.tilt);
  }
  if (attempted.tilt < known.tilt) {
    next.tiltMin = Math.max(next.tiltMin, known.tilt);
  }
  return parseCameraConfig(next);
};

export type GeometricModel = {
  cx: number;
  cy: number;
  f: number;
  roll: number;
  pan0: number;
  tilt0: number;
  panScale: number;
  tiltScale: number;
};

export type RbfModel = {
  sigma: number;
  ridge: number;
  centers: { x: number; y: number }[];
  panWeights: number[];
  tiltWeights: number[];
};

export type ZoomCorrection = {
  zoom: number;
  panDelta: number;
  tiltDelta: number;
  widePixels: number;
  magnification: number;
};

export type CalibrationSample = {
  x: number;
  y: number;
  pan: number;
  tilt: number;
  zoom: number;
  inliers: number;
  widePixels: number;
};

export type CalibrationProfile = {
  status: 'valid' | 'failed';
  message: string;
  wideUrl: string;
  ptzUrl: string;
  viscaHost: string;
  viscaPort: number;
  wideWidth: number;
  wideHeight: number;
  ptzWidth: number;
  ptzHeight: number;
  calibrationZoom: number;
  geometric: GeometricModel;
  residual: RbfModel;
  zoomCurve: ZoomCorrection[];
  samples: CalibrationSample[];
  limits: CameraLimits;
  validation: {
    medianError: number;
    p95Error: number;
    medianFramePercent: number;
    sampleCount: number;
    holdoutCount: number;
  };
};

export type PixelPoint = { x: number; y: number };

export type PixelRect = { x: number; y: number; width: number; height: number };

export type AimResult = {
  pan: number;
  tilt: number;
  zoom: number | null;
  lowConfidence: boolean;
};
