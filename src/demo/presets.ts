import type { LightingPreset, PtzPreset } from '../types';

const unset = { pan: null, tilt: null, zoom: null, thumbnail: null };

export const ptzPresets: PtzPreset[] = [
  { id: 'stage-wide', label: 'Stage Wide', ...unset },
  { id: 'podium', label: 'Podium', ...unset },
  { id: 'worship', label: 'Worship', ...unset },
  { id: 'audience', label: 'Audience', ...unset },
  { id: 'center-aisle', label: 'Center Aisle', ...unset },
  { id: 'right-stage', label: 'Right Stage', ...unset }
];

export const lightingPresets: LightingPreset[] = [
  {
    id: 'neutral',
    label: 'Neutral',
    description: 'Natural auditorium balance',
    look: { brightness: 100, contrast: 100, saturation: 100, warmth: 0 }
  },
  {
    id: 'bright-stage',
    label: 'Bright Stage',
    description: 'Lift dim platform light',
    look: { brightness: 116, contrast: 106, saturation: 104, warmth: 8 }
  },
  {
    id: 'warm-service',
    label: 'Warm Service',
    description: 'Amber house lighting',
    look: { brightness: 104, contrast: 108, saturation: 112, warmth: 32 }
  },
  {
    id: 'cool-led',
    label: 'Cool LED',
    description: 'Blue-white fixture wash',
    look: { brightness: 96, contrast: 110, saturation: 118, warmth: -28 }
  }
];
