import { describe, expect, it } from 'vitest';
import { parseObsScenes } from '../../shared/obs';

describe('parseObsScenes', () => {
  it('orders scenes from the top of the OBS list and skips invalid entries', () => {
    expect(
      parseObsScenes([
        { sceneName: 'Camera above Media', sceneUuid: 'bottom', sceneIndex: 0 },
        { sceneName: 'Media Full', sceneUuid: 'middle', sceneIndex: 1 },
        { sceneName: 'PTZ Full', sceneUuid: 'top', sceneIndex: 2 },
        { sceneName: 'Missing id' }
      ])
    ).toEqual([
      { name: 'PTZ Full', uuid: 'top', index: 2 },
      { name: 'Media Full', uuid: 'middle', index: 1 },
      { name: 'Camera above Media', uuid: 'bottom', index: 0 }
    ]);
  });
});
