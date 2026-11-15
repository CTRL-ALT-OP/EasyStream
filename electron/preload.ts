import { contextBridge, ipcRenderer } from 'electron';
import type { CalibrationOutcome, CalibrationProgress, CameraConfig, CameraFrame, CameraPose, CameraStatus } from '../shared/cameras';
import type { ObsCommandResult, ObsPreviewTarget, ObsProgramFrame, ObsSnapshot, ObsStreamSettings, ObsThumbnail } from '../shared/obs';
import type { AppSettingsDocument } from '../shared/settings';
import type { DriveDirection } from '../shared/visca';

type PtzCommandResult = { ok: boolean; message: string };

const subscribe = <T>(channel: string, listener: (payload: T) => void) => {
  const handler = (_event: unknown, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
};

const api = {
  loadSettings: (): Promise<AppSettingsDocument | null> => ipcRenderer.invoke('settings:load'),
  saveSettings: (document: AppSettingsDocument): Promise<boolean> => ipcRenderer.invoke('settings:save', document),
  getObsState: (): Promise<ObsSnapshot> => ipcRenderer.invoke('obs:get-state'),
  getObsThumbnails: (): Promise<ObsThumbnail[]> => ipcRenderer.invoke('obs:get-thumbnails'),
  setObsScene: (sceneName: string): Promise<ObsCommandResult> => ipcRenderer.invoke('obs:set-scene', sceneName),
  setObsStreaming: (active: boolean): Promise<ObsCommandResult> => ipcRenderer.invoke('obs:set-streaming', active),
  setObsRecording: (active: boolean): Promise<ObsCommandResult> => ipcRenderer.invoke('obs:set-recording', active),
  getObsStreamSettings: (): Promise<ObsStreamSettings | null> => ipcRenderer.invoke('obs:get-settings'),
  setObsPreviewTarget: (target: ObsPreviewTarget): Promise<void> => ipcRenderer.invoke('obs:set-preview-target', target),
  onObsState: (listener: (snapshot: ObsSnapshot) => void) => subscribe<ObsSnapshot>('obs:state', listener),
  onObsThumbnail: (listener: (thumbnail: ObsThumbnail) => void) => subscribe<ObsThumbnail>('obs:thumbnail', listener),
  onObsProgramFrame: (listener: (frame: ObsProgramFrame) => void) => subscribe<ObsProgramFrame>('obs:program-frame', listener),
  getCameraState: (): Promise<{ config: CameraConfig; status: CameraStatus; pose: CameraPose | null }> => ipcRenderer.invoke('cameras:get-state'),
  setCameraConfig: (config: CameraConfig): Promise<CameraConfig> => ipcRenderer.invoke('cameras:set-config', config),
  drivePtz: (direction: DriveDirection, panSpeed: number, tiltSpeed: number): Promise<PtzCommandResult> =>
    ipcRenderer.invoke('ptz:drive', direction, panSpeed, tiltSpeed),
  stopPtz: (): Promise<PtzCommandResult> => ipcRenderer.invoke('ptz:stop'),
  nudgePtz: (pan: number, tilt: number, panSpeed: number, tiltSpeed: number): Promise<PtzCommandResult> =>
    ipcRenderer.invoke('ptz:nudge', pan, tilt, panSpeed, tiltSpeed),
  zoomPtz: (direction: 'tele' | 'wide', speed: number): Promise<PtzCommandResult> => ipcRenderer.invoke('ptz:zoom', direction, speed),
  stopPtzZoom: (): Promise<PtzCommandResult> => ipcRenderer.invoke('ptz:zoom-stop'),
  stepPtzZoom: (delta: number): Promise<PtzCommandResult> => ipcRenderer.invoke('ptz:zoom-step', delta),
  movePtz: (pan: number, tilt: number, zoom: number | null, panSpeed: number, tiltSpeed: number): Promise<PtzCommandResult> =>
    ipcRenderer.invoke('ptz:move', pan, tilt, zoom, panSpeed, tiltSpeed),
  homePtz: (): Promise<PtzCommandResult> => ipcRenderer.invoke('ptz:home'),
  startCalibration: (): Promise<PtzCommandResult> => ipcRenderer.invoke('calibration:start'),
  cancelCalibration: (): Promise<PtzCommandResult> => ipcRenderer.invoke('calibration:cancel'),
  onCameraFrame: (listener: (frame: CameraFrame) => void) => subscribe<CameraFrame>('cameras:frame', listener),
  onCameraStatus: (listener: (status: CameraStatus) => void) => subscribe<CameraStatus>('cameras:status', listener),
  onCameraPose: (listener: (pose: CameraPose) => void) => subscribe<CameraPose>('cameras:pose', listener),
  onCameraConfig: (listener: (config: CameraConfig) => void) => subscribe<CameraConfig>('cameras:config', listener),
  onCalibrationProgress: (listener: (progress: CalibrationProgress) => void) => subscribe<CalibrationProgress>('calibration:progress', listener),
  onCalibrationResult: (listener: (outcome: CalibrationOutcome) => void) => subscribe<CalibrationOutcome>('calibration:result', listener)
};

contextBridge.exposeInMainWorld('easystream', api);
