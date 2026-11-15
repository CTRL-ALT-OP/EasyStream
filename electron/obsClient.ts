import { app, BrowserWindow } from 'electron';
import OBSWebSocket from 'obs-websocket-js';
import {
  parseObsScenes,
  emptyObsSnapshot,
  type ObsCommandResult,
  type ObsPreviewTarget,
  type ObsProgramFrame,
  type ObsScene,
  type ObsSnapshot,
  type ObsStreamSettings,
  type ObsThumbnail
} from '../shared/obs';

const OBS_URL = 'ws://127.0.0.1:4455';
const OBS_PASSWORD = 'EasyStream';
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 10000] as const;
const SCENE_REFRESH_DELAY_MS = 50;
const PROGRAM_INTERVAL_MS = 50;
const THUMBNAIL_GAP_MS = 16;
const SINGLE_SCENE_INTERVAL_MS = 100;
const THUMBNAIL_QUALITY = 45;
const PROGRAM_FRAME_QUALITY = 55;
const MAX_CAPTURE_WIDTH = 960;

const obs = new OBSWebSocket();

let snapshot: ObsSnapshot = emptyObsSnapshot();
let started = false;
let stopped = false;
let generation = 0;
let connectInFlight = false;
let retryAttempt = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let sceneRefreshTimer: NodeJS.Timeout | null = null;
let previewWanted = false;
let programCaptureWidth = 0;
let sceneCaptureWidth = 0;
let visibleSceneUuids: string[] = [];
let controlDepth = 0;
let thumbnailCursor = 0;
let programLoop: Promise<void> | null = null;
let thumbnailLoop: Promise<void> | null = null;
const thumbnailCache = new Map<string, string>();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const previewAllowed = () => previewWanted && !stopped && snapshot.connection === 'connected' && windowVisible();

const OBS_STATUS_MESSAGES: Record<number, string> = {
  500: 'That output is already running',
  501: 'That output is not active',
  502: 'That output is paused',
  503: 'That output is not paused',
  504: 'That output is disabled',
  505: 'Studio mode is on',
  506: 'Studio mode is off',
  600: 'OBS could not find that resource',
  601: 'That OBS resource already exists'
};

const errorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number' ? error.code : null;
  if (code !== null && OBS_STATUS_MESSAGES[code]) {
    return OBS_STATUS_MESSAGES[code];
  }

  return code === null ? 'OBS request failed' : `OBS request failed (${code})`;
};

const request = async <T>(call: Promise<T>): Promise<T> => {
  let rejectClosed: ((error: Error) => void) | undefined;
  const closed = new Promise<never>((_, reject) => {
    rejectClosed = reject;
  });
  const onClosed = () => rejectClosed?.(new Error('OBS connection closed'));
  obs.on('ConnectionClosed', onClosed);
  try {
    return await Promise.race([call, closed]);
  } finally {
    obs.off('ConnectionClosed', onClosed);
  }
};

const asImageSource = (imageData: string) => (imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`);

const send = (channel: string, payload: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      continue;
    }

    window.webContents.send(channel, payload);
  }
};

const sameScenes = (left: readonly ObsScene[], right: readonly ObsScene[]) =>
  left.length === right.length &&
  left.every((scene, index) => {
    const other = right[index];
    return scene.uuid === other.uuid && scene.name === other.name && scene.index === other.index;
  });

const windowVisible = () => BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.isVisible() && !window.isMinimized());

const syncPreviewLoops = () => {
  if (previewAllowed() && snapshot.programScene && !programLoop) {
    programLoop = runProgramLoop().finally(() => {
      programLoop = null;
      if (previewAllowed() && snapshot.programScene) {
        syncPreviewLoops();
      }
    });
  }

  if (previewAllowed() && snapshot.scenes.length > 0 && !thumbnailLoop) {
    thumbnailLoop = runThumbnailLoop().finally(() => {
      thumbnailLoop = null;
      if (previewAllowed() && snapshot.scenes.length > 0) {
        syncPreviewLoops();
      }
    });
  }
};

const updateSnapshot = (patch: Partial<ObsSnapshot>) => {
  const scenes = patch.scenes ? (sameScenes(snapshot.scenes, patch.scenes) ? snapshot.scenes : patch.scenes) : snapshot.scenes;
  const next: ObsSnapshot = {
    connection: patch.connection ?? snapshot.connection,
    scenes,
    programScene: patch.programScene === undefined ? snapshot.programScene : patch.programScene,
    programSceneUuid: patch.programSceneUuid === undefined ? snapshot.programSceneUuid : patch.programSceneUuid,
    streaming: patch.streaming ?? snapshot.streaming,
    recording: patch.recording ?? snapshot.recording,
    error: patch.error === undefined ? snapshot.error : patch.error
  };

  if (
    next.connection === snapshot.connection &&
    next.scenes === snapshot.scenes &&
    next.programScene === snapshot.programScene &&
    next.programSceneUuid === snapshot.programSceneUuid &&
    next.streaming === snapshot.streaming &&
    next.recording === snapshot.recording &&
    next.error === snapshot.error
  ) {
    return;
  }

  const scenesChanged = next.scenes !== snapshot.scenes;
  snapshot = next;
  send('obs:state', snapshot);
  if (snapshot.connection !== 'connected') {
    thumbnailCache.clear();
    thumbnailCursor = 0;
  } else if (scenesChanged) {
    thumbnailCursor = 0;
  }
  syncPreviewLoops();
};

const sceneNameOf = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : null);

const dropStaleThumbnails = () => {
  const live = new Set(snapshot.scenes.map((scene) => scene.uuid));
  for (const uuid of thumbnailCache.keys()) {
    if (!live.has(uuid)) {
      thumbnailCache.delete(uuid);
    }
  }
};

const captureWidth = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const width = Math.round(value);
  if (width < 32) {
    return 0;
  }

  return Math.min(width, MAX_CAPTURE_WIDTH);
};

const thumbnailTargets = () => {
  if (sceneCaptureWidth < 32 || visibleSceneUuids.length === 0) {
    return [];
  }

  const wanted = new Set(visibleSceneUuids);
  return snapshot.scenes.filter((scene) => wanted.has(scene.uuid) && scene.name !== snapshot.programScene);
};

const runProgramLoop = async () => {
  while (previewAllowed() && snapshot.programScene) {
    if (controlDepth > 0) {
      await delay(40);
      continue;
    }

    const width = programCaptureWidth;
    if (width < 32) {
      await delay(50);
      continue;
    }

    const started = Date.now();
    const sceneName = snapshot.programScene;
    try {
      const { imageData } = await request(
        obs.call('GetSourceScreenshot', {
          sourceName: sceneName,
          imageFormat: 'jpeg',
          imageWidth: width,
          imageCompressionQuality: PROGRAM_FRAME_QUALITY
        })
      );
      if (previewAllowed() && snapshot.programScene === sceneName) {
        const frame: ObsProgramFrame = { sceneName, image: asImageSource(imageData) };
        send('obs:program-frame', frame);
      }
    } catch {
      // The next pass retries. A dropped socket is handled by ConnectionClosed.
    }

    const wait = Math.max(0, PROGRAM_INTERVAL_MS - (Date.now() - started));
    if (wait > 0) {
      await delay(wait);
    }
  }
};

const runThumbnailLoop = async () => {
  while (previewAllowed() && snapshot.scenes.length > 0) {
    if (controlDepth > 0) {
      await delay(40);
      continue;
    }

    const scenes = thumbnailTargets();
    if (scenes.length === 0) {
      await delay(50);
      continue;
    }

    dropStaleThumbnails();
    const scene = scenes[thumbnailCursor % scenes.length];
    thumbnailCursor += 1;
    const width = sceneCaptureWidth;
    const started = Date.now();
    try {
      const { imageData } = await request(
        obs.call('GetSourceScreenshot', {
          sourceName: scene.name,
          imageFormat: 'jpeg',
          imageWidth: width,
          imageCompressionQuality: THUMBNAIL_QUALITY
        })
      );
      const stillVisible = thumbnailTargets().some((item) => item.uuid === scene.uuid);
      if (stillVisible) {
        const image = asImageSource(imageData);
        thumbnailCache.set(scene.uuid, image);
        const thumbnail: ObsThumbnail = { uuid: scene.uuid, image };
        send('obs:thumbnail', thumbnail);
      }
    } catch {
      await delay(80);
      continue;
    }

    const period = scenes.length <= 1 ? SINGLE_SCENE_INTERVAL_MS : THUMBNAIL_GAP_MS;
    const wait = Math.max(0, period - (Date.now() - started));
    if (wait > 0) {
      await delay(wait);
    }
  }
};

const retryDelay = () => {
  const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
  retryAttempt += 1;
  return delay;
};

const scheduleReconnect = () => {
  if (stopped || reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, retryDelay());
};

const failConnection = (error: unknown) => {
  if (stopped) {
    return;
  }

  if (sceneRefreshTimer) {
    clearTimeout(sceneRefreshTimer);
    sceneRefreshTimer = null;
  }

  updateSnapshot({
    connection: 'disconnected',
    scenes: [],
    programScene: null,
    programSceneUuid: null,
    streaming: false,
    recording: false,
    error: errorMessage(error)
  });
  scheduleReconnect();
};

const loadOutputState = async () => {
  const [sceneList, streamStatus, recordStatus] = await Promise.all([
    request(obs.call('GetSceneList')),
    request(obs.call('GetStreamStatus')),
    request(obs.call('GetRecordStatus'))
  ]);
  const scenes = parseObsScenes(sceneList.scenes);
  updateSnapshot({
    connection: 'connected',
    scenes,
    programScene: sceneNameOf(sceneList.currentProgramSceneName),
    programSceneUuid: sceneNameOf(sceneList.currentProgramSceneUuid),
    streaming: streamStatus.outputActive,
    recording: recordStatus.outputActive,
    error: null
  });
};

const connect = async () => {
  if (stopped || connectInFlight || snapshot.connection === 'connected') {
    return;
  }

  connectInFlight = true;
  const current = ++generation;
  updateSnapshot({ connection: 'connecting' });
  try {
    await obs.connect(OBS_URL, OBS_PASSWORD);
    if (stopped || current !== generation) {
      await obs.disconnect();
      return;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    retryAttempt = 0;
    await loadOutputState();
  } catch (error) {
    if (stopped || current !== generation) {
      return;
    }

    failConnection(error);
  } finally {
    connectInFlight = false;
  }
};

const scheduleSceneRefresh = () => {
  if (sceneRefreshTimer || snapshot.connection !== 'connected') {
    return;
  }

  sceneRefreshTimer = setTimeout(() => {
    sceneRefreshTimer = null;
    void refreshScenes();
  }, SCENE_REFRESH_DELAY_MS);
};

const refreshScenes = async () => {
  if (snapshot.connection !== 'connected') {
    return;
  }

  try {
    const sceneList = await request(obs.call('GetSceneList'));
    updateSnapshot({
      scenes: parseObsScenes(sceneList.scenes),
      programScene: sceneNameOf(sceneList.currentProgramSceneName),
      programSceneUuid: sceneNameOf(sceneList.currentProgramSceneUuid),
      error: null
    });
  } catch (error) {
    if (snapshot.connection === 'connected') {
      updateSnapshot({ error: errorMessage(error) });
    }
  }
};

const command = async (run: () => Promise<void>): Promise<ObsCommandResult> => {
  if (snapshot.connection !== 'connected') {
    return { ok: false, error: 'OBS is not connected' };
  }

  controlDepth += 1;
  try {
    await run();
    updateSnapshot({ error: null });
    return { ok: true };
  } catch (error) {
    const message = errorMessage(error);
    updateSnapshot({ error: message });
    return { ok: false, error: message };
  } finally {
    controlDepth -= 1;
    syncPreviewLoops();
  }
};

const SERVICE_LABELS: Record<string, string> = {
  rtmp_common: 'RTMP',
  rtmp_custom: 'Custom RTMP'
};

const readStringSetting = (settings: unknown, key: string) => {
  if (typeof settings !== 'object' || settings === null || !(key in settings)) {
    return null;
  }

  const value = (settings as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
};

const formatFrameRate = (numerator: number, denominator: number) => {
  if (!denominator) {
    return `${numerator} fps`;
  }

  const fps = Math.round((numerator / denominator) * 100) / 100;
  return `${fps} fps`;
};

const watchWindow = (window: BrowserWindow) => {
  const sync = () => syncPreviewLoops();
  window.on('show', sync);
  window.on('hide', sync);
  window.on('minimize', sync);
  window.on('restore', sync);
};

const registerObsEvents = () => {
  obs.on('ConnectionClosed', () => {
    if (stopped || snapshot.connection !== 'connected') {
      return;
    }

    failConnection(new Error('OBS connection closed'));
  });

  obs.on('CurrentProgramSceneChanged', (event) => {
    if (snapshot.connection !== 'connected') {
      return;
    }

    updateSnapshot({ programScene: event.sceneName, programSceneUuid: event.sceneUuid });
  });

  obs.on('StreamStateChanged', (event) => {
    if (snapshot.connection !== 'connected') {
      return;
    }

    updateSnapshot({ streaming: event.outputActive });
  });

  obs.on('RecordStateChanged', (event) => {
    if (snapshot.connection !== 'connected') {
      return;
    }

    updateSnapshot({ recording: event.outputActive });
  });

  const queueRefresh = () => {
    if (snapshot.connection === 'connected') {
      scheduleSceneRefresh();
    }
  };

  obs.on('SceneCreated', queueRefresh);
  obs.on('SceneRemoved', queueRefresh);
  obs.on('SceneNameChanged', queueRefresh);
  obs.on('SceneListChanged', queueRefresh);
};

export const startObsClient = () => {
  if (started) {
    return;
  }

  started = true;
  for (const window of BrowserWindow.getAllWindows()) {
    watchWindow(window);
  }
  app.on('browser-window-created', (_event, window) => {
    watchWindow(window);
  });
  registerObsEvents();
  void connect();
};

export const stopObsClient = () => {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sceneRefreshTimer) {
    clearTimeout(sceneRefreshTimer);
    sceneRefreshTimer = null;
  }
  void obs.disconnect().catch(() => undefined);
};

export const getObsSnapshot = () => snapshot;

export const getObsThumbnails = (): ObsThumbnail[] => [...thumbnailCache.entries()].map(([uuid, image]) => ({ uuid, image }));

export const setObsPreviewTarget = (value: unknown) => {
  if (typeof value !== 'object' || value === null) {
    return;
  }

  const target = value as Partial<ObsPreviewTarget>;
  previewWanted = target.active === true;
  programCaptureWidth = captureWidth(typeof target.programWidth === 'number' ? target.programWidth : 0);
  sceneCaptureWidth = captureWidth(typeof target.sceneWidth === 'number' ? target.sceneWidth : 0);
  const nextUuids = Array.isArray(target.sceneUuids) ? target.sceneUuids.filter((uuid) => typeof uuid === 'string') : [];
  const sameVisible =
    nextUuids.length === visibleSceneUuids.length && nextUuids.every((uuid, index) => uuid === visibleSceneUuids[index]);
  if (!sameVisible) {
    thumbnailCursor = 0;
  }
  visibleSceneUuids = nextUuids;
  syncPreviewLoops();
};

export const setObsProgramScene = (sceneName: unknown) => {
  if (typeof sceneName !== 'string' || sceneName.length === 0) {
    return Promise.resolve({ ok: false, error: 'Invalid scene' } satisfies ObsCommandResult);
  }

  return command(async () => {
    await request(obs.call('SetCurrentProgramScene', { sceneName }));
  });
};

export const setObsStreaming = (active: unknown) => {
  if (typeof active !== 'boolean') {
    return Promise.resolve({ ok: false, error: 'Invalid stream state' } satisfies ObsCommandResult);
  }

  return command(async () => {
    await request(obs.call(active ? 'StartStream' : 'StopStream'));
  });
};

export const setObsRecording = (active: unknown) => {
  if (typeof active !== 'boolean') {
    return Promise.resolve({ ok: false, error: 'Invalid record state' } satisfies ObsCommandResult);
  }

  return command(async () => {
    await request(obs.call(active ? 'StartRecord' : 'StopRecord'));
  });
};

export const getObsStreamSettings = async (): Promise<ObsStreamSettings | null> => {
  if (snapshot.connection !== 'connected') {
    return null;
  }

  try {
    const [video, service] = await Promise.all([request(obs.call('GetVideoSettings')), request(obs.call('GetStreamServiceSettings'))]);
    return {
      service: readStringSetting(service.streamServiceSettings, 'service') ?? SERVICE_LABELS[service.streamServiceType] ?? service.streamServiceType,
      server: readStringSetting(service.streamServiceSettings, 'server') ?? 'Service default',
      resolution: `${video.outputWidth} x ${video.outputHeight}`,
      frameRate: formatFrameRate(video.fpsNumerator, video.fpsDenominator)
    };
  } catch (error) {
    updateSnapshot({ error: errorMessage(error) });
    return null;
  }
};
