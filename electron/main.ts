import { app, BrowserWindow, shell } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_WINDOW_WIDTH = 1440;
const DEFAULT_WINDOW_HEIGHT = 980;
const MIN_WINDOW_WIDTH = 1180;
const MIN_WINDOW_HEIGHT = 820;
const WINDOW_STATE_SAVE_DELAY_MS = 150;

type SavedWindowState = {
  width: number;
  height: number;
  isMaximized: boolean;
};

let windowStateSaveTimer: NodeJS.Timeout | null = null;

const windowStatePath = () => join(app.getPath('userData'), 'window-state.json');

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const readSavedWindowState = (): SavedWindowState => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(windowStatePath(), 'utf8'));
    if (!isRecord(parsed)) {
      throw new Error('Invalid window state');
    }

    return {
      width: typeof parsed.width === 'number' && Number.isFinite(parsed.width) ? Math.max(MIN_WINDOW_WIDTH, Math.round(parsed.width)) : DEFAULT_WINDOW_WIDTH,
      height: typeof parsed.height === 'number' && Number.isFinite(parsed.height) ? Math.max(MIN_WINDOW_HEIGHT, Math.round(parsed.height)) : DEFAULT_WINDOW_HEIGHT,
      isMaximized: parsed.isMaximized === true
    };
  } catch {
    return {
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      isMaximized: false
    };
  }
};

const saveWindowState = (window: BrowserWindow): void => {
  const bounds = window.isMaximized() || window.isMinimized() ? window.getNormalBounds() : window.getBounds();
  const state: SavedWindowState = {
    width: Math.max(MIN_WINDOW_WIDTH, Math.round(bounds.width)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.round(bounds.height)),
    isMaximized: window.isMaximized()
  };

  try {
    writeFileSync(windowStatePath(), JSON.stringify(state, null, 2));
  } catch {
    // Ignore storage failures; the app can still run with default window dimensions.
  }
};

const queueWindowStateSave = (window: BrowserWindow): void => {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
  }

  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    saveWindowState(window);
  }, WINDOW_STATE_SAVE_DELAY_MS);
};

const flushWindowStateSave = (window: BrowserWindow): void => {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = null;
  }

  saveWindowState(window);
};

const createWindow = (): void => {
  const savedWindowState = readSavedWindowState();
  const window = new BrowserWindow({
    width: savedWindowState.width,
    height: savedWindowState.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: 'EasyStream Demo',
    backgroundColor: '#141414',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: true
    }
  });

  window.on('resize', () => queueWindowStateSave(window));
  window.on('maximize', () => saveWindowState(window));
  window.on('unmaximize', () => saveWindowState(window));
  window.on('close', () => flushWindowStateSave(window));

  if (savedWindowState.isMaximized) {
    window.maximize();
  }

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'));
  }
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
