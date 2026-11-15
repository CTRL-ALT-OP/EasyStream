export type { CameraLook, CropRect, LightingPreset, PtzPreset } from '../shared/settings';

export type CameraSource =
  | { kind: 'still'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'camera'; deviceId: string };

export type FeedKind = 'wide' | 'ptz';

export type MediaMode = 'slides' | 'video';

export type MediaState = {
  mode: MediaMode;
  isPlaying: boolean;
  slideIndex: number;
};
