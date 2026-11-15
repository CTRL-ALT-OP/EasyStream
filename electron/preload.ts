import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettingsDocument } from '../shared/settings';
import type { ObsCommandResult, ObsPreviewTarget, ObsProgramFrame, ObsSnapshot, ObsStreamSettings, ObsThumbnail } from '../shared/obs';

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
  onObsProgramFrame: (listener: (frame: ObsProgramFrame) => void) => subscribe<ObsProgramFrame>('obs:program-frame', listener)
};

contextBridge.exposeInMainWorld('easystream', api);
