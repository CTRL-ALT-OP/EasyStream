import { useCallback, useRef, useSyncExternalStore } from 'react';
import { aimAtFrame, aimAtPoint, profileIsCurrent, scalePoint, scaleRect } from '../../shared/aim';
import {
  defaultCameraConfig,
  sameCameraSetup,
  type CalibrationProfile,
  type CalibrationProgress,
  type CameraConfig,
  type CameraFrame,
  type CameraPose,
  type CameraStatus
} from '../../shared/cameras';
import type { PtzPreset } from '../../shared/settings';
import { nudgeUnits, panSpeedFromSlider, zoomSpeedFromSlider, type DriveDirection } from '../../shared/visca';
import { getSessionState, setActivePreset } from './session';

type CameraStore = {
  config: CameraConfig;
  calibration: CalibrationProfile | null;
  pose: CameraPose | null;
  wide: CameraFrame | null;
  ptz: CameraFrame | null;
  status: CameraStatus;
  progress: CalibrationProgress | null;
  notice: string;
};

const listeners = new Set<() => void>();

let state: CameraStore = {
  config: defaultCameraConfig,
  calibration: null,
  pose: null,
  wide: null,
  ptz: null,
  status: { wide: 'connecting', ptz: 'connecting', visca: 'connecting', message: '' },
  progress: null,
  notice: ''
};

const emit = () => listeners.forEach((listener) => listener());

const update = (recipe: (current: CameraStore) => CameraStore) => {
  const next = recipe(state);
  if (next !== state) {
    state = next;
    emit();
  }
};

export const subscribeCameras = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getCameraState = () => state;

export function useCamera<T>(selector: (current: CameraStore) => T): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const cached = useRef<{ value: T } | null>(null);
  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(state);
    if (cached.current && Object.is(cached.current.value, next)) {
      return cached.current.value;
    }
    cached.current = { value: next };
    return next;
  }, []);
  return useSyncExternalStore(subscribeCameras, getSnapshot, getSnapshot);
}

const api = () => window.easystream;

const speeds = () => {
  const speed = panSpeedFromSlider(getSessionState().panZoomSpeed);
  return { pan: speed, tilt: speed, zoom: zoomSpeedFromSlider(getSessionState().panZoomSpeed) };
};

const requireProfile = () => {
  if (!profileIsCurrent(state.calibration, state.config)) {
    update((current) => ({ ...current, notice: 'Calibrate the cameras before aiming from the wide view.' }));
    return null;
  }
  return state.calibration;
};

export const startCameraSync = (initial: { cameras: CameraConfig; calibration: CalibrationProfile | null }) => {
  state = { ...state, config: initial.cameras, calibration: profileIsCurrent(initial.calibration, initial.cameras) ? initial.calibration : null };
  const bridge = api();
  if (!bridge) {
    return () => undefined;
  }

  const stops = [
    bridge.onCameraFrame((frame) => {
      update((current) => (frame.feed === 'wide' ? { ...current, wide: frame } : { ...current, ptz: frame }));
    }),
    bridge.onCameraStatus((status) => update((current) => ({ ...current, status }))),
    bridge.onCameraPose((pose) => update((current) => ({ ...current, pose }))),
    bridge.onCameraConfig((config) => {
      update((current) => (sameCameraSetup(current.config, config) ? current : { ...current, config }));
    }),
    bridge.onCalibrationProgress((progress) => update((current) => ({ ...current, progress }))),
    bridge.onCalibrationResult((outcome) => {
      update((current) => ({
        ...current,
        progress: null,
        notice: outcome.message,
        calibration: outcome.profile ?? current.calibration
      }));
    })
  ];

  void bridge.getCameraState().then((snapshot) => {
    update((current) => ({
      ...current,
      config: snapshot.config,
      status: snapshot.status,
      pose: snapshot.pose
    }));
  });

  return () => stops.forEach((stop) => stop());
};

export const saveCameraConfig = async (config: CameraConfig) => {
  update((current) => {
    const keepCalibration = profileIsCurrent(current.calibration, config);
    return {
      ...current,
      config,
      calibration: keepCalibration ? current.calibration : null,
      notice: keepCalibration ? current.notice : 'Camera settings changed. Recalibrate before click-to-aim.'
    };
  });
  await api()?.setCameraConfig(config);
};

export const zoomToWide = async () => {
  const pose = state.pose;
  if (!pose) {
    return;
  }
  setActivePreset(null);
  const speed = speeds();
  await api()?.movePtz(pose.pan, pose.tilt, state.config.zoomMin, speed.pan, speed.tilt);
};

export const beginCalibration = async () => {
  update((current) => ({ ...current, notice: '', progress: { phase: 'Starting', completed: 0, total: 1 } }));
  const result = await api()?.startCalibration();
  if (result && !result.ok) {
    update((current) => ({ ...current, progress: null, notice: result.message }));
  }
};

export const cancelCalibrationRun = async () => {
  await api()?.cancelCalibration();
};

export const aimWidePoint = async (pixel: { x: number; y: number }, previewWidth: number, previewHeight: number) => {
  const profile = requireProfile();
  if (!profile) {
    return;
  }
  const zoom = state.pose?.zoom ?? profile.calibrationZoom;
  const aim = aimAtPoint(profile, scalePoint(pixel, previewWidth, previewHeight, profile.wideWidth, profile.wideHeight), zoom);
  setActivePreset(null);
  update((current) => ({
    ...current,
    notice: aim.lowConfidence ? 'That point is outside the calibrated area, so the aim was pulled back.' : ''
  }));
  const speed = speeds();
  await api()?.movePtz(aim.pan, aim.tilt, null, speed.pan, speed.tilt);
};

export const frameWideRect = async (
  rect: { x: number; y: number; width: number; height: number },
  previewWidth: number,
  previewHeight: number
) => {
  const profile = requireProfile();
  if (!profile) {
    return;
  }
  const aim = aimAtFrame(profile, scaleRect(rect, previewWidth, previewHeight, profile.wideWidth, profile.wideHeight));
  setActivePreset(null);
  update((current) => ({
    ...current,
    notice: aim.lowConfidence ? 'That frame is outside the calibrated area, so it was pulled back.' : ''
  }));
  const speed = speeds();
  await api()?.movePtz(aim.pan, aim.tilt, aim.zoom, speed.pan, speed.tilt);
};

export const drivePtz = async (direction: DriveDirection) => {
  setActivePreset(null);
  const speed = speeds();
  await api()?.drivePtz(direction, speed.pan, speed.tilt);
};

export const stopPtzMotion = async () => {
  await api()?.stopPtz();
};

export const nudgePtz = async (pan: number, tilt: number) => {
  setActivePreset(null);
  const speed = speeds();
  const step = nudgeUnits(getSessionState().panZoomSpeed);
  await api()?.nudgePtz(Math.sign(pan) * step, Math.sign(tilt) * step, speed.pan, speed.tilt);
};

export const holdZoom = async (direction: 'tele' | 'wide') => {
  setActivePreset(null);
  await api()?.zoomPtz(direction, speeds().zoom);
};

export const stopZoomMotion = async () => {
  await api()?.stopPtzZoom();
};

export const stepZoom = async (direction: 'in' | 'out') => {
  setActivePreset(null);
  const range = Math.max(1, state.config.zoomMax - state.config.zoomMin);
  const delta = Math.max(80, range * (0.02 + speeds().zoom * 0.01));
  await api()?.stepPtzZoom(direction === 'in' ? delta : -delta);
};

export const recallPosition = async (preset: PtzPreset) => {
  if (preset.pan === null || preset.tilt === null || preset.zoom === null) {
    update((current) => ({ ...current, notice: 'Set this preset from the camera before recalling it.' }));
    return;
  }
  setActivePreset(preset.id);
  const speed = speeds();
  await api()?.movePtz(preset.pan, preset.tilt, preset.zoom, speed.pan, speed.tilt);
};

export const goHome = async () => {
  const preset = getSessionState().presets[0];
  if (preset && preset.pan !== null && preset.tilt !== null && preset.zoom !== null) {
    await recallPosition(preset);
    return;
  }
  setActivePreset(null);
  await api()?.homePtz();
};
