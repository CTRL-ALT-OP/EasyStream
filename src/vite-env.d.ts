/// <reference types="vite/client" />

import type { AppSettingsDocument } from '../shared/settings';

type EasyStreamApi = {
  loadSettings: () => Promise<AppSettingsDocument | null>;
  saveSettings: (document: AppSettingsDocument) => Promise<boolean>;
};

declare global {
  interface Window {
    easystream?: EasyStreamApi;
  }
}

export {};
