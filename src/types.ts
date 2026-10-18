export type FeedKind = 'wide' | 'ptz';

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PtzPreset = {
  id: string;
  label: string;
  description: string;
  crop: CropRect;
};

export type LayoutPresetId = 'ptz-full' | 'media-full' | 'media-portrait-right' | 'media-portrait-tight';

export type LayoutPreset = {
  id: LayoutPresetId;
  label: string;
  description: string;
};

export type MediaMode = 'slides' | 'video';

export type MediaState = {
  mode: MediaMode;
  isPlaying: boolean;
  progress: number;
  slideIndex: number;
};
