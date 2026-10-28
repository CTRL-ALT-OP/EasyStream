import { useCallback, useMemo, useState } from 'react';
import { CameraPreview } from './components/CameraPreview';
import { DevTooltips } from './components/DevTooltips';
import { MediaControls } from './components/MediaControls';
import { PtzDockProvider, PtzLightingControls, PtzMainControls } from './components/PtzDockControls';
import { StreamingControls } from './components/StreamingControls';
import { layoutPresets, lightingPresets as defaultLightingPresets, ptzPresets } from './demo/presets';
import { DockLayout } from './docks/DockLayout';
import type { DockBlockDefinition } from './docks/types';
import type { CameraLook, CropRect, FeedKind, LayoutPresetId, LightingPreset, MediaState, PtzPreset } from './types';

const initialMediaState: MediaState = {
  mode: 'slides',
  isPlaying: false,
  progress: 0,
  slideIndex: 0
};

const clonePresets = (source: PtzPreset[]) => source.map((preset) => ({ ...preset, crop: { ...preset.crop } }));
const cloneLightingPresets = (source: LightingPreset[]) => source.map((preset) => ({ ...preset, look: { ...preset.look } }));

const sameCrop = (a: CropRect, b: CropRect) =>
  Math.abs(a.x - b.x) < 0.05 &&
  Math.abs(a.y - b.y) < 0.05 &&
  Math.abs(a.width - b.width) < 0.05 &&
  Math.abs(a.height - b.height) < 0.05;

const sameCameraLook = (a: CameraLook, b: CameraLook) =>
  Math.abs(a.brightness - b.brightness) < 0.5 &&
  Math.abs(a.contrast - b.contrast) < 0.5 &&
  Math.abs(a.saturation - b.saturation) < 0.5 &&
  Math.abs(a.warmth - b.warmth) < 0.5;

function App() {
  const [presets, setPresets] = useState<PtzPreset[]>(() => clonePresets(ptzPresets));
  const [lightingPresets, setLightingPresets] = useState<LightingPreset[]>(() => cloneLightingPresets(defaultLightingPresets));
  const [crop, setCrop] = useState<CropRect>(ptzPresets[0].crop);
  const [cameraLook, setCameraLook] = useState<CameraLook>(defaultLightingPresets[0].look);
  const [panZoomSpeed, setPanZoomSpeed] = useState(1);
  const [mainFeed, setMainFeed] = useState<FeedKind>('wide');
  const [activePresetId, setActivePresetId] = useState<string | null>(ptzPresets[0].id);
  const [activeLightingPresetId, setActiveLightingPresetId] = useState<string | null>(defaultLightingPresets[0].id);
  const [activeLayout, setActiveLayout] = useState<LayoutPresetId>('media-portrait-right');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [media, setMedia] = useState<MediaState>(initialMediaState);

  const handlePlaybackProgress = useCallback((progress: number) => {
    setMedia((current) => {
      if (current.mode !== 'video' || !current.isPlaying) {
        return current;
      }

      return { ...current, progress };
    });
  }, []);

  const handleCropChange = (nextCrop: CropRect) => {
    setCrop(nextCrop);
    setActivePresetId((currentId) => {
      if (currentId === null) {
        return null;
      }

      const preset = presets.find((item) => item.id === currentId);
      return preset && sameCrop(preset.crop, nextCrop) ? currentId : null;
    });
  };

  const handlePresetRecall = (preset: PtzPreset) => {
    setCrop({ ...preset.crop });
    setActivePresetId(preset.id);
  };

  const handlePresetSave = (presetId: string) => {
    const stored = { ...crop };
    setPresets((current) => current.map((preset) => (preset.id === presetId ? { ...preset, crop: stored } : preset)));
    setActivePresetId(presetId);
  };

  const handleCameraLookChange = (nextLook: CameraLook) => {
    setCameraLook(nextLook);
    setActiveLightingPresetId((currentId) => {
      if (currentId === null) {
        return null;
      }

      const preset = lightingPresets.find((item) => item.id === currentId);
      return preset && sameCameraLook(preset.look, nextLook) ? currentId : null;
    });
  };

  const handleLightingPresetRecall = (preset: LightingPreset) => {
    setCameraLook({ ...preset.look });
    setActiveLightingPresetId(preset.id);
  };

  const handleLightingPresetSave = (presetId: string) => {
    const stored = { ...cameraLook };
    setLightingPresets((current) => current.map((preset) => (preset.id === presetId ? { ...preset, look: stored } : preset)));
    setActiveLightingPresetId(presetId);
  };

  const dockBlocks = useMemo<DockBlockDefinition[]>(
    () => [
      {
        id: 'preview',
        title: 'Preview',
        priority: 5,
        minWidth: 560,
        minHeight: 320,
        defaultRow: 0,
        defaultIndex: 0,
        content: (
          <CameraPreview
            crop={crop}
            cameraLook={cameraLook}
            mainFeed={mainFeed}
            onCropChange={handleCropChange}
            onMainFeedChange={setMainFeed}
          />
        )
      },
      {
        id: 'ptz',
        title: 'PTZ',
        priority: 2,
        minWidth: 252,
        minHeight: 360,
        defaultRow: 0,
        defaultIndex: 1,
        content: (
          <PtzMainControls
            crop={crop}
            speed={panZoomSpeed}
            presets={presets}
            activePresetId={activePresetId}
            onCropChange={handleCropChange}
            onPresetRecall={handlePresetRecall}
            onPresetSave={handlePresetSave}
          />
        )
      },
      {
        id: 'lighting',
        title: 'Lighting',
        priority: 1,
        minWidth: 281,
        minHeight: 400,
        defaultRow: 0,
        defaultIndex: 2,
        content: (
          <PtzLightingControls
            look={cameraLook}
            speed={panZoomSpeed}
            lightingPresets={lightingPresets}
            activeLightingPresetId={activeLightingPresetId}
            onLookChange={handleCameraLookChange}
            onSpeedChange={setPanZoomSpeed}
            onLightingPresetRecall={handleLightingPresetRecall}
            onLightingPresetSave={handleLightingPresetSave}
          />
        )
      },
      {
        id: 'output',
        title: 'Output',
        priority: 4,
        minWidth: 520,
        minHeight: 378,
        defaultRow: 1,
        defaultIndex: 0,
        content: (
          <StreamingControls
            crop={crop}
            cameraLook={cameraLook}
            media={media}
            layouts={layoutPresets}
            activeLayout={activeLayout}
            isStreaming={isStreaming}
            isRecording={isRecording}
            onLayoutChange={setActiveLayout}
            onStreamingChange={setIsStreaming}
            onRecordingChange={setIsRecording}
          />
        )
      },
      {
        id: 'media',
        title: 'Media',
        priority: 3,
        minWidth: 452,
        minHeight: 378,
        defaultRow: 1,
        defaultIndex: 1,
        content: <MediaControls media={media} onMediaChange={setMedia} onPlaybackProgress={handlePlaybackProgress} />
      }
    ],
    [
      activeLayout,
      activeLightingPresetId,
      activePresetId,
      cameraLook,
      crop,
      handlePlaybackProgress,
      isRecording,
      isStreaming,
      lightingPresets,
      mainFeed,
      media,
      panZoomSpeed,
      presets
    ]
  );

  return (
    <div className="app-shell">
      <DevTooltips />
      <PtzDockProvider>
        <DockLayout blocks={dockBlocks} />
      </PtzDockProvider>
    </div>
  );
}

export default App;
