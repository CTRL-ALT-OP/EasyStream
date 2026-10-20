import { useCallback, useState } from 'react';
import { CameraPanel } from './components/CameraPanel';
import { DevTooltips } from './components/DevTooltips';
import { MediaControls } from './components/MediaControls';
import { StreamingControls } from './components/StreamingControls';
import { layoutPresets, ptzPresets } from './demo/presets';
import type { CropRect, FeedKind, LayoutPresetId, MediaState, PtzPreset } from './types';

const initialMediaState: MediaState = {
  mode: 'slides',
  isPlaying: false,
  progress: 0,
  slideIndex: 0
};

const clonePresets = (source: PtzPreset[]) => source.map((preset) => ({ ...preset, crop: { ...preset.crop } }));

const sameCrop = (a: CropRect, b: CropRect) =>
  Math.abs(a.x - b.x) < 0.05 &&
  Math.abs(a.y - b.y) < 0.05 &&
  Math.abs(a.width - b.width) < 0.05 &&
  Math.abs(a.height - b.height) < 0.05;

function App() {
  const [presets, setPresets] = useState<PtzPreset[]>(() => clonePresets(ptzPresets));
  const [crop, setCrop] = useState<CropRect>(ptzPresets[0].crop);
  const [mainFeed, setMainFeed] = useState<FeedKind>('wide');
  const [activePresetId, setActivePresetId] = useState<string | null>(ptzPresets[0].id);
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

  return (
    <div className="app-shell">
      <DevTooltips />
      <main>
        <CameraPanel
          crop={crop}
          mainFeed={mainFeed}
          presets={presets}
          activePresetId={activePresetId}
          onCropChange={handleCropChange}
          onMainFeedChange={setMainFeed}
          onPresetRecall={handlePresetRecall}
          onPresetSave={handlePresetSave}
        />

        <div className="lower-deck">
          <StreamingControls
            crop={crop}
            media={media}
            layouts={layoutPresets}
            activeLayout={activeLayout}
            isStreaming={isStreaming}
            isRecording={isRecording}
            onLayoutChange={setActiveLayout}
            onStreamingChange={setIsStreaming}
            onRecordingChange={setIsRecording}
          />
          <MediaControls media={media} onMediaChange={setMedia} onPlaybackProgress={handlePlaybackProgress} />
        </div>
      </main>
    </div>
  );
}

export default App;
