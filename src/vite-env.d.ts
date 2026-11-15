/// <reference types="vite/client" />

import type { ObsCommandResult, ObsPreviewTarget, ObsProgramFrame, ObsSnapshot, ObsStreamSettings, ObsThumbnail } from '../shared/obs';
import type { AppSettingsDocument } from '../shared/settings';

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
};

declare global {
  interface Window {
    easystream?: EasyStreamApi;
  }
}

export {};
