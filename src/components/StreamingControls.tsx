import { Radio, Settings, Square, Video } from 'lucide-react';
import { useState } from 'react';
import { MediaFrame, PtzFrame } from './PreviewFrames';
import type { CropRect, LayoutPreset, LayoutPresetId, MediaState } from '../types';

type StreamingControlsProps = {
  crop: CropRect;
  media: MediaState;
  layouts: LayoutPreset[];
  activeLayout: LayoutPresetId;
  isStreaming: boolean;
  isRecording: boolean;
  onLayoutChange: (layout: LayoutPresetId) => void;
  onStreamingChange: (isStreaming: boolean) => void;
  onRecordingChange: (isRecording: boolean) => void;
};

function LayoutComposite({ layout, crop, media }: { layout: LayoutPreset; crop: CropRect; media: MediaState }) {
  if (layout.id === 'ptz-full') {
    return <PtzFrame crop={crop} downsampled />;
  }

  if (layout.id === 'media-full') {
    return <MediaFrame media={media} downsampled />;
  }

  return (
    <div className={`composite-layout ${layout.id}`}>
      <MediaFrame media={media} downsampled />
      <PtzFrame crop={crop} portrait downsampled />
    </div>
  );
}

export function StreamingControls({
  crop,
  media,
  layouts,
  activeLayout,
  isStreaming,
  isRecording,
  onLayoutChange,
  onStreamingChange,
  onRecordingChange
}: StreamingControlsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeLayoutMeta = layouts.find((layout) => layout.id === activeLayout) ?? layouts[0];

  return (
    <section className="streaming-panel glass-card">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Program</span>
          <h2>Streaming Layouts</h2>
        </div>
        <span className={`status-pill ${isStreaming ? 'live' : ''}`}>{isStreaming ? 'Live' : 'Standby'}</span>
      </div>

      <div className="streaming-content">
        <div className="layout-grid">
          {layouts.map((layout) => (
            <button
              className={`layout-card ${activeLayout === layout.id ? 'active' : ''}`}
              key={layout.id}
              onClick={() => onLayoutChange(layout.id)}
            >
              <div className="layout-preview">
                <LayoutComposite layout={layout} crop={crop} media={media} />
                <span className="downsample-badge">downsampled</span>
              </div>
              <span>{layout.label}</span>
              <small>{layout.description}</small>
            </button>
          ))}
        </div>

        <div className="stream-actions">
          <div className="output-preview">
            <div className="output-topline">
              <span>Selected Output</span>
              <strong>{activeLayoutMeta.label}</strong>
            </div>
            <LayoutComposite layout={activeLayoutMeta} crop={crop} media={media} />
          </div>

          <button className={`action-button primary ${isStreaming ? 'danger' : ''}`} onClick={() => onStreamingChange(!isStreaming)}>
            <Radio size={18} />
            {isStreaming ? 'Stop Streaming' : 'Start Streaming'}
          </button>
          <button className={`action-button ${isRecording ? 'recording' : ''}`} onClick={() => onRecordingChange(!isRecording)}>
            {isRecording ? <Square size={18} /> : <Video size={18} />}
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
          <button className="action-button" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} />
            Stream Settings
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Mock Destination</span>
                <h2>Stream Settings</h2>
              </div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
            </div>
            <div className="settings-grid">
              <label>
                Destination
                <input value="EasyStream Demo Channel" readOnly />
              </label>
              <label>
                Resolution
                <input value="1920 x 1080 @ 30fps" readOnly />
              </label>
              <label>
                Bitrate
                <input value="6 Mbps adaptive" readOnly />
              </label>
              <label>
                Audio
                <input value="Program Mix - simulated" readOnly />
              </label>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
