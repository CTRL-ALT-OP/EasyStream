import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettingsDocument } from '../shared/settings';

const api = {
  loadSettings: (): Promise<AppSettingsDocument | null> => ipcRenderer.invoke('settings:load'),
  saveSettings: (document: AppSettingsDocument): Promise<boolean> => ipcRenderer.invoke('settings:save', document)
};

contextBridge.exposeInMainWorld('easystream', api);
