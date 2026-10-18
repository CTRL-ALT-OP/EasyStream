import type { LayoutPreset, PtzPreset } from '../types';

export const defaultCrop = {
  x: 36,
  y: 30,
  width: 28,
  height: 31.5
};

export const ptzPresets: PtzPreset[] = [
  {
    id: 'stage-wide',
    label: 'Stage Wide',
    description: 'Full platform and podium',
    crop: { x: 22, y: 20, width: 56, height: 31.5 }
  },
  {
    id: 'podium',
    label: 'Podium',
    description: 'Speaker close-up',
    crop: { x: 42, y: 24, width: 18, height: 20.25 }
  },
  {
    id: 'worship',
    label: 'Worship',
    description: 'Left stage group',
    crop: { x: 18, y: 25, width: 24, height: 27 }
  },
  {
    id: 'audience',
    label: 'Audience',
    description: 'Room response',
    crop: { x: 28, y: 48, width: 44, height: 24.75 }
  },
  {
    id: 'center-aisle',
    label: 'Center Aisle',
    description: 'Balanced room view',
    crop: { x: 34, y: 34, width: 32, height: 18 }
  },
  {
    id: 'right-stage',
    label: 'Right Stage',
    description: 'Panel or host view',
    crop: { x: 58, y: 28, width: 24, height: 27 }
  }
];

export const layoutPresets: LayoutPreset[] = [
  {
    id: 'ptz-full',
    label: 'PTZ Full',
    description: 'Program output is the active PTZ crop.'
  },
  {
    id: 'media-full',
    label: 'Media Full',
    description: 'Slides or video fill the entire stream.'
  },
  {
    id: 'media-portrait-right',
    label: 'Media + Speaker',
    description: 'Media with portrait PTZ crop on the right.'
  },
  {
    id: 'media-portrait-tight',
    label: 'Media + Tight PTZ',
    description: 'A tighter portrait PTZ variant for a second live preset.'
  }
];
