import { useCallback, useRef, useSyncExternalStore } from 'react';
import { emptyObsSnapshot, type ObsPreviewTarget, type ObsProgramFrame, type ObsSnapshot, type ObsStreamSettings, type ObsThumbnail } from '../../shared/obs';

type ObsStore = {
  snapshot: ObsSnapshot;
  thumbnails: ReadonlyMap<string, string>;
};

const sameSnapshot = (left: ObsSnapshot, right: ObsSnapshot) =>
  left.connection === right.connection &&
  left.programScene === right.programScene &&
  left.programSceneUuid === right.programSceneUuid &&
  left.streaming === right.streaming &&
  left.recording === right.recording &&
  left.error === right.error &&
  left.scenes.length === right.scenes.length &&
  left.scenes.every((scene, index) => {
    const other = right.scenes[index];
    return scene.uuid === other.uuid && scene.name === other.name && scene.index === other.index;
  });

let state: ObsStore = {
  snapshot: emptyObsSnapshot(),
  thumbnails: new Map()
};

let programFrame: ObsProgramFrame | null = null;
const listeners = new Set<() => void>();
const imageListeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const emitImages = () => {
  imageListeners.forEach((listener) => listener());
};

export const subscribeObsImages = (listener: () => void) => {
  imageListeners.add(listener);
  return () => {
    imageListeners.delete(listener);
  };
};

export const imageForProgram = () => (programFrame && programFrame.sceneName === state.snapshot.programScene ? programFrame.image : null);

export const imageForScene = (sceneName: string, sceneUuid: string) => {
  if (state.snapshot.programScene === sceneName) {
    return imageForProgram() ?? state.thumbnails.get(sceneUuid) ?? null;
  }

  return state.thumbnails.get(sceneUuid) ?? null;
};

const subscribeObs = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const applySnapshot = (snapshot: ObsSnapshot) => {
  const nextSnapshot = sameSnapshot(state.snapshot, snapshot) ? state.snapshot : snapshot;
  let thumbnails = state.thumbnails;
  if (nextSnapshot.connection !== 'connected') {
    if (thumbnails.size > 0) {
      thumbnails = new Map();
    }
    programFrame = null;
  } else {
    const live = new Set(nextSnapshot.scenes.map((scene) => scene.uuid));
    if ([...thumbnails.keys()].some((uuid) => !live.has(uuid))) {
      thumbnails = new Map([...thumbnails].filter(([uuid]) => live.has(uuid)));
    }
  }

  if (nextSnapshot.connection === 'connected' && programFrame && programFrame.sceneName !== nextSnapshot.programScene) {
    const previous = state.snapshot.scenes.find((scene) => scene.name === programFrame?.sceneName);
    if (previous && nextSnapshot.scenes.some((scene) => scene.uuid === previous.uuid)) {
      const nextThumbnails = new Map(thumbnails);
      nextThumbnails.set(previous.uuid, programFrame.image);
      thumbnails = nextThumbnails;
    }
    programFrame = null;
  }

  if (nextSnapshot === state.snapshot && thumbnails === state.thumbnails) {
    return;
  }

  state = { snapshot: nextSnapshot, thumbnails };
  emit();
  emitImages();
};

const applyThumbnail = (thumbnail: ObsThumbnail) => {
  if (state.snapshot.connection === 'connected' && !state.snapshot.scenes.some((scene) => scene.uuid === thumbnail.uuid)) {
    return;
  }

  if (state.thumbnails.get(thumbnail.uuid) === thumbnail.image) {
    return;
  }

  const thumbnails = new Map(state.thumbnails);
  thumbnails.set(thumbnail.uuid, thumbnail.image);
  state = { ...state, thumbnails };
  emitImages();
};

const applyProgramFrame = (frame: ObsProgramFrame) => {
  if (frame.sceneName !== state.snapshot.programScene || programFrame?.image === frame.image) {
    return;
  }

  programFrame = frame;
  emitImages();
};

export function useObs<T>(selector: (current: ObsStore) => T): T {
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

  return useSyncExternalStore(subscribeObs, getSnapshot, getSnapshot);
}

const unavailable = (): Promise<{ ok: false; error: string }> => Promise.resolve({ ok: false, error: 'OBS bridge is unavailable' });

export const setObsScene = (sceneName: string) => window.easystream?.setObsScene(sceneName) ?? unavailable();

export const setObsStreaming = (active: boolean) => window.easystream?.setObsStreaming(active) ?? unavailable();

export const setObsRecording = (active: boolean) => window.easystream?.setObsRecording(active) ?? unavailable();

export const readObsStreamSettings = (): Promise<ObsStreamSettings | null> => window.easystream?.getObsStreamSettings() ?? Promise.resolve(null);

export const setObsPreviewTarget = (target: ObsPreviewTarget) => window.easystream?.setObsPreviewTarget(target) ?? Promise.resolve();

let syncStarted = false;

export const startObsSync = () => {
  if (syncStarted) {
    return;
  }

  syncStarted = true;
  const api = window.easystream;
  if (!api) {
    applySnapshot({ ...state.snapshot, connection: 'disconnected', error: 'OBS bridge is unavailable' });
    return;
  }

  api.onObsState(applySnapshot);
  api.onObsThumbnail(applyThumbnail);
  api.onObsProgramFrame(applyProgramFrame);
  void api.getObsState().then(async (snapshot) => {
    applySnapshot(snapshot);
    const thumbnails = await api.getObsThumbnails();
    for (const thumbnail of thumbnails) {
      applyThumbnail(thumbnail);
    }
  });
};
