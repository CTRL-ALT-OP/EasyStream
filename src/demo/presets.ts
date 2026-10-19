import type { LayoutPreset, PtzPreset } from '../types';

export const ptzPresets: PtzPreset[] = [
  {
    id: 'stage-wide',
    label: 'Stage Wide',
    description: 'Full platform and podium',
    crop: { x: 22, y: 7.75, width: 56, height: 56 }
  },
  {
    id: 'podium',
    label: 'Podium',
    description: 'Speaker close-up',
    crop: { x: 42, y: 25.125, width: 18, height: 18 }
  },
  {
    id: 'worship',
    label: 'Worship',
    description: 'Left stage group',
    crop: { x: 18, y: 26.5, width: 24, height: 24 }
  },
  {
    id: 'audience',
    label: 'Audience',
    description: 'Room response',
    crop: { x: 28, y: 38.375, width: 44, height: 44 }
  },
  {
    id: 'center-aisle',
    label: 'Center Aisle',
    description: 'Balanced room view',
    crop: { x: 34, y: 27, width: 32, height: 32 }
  },
  {
    id: 'right-stage',
    label: 'Right Stage',
    description: 'Panel or host view',
    crop: { x: 58, y: 29.5, width: 24, height: 24 }
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
  },
  {
    id: 'media-camera-below',
    label: 'Camera Below',
    description: 'Full media with the PTZ camera underneath.'
  },
  {
    id: 'media-camera-above',
    label: 'Camera Above',
    description: 'PTZ camera with the full media underneath.'
  }
];
