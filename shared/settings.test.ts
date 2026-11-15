import { describe, expect, it } from 'vitest';
import { defaultCameraConfig } from './cameras';
import { parseSettingsDocument } from './settings';

describe('settings migration', () => {
  it('drops simulated crops when reading a version 1 document', () => {
    const parsed = parseSettingsDocument({
      version: 1,
      presets: [{ id: 'stage-wide', label: 'Stage Wide', crop: { x: 1, y: 2, width: 3, height: 4 } }],
      lightingPresets: [
        {
          id: 'neutral',
          label: 'Neutral',
          description: 'Natural',
          look: { brightness: 100, contrast: 100, saturation: 100, warmth: 0 }
        }
      ],
      dockLayout: { rows: [] }
    });

    expect(parsed?.version).toBe(2);
    expect(parsed?.presets[0]).toMatchObject({ id: 'stage-wide', pan: null, tilt: null, zoom: null, thumbnail: null });
    expect(parsed?.cameras).toEqual(defaultCameraConfig);
    expect(parsed?.calibration).toBeNull();
    expect(parsed?.lightingPresets).toHaveLength(1);
  });
});
