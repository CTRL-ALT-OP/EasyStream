export type ObsConnection = 'connecting' | 'connected' | 'disconnected';

export type ObsScene = {
  name: string;
  uuid: string;
  index: number;
};

export type ObsSnapshot = {
  connection: ObsConnection;
  scenes: ObsScene[];
  programScene: string | null;
  programSceneUuid: string | null;
  streaming: boolean;
  recording: boolean;
  error: string | null;
};

export type ObsCommandResult = { ok: true } | { ok: false; error: string };

export type ObsStreamSettings = {
  service: string;
  server: string;
  resolution: string;
  frameRate: string;
};

export type ObsThumbnail = {
  uuid: string;
  image: string;
};

export type ObsProgramFrame = {
  sceneName: string;
  image: string;
};

export type ObsPreviewTarget = {
  active: boolean;
  programWidth: number;
  sceneWidth: number;
  sceneUuids: string[];
};

export const emptyObsSnapshot = (): ObsSnapshot => ({
  connection: 'connecting',
  scenes: [],
  programScene: null,
  programSceneUuid: null,
  streaming: false,
  recording: false,
  error: null
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseObsScenes = (scenes: readonly unknown[]): ObsScene[] => {
  const parsed: ObsScene[] = [];
  for (const scene of scenes) {
    if (!isRecord(scene) || typeof scene.sceneName !== 'string' || typeof scene.sceneUuid !== 'string') {
      continue;
    }

    const index = typeof scene.sceneIndex === 'number' && Number.isFinite(scene.sceneIndex) ? scene.sceneIndex : 0;
    parsed.push({ name: scene.sceneName, uuid: scene.sceneUuid, index });
  }

  parsed.sort((left, right) => right.index - left.index);
  return parsed;
};
