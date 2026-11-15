/// <reference types="vite/client" />

import type { CalibrationOutcome, CalibrationProgress, CameraConfig, CameraFrame, CameraPose, CameraStatus } from '../shared/cameras';
import type { ObsCommandResult, ObsPreviewTarget, ObsProgramFrame, ObsSnapshot, ObsStreamSettings, ObsThumbnail } from '../shared/obs';
import type { AppSettingsDocument } from '../shared/settings';
import type { DriveDirection } from '../shared/visca';

type PtzCommandResult = { ok: boolean; message: string };

type EasyStreamApi = {
  loadSettings: () => Promise<AppSettingsDocument | null>;
  saveSettings: (document: AppSettingsDocument) => Promise<boolean>;
  getObsState: () => Promise<ObsSnapshot>;
  getObsThumbnails: () => Promise<ObsThumbnail[]>;
  setObsScene: (sceneName: string) => Promise<ObsCommandResult>;
  setObsStreaming: (active: boolean) => Promise<ObsCommandResult>;
  setObsRecording: (active: boolean) => Promise<ObsCommandResult>;
  getObsStreamSettings: () => Promise<ObsStreamSettings | null>;
  setObsPreviewTarget: (target: ObsPreviewTarget) => Promise<void>;
  onObsState: (listener: (snapshot: ObsSnapshot) => void) => () => void;
  onObsThumbnail: (listener: (thumbnail: ObsThumbnail) => void) => () => void;
  onObsProgramFrame: (listener: (frame: ObsProgramFrame) => void) => () => void;
  getCameraState: () => Promise<{ config: CameraConfig; status: CameraStatus; pose: CameraPose | null }>;
  setCameraConfig: (config: CameraConfig) => Promise<CameraConfig>;
  drivePtz: (direction: DriveDirection, panSpeed: number, tiltSpeed: number) => Promise<PtzCommandResult>;
  stopPtz: () => Promise<PtzCommandResult>;
  nudgePtz: (pan: number, tilt: number, panSpeed: number, tiltSpeed: number) => Promise<PtzCommandResult>;
  zoomPtz: (direction: 'tele' | 'wide', speed: number) => Promise<PtzCommandResult>;
  stopPtzZoom: () => Promise<PtzCommandResult>;
  stepPtzZoom: (delta: number) => Promise<PtzCommandResult>;
  movePtz: (pan: number, tilt: number, zoom: number | null, panSpeed: number, tiltSpeed: number) => Promise<PtzCommandResult>;
  homePtz: () => Promise<PtzCommandResult>;
  startCalibration: () => Promise<PtzCommandResult>;
  cancelCalibration: () => Promise<PtzCommandResult>;
  onCameraFrame: (listener: (frame: CameraFrame) => void) => () => void;
  onCameraStatus: (listener: (status: CameraStatus) => void) => () => void;
  onCameraPose: (listener: (pose: CameraPose) => void) => () => void;
  onCameraConfig: (listener: (config: CameraConfig) => void) => () => void;
  onCalibrationProgress: (listener: (progress: CalibrationProgress) => void) => () => void;
  onCalibrationResult: (listener: (outcome: CalibrationOutcome) => void) => () => void;
};

declare global {
  interface Window {
    easystream?: EasyStreamApi;
  }
}

export {};
