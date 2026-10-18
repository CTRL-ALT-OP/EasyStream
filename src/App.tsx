import { useEffect, useMemo, useState } from 'react';
import { Activity, Aperture, Clapperboard, RadioTower } from 'lucide-react';
import { CameraPanel } from './components/CameraPanel';
import { MediaControls } from './components/MediaControls';
import { StreamingControls } from './components/StreamingControls';
import { defaultCrop, layoutPresets, ptzPresets } from './demo/presets';
import type { CropRect, FeedKind, LayoutPresetId, MediaState, PtzPreset } from './types';

const initialMediaState: MediaState = {
  mode: 'slides',
  isPlaying: false,
  progress: 0,
  slideIndex: 0
};

function App() {
  const [crop, setCrop] = useState<CropRect>(defaultCrop);
  const [mainFeed, setMainFeed] = useState<FeedKind>('wide');
  const [activePresetId, setActivePresetId] = useState<string | null>('stage-wide');
  const [activeLayout, setActiveLayout] = useState<LayoutPresetId>('media-portrait-right');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [media, setMedia] = useState<MediaState>(initialMediaState);

  useEffect(() => {
    if (media.mode !== 'video' || !media.isPlaying) {
      return;
    }

    const interval = window.setInterval(() => {
      setMedia((current) => ({
        ...current,
        progress: current.mode === 'video' ? (current.progress + 0.65) % 100 : current.progress
      }));
    }, 600);

    return () => window.clearInterval(interval);
  }, [media.mode, media.isPlaying]);

  const statusItems = useMemo(
    () => [
      { icon: Aperture, label: 'PTZ', value: `${Math.round(10000 / crop.width)}% zoom` },
      { icon: Clapperboard, label: 'Media', value: media.mode === 'video' ? 'Video loaded' : `Slide ${media.slideIndex + 1}` },
      { icon: RadioTower, label: 'Stream', value: isStreaming ? 'Live output' : 'Ready' },
      { icon: Activity, label: 'Record', value: isRecording ? 'Recording' : 'Armed' }
    ],
    [crop.width, isRecording, isStreaming, media.mode, media.slideIndex]
  );

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
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">ES</div>
          <div>
            <span className="eyebrow">Integrated Production Control</span>
            <h1>EasyStream</h1>
          </div>
        </div>
        <div className="header-status">
          {statusItems.map((item) => (
            <div className="status-chip" key={item.label}>
              <item.icon size={16} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </header>

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
          <MediaControls media={media} onMediaChange={setMedia} />
        </div>
      </main>
    </div>
  );
}

export default App;
