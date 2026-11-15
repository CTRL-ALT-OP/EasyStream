export type { CameraLook, LightingPreset, PtzPreset } from '../shared/settings';

export type FeedKind = 'wide' | 'ptz';

export type MediaMode = 'slides' | 'video';

export type MediaState = {
  mode: MediaMode;
  isPlaying: boolean;
  slideIndex: number;
};
