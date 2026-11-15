import { useCallback, useRef, useSyncExternalStore } from 'react';
import { lightingPresets as defaultLightingPresets, ptzPresets } from '../demo/presets';
import type { CameraLook, LightingPreset, MediaMode, MediaState, PtzPreset } from '../types';
import type { FeedKind } from '../types';

export type SessionState = {
  cameraLook: CameraLook;
  panZoomSpeed: number;
  presets: PtzPreset[];
  lightingPresets: LightingPreset[];
  activePresetId: string | null;
  activeLightingPresetId: string | null;
  mainFeed: FeedKind;
  media: MediaState;
  playbackProgress: number;
  playbackDuration: number;
};

const clonePresets = (source: PtzPreset[]) => source.map((preset) => ({ ...preset }));
const cloneLightingPresets = (source: LightingPreset[]) => source.map((preset) => ({ ...preset, look: { ...preset.look } }));

const sameCameraLook = (a: CameraLook, b: CameraLook) =>
  Math.abs(a.brightness - b.brightness) < 0.5 &&
  Math.abs(a.contrast - b.contrast) < 0.5 &&
  Math.abs(a.saturation - b.saturation) < 0.5 &&
  Math.abs(a.warmth - b.warmth) < 0.5;

const createInitialState = (): SessionState => ({
  cameraLook: { ...defaultLightingPresets[0].look },
  panZoomSpeed: 1,
  presets: clonePresets(ptzPresets),
  lightingPresets: cloneLightingPresets(defaultLightingPresets),
  activePresetId: null,
  activeLightingPresetId: defaultLightingPresets[0].id,
  mainFeed: 'wide',
  media: { mode: 'slides', isPlaying: false, slideIndex: 0 },
  playbackProgress: 0,
  playbackDuration: 0
});

let state: SessionState = createInitialState();
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const update = (recipe: (current: SessionState) => SessionState) => {
  const next = recipe(state);
  if (next === state) {
    return;
  }

  state = next;
  emit();
};

export const subscribeSession = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSessionState = () => state;

export function useSession<T>(selector: (current: SessionState) => T): T {
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

  return useSyncExternalStore(subscribeSession, getSnapshot, getSnapshot);
}

export const setActivePreset = (presetId: string | null) => {
  update((current) => (current.activePresetId === presetId ? current : { ...current, activePresetId: presetId }));
};

export const savePreset = (presetId: string, pose: { pan: number; tilt: number; zoom: number } | null, thumbnail: string | null) => {
  update((current) => ({
    ...current,
    presets: current.presets.map((preset) =>
      preset.id === presetId
        ? { ...preset, pan: pose?.pan ?? null, tilt: pose?.tilt ?? null, zoom: pose?.zoom ?? null, thumbnail }
        : preset
    ),
    activePresetId: presetId
  }));
};

export const setCameraLook = (cameraLook: CameraLook) => {
  update((current) => {
    const preset =
      current.activeLightingPresetId === null ? undefined : current.lightingPresets.find((item) => item.id === current.activeLightingPresetId);
    const activeLightingPresetId = preset && sameCameraLook(preset.look, cameraLook) ? current.activeLightingPresetId : null;
    if (current.cameraLook === cameraLook && current.activeLightingPresetId === activeLightingPresetId) {
      return current;
    }

    return { ...current, cameraLook, activeLightingPresetId };
  });
};

export const recallLightingPreset = (preset: LightingPreset) => {
  update((current) => ({ ...current, cameraLook: { ...preset.look }, activeLightingPresetId: preset.id }));
};

export const saveLightingPreset = (presetId: string) => {
  update((current) => ({
    ...current,
    lightingPresets: current.lightingPresets.map((preset) => (preset.id === presetId ? { ...preset, look: { ...current.cameraLook } } : preset)),
    activeLightingPresetId: presetId
  }));
};

export const setPanZoomSpeed = (panZoomSpeed: number) => {
  update((current) => (current.panZoomSpeed === panZoomSpeed ? current : { ...current, panZoomSpeed }));
};

export const setMainFeed = (mainFeed: FeedKind) => {
  update((current) => (current.mainFeed === mainFeed ? current : { ...current, mainFeed }));
};

export const setMedia = (media: MediaState) => {
  update((current) => (current.media === media ? current : { ...current, media }));
};

export const chooseMedia = (mode: MediaMode) => {
  update((current) => ({
    ...current,
    media: {
      mode,
      isPlaying: mode === 'video',
      slideIndex: mode === 'slides' ? 0 : current.media.slideIndex
    },
    playbackProgress: mode === 'video' ? 8 : 0,
    playbackDuration: mode === 'video' ? current.playbackDuration : 0
  }));
};

export const stepSlide = (direction: 1 | -1, count: number) => {
  update((current) => ({
    ...current,
    media: {
      ...current.media,
      slideIndex: (current.media.slideIndex + direction + count) % count
    }
  }));
};

export const toggleMediaPlayback = () => {
  update((current) => {
    const nextPlaying = !current.media.isPlaying;
    return {
      ...current,
      media: { ...current.media, isPlaying: nextPlaying },
      playbackProgress: nextPlaying && current.playbackProgress >= 99.5 ? 0 : current.playbackProgress
    };
  });
};

export const setPlaybackProgress = (playbackProgress: number) => {
  update((current) => (Object.is(current.playbackProgress, playbackProgress) ? current : { ...current, playbackProgress }));
};

export const setPlaybackDuration = (playbackDuration: number) => {
  update((current) => (Object.is(current.playbackDuration, playbackDuration) ? current : { ...current, playbackDuration }));
};

export const hydrateSession = (patch: Pick<SessionState, 'presets' | 'lightingPresets'>) => {
  const presets = clonePresets(patch.presets);
  const lightingPresets = cloneLightingPresets(patch.lightingPresets);
  state = {
    ...state,
    presets,
    lightingPresets,
    cameraLook: { ...lightingPresets[0].look },
    activePresetId: null,
    activeLightingPresetId: lightingPresets[0].id
  };
};
