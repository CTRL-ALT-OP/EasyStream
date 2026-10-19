import { useCallback, useState } from 'react';
import { CameraPanel } from './components/CameraPanel';
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

function App() {
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

  const handleCropChange = (nextCrop: CropRect, presetId: string | null = null) => {
    setCrop(nextCrop);
    setActivePresetId(presetId);
  };

  const handlePresetRecall = (preset: PtzPreset) => {
    setCrop(preset.crop);
    setActivePresetId(preset.id);
  };

  return (
    <div className="app-shell">
      <main>
        <CameraPanel
          crop={crop}
          mainFeed={mainFeed}
          presets={ptzPresets}
          activePresetId={activePresetId}
          onCropChange={handleCropChange}
          onMainFeedChange={setMainFeed}
          onPresetRecall={handlePresetRecall}
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
