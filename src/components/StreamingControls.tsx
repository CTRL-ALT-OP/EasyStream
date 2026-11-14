import { Radio, Settings, Square, Video } from 'lucide-react';
import { memo, useState } from 'react';
import { layoutPresets } from '../demo/presets';
import { setActiveLayout, setRecording, setStreaming, useSession } from '../lib/session';
import type { LayoutPreset } from '../types';
import { MediaFrame, PtzFrame } from './PreviewFrames';

function MediaOnlyFrame({ preview = false }: { preview?: boolean }) {
  const media = useSession((current) => current.media);
  return <MediaFrame mode={media.mode} slideIndex={media.slideIndex} downsampled={preview} />;
}

const LayoutComposite = memo(function LayoutComposite({ layout, preview = false }: { layout: LayoutPreset; preview?: boolean }) {
  if (layout.id === 'media-full') {
    return <MediaOnlyFrame preview={preview} />;
  }

  return <CameraLayoutComposite layout={layout} preview={preview} />;
});

const CameraLayoutComposite = memo(function CameraLayoutComposite({ layout, preview = false }: { layout: LayoutPreset; preview?: boolean }) {
  const crop = useSession((current) => current.crop);
  const cameraLook = useSession((current) => current.cameraLook);
  const media = useSession((current) => current.media);
  if (layout.id === 'ptz-full') {
    return <PtzFrame crop={crop} look={cameraLook} downsampled={preview} />;
  }

  if (layout.id === 'media-camera-below' || layout.id === 'media-camera-above') {
    const cameraAbove = layout.id === 'media-camera-above';
    const mediaFrame = (
      <div className="composite-media">
        <MediaFrame mode={media.mode} slideIndex={media.slideIndex} downsampled={preview} />
      </div>
    );
    const cameraFrame = (
      <div className="stack-camera">
        <PtzFrame crop={crop} look={cameraLook} downsampled={preview} />
      </div>
    );

    return (
      <div className={`composite-layout stacked ${cameraAbove ? 'camera-first' : ''}`}>
        {cameraAbove ? cameraFrame : mediaFrame}
        {cameraAbove ? mediaFrame : cameraFrame}
      </div>
    );
  }

  return (
    <div className="composite-layout">
      <div className="composite-media">
        <MediaFrame mode={media.mode} slideIndex={media.slideIndex} downsampled={preview} />
      </div>
      <div className="portrait-slot">
        <PtzFrame crop={crop} look={cameraLook} portrait tight={layout.id === 'media-portrait-tight'} downsampled={preview} />
      </div>
    </div>
  );
});

export function StreamingControls() {
  const activeLayout = useSession((current) => current.activeLayout);
  const isStreaming = useSession((current) => current.isStreaming);
  const isRecording = useSession((current) => current.isRecording);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const layouts = layoutPresets;
  const activeLayoutMeta = layouts.find((layout) => layout.id === activeLayout) ?? layouts[0];

  return (
    <section className="streaming-panel" data-devtip="output">
      <div className="panel-heading">
        <h2>Output</h2>
        <span className={`status-pill ${isStreaming ? 'live' : ''}`}>{isStreaming ? 'Live' : 'Standby'}</span>
      </div>

      <div className="streaming-content">
        <div className="layout-grid">
          {layouts.map((layout) => (
            <button
              className={`layout-card ${activeLayout === layout.id ? 'active' : ''}`}
              key={layout.id}
              onClick={() => setActiveLayout(layout.id)}
            >
              <div className="layout-preview ratio-slot">
                <div className="ratio-16x9">
                  <LayoutComposite layout={layout} preview />
                </div>
              </div>
              <span className="layout-label">{layout.label}</span>
            </button>
          ))}
        </div>

        <div className="stream-actions">
          <div className="output-preview">
            <div className="output-topline">
              <span>Selected Output</span>
              <strong>{activeLayoutMeta.label}</strong>
            </div>
            <div className="ratio-slot">
              <div className="ratio-16x9">
                <LayoutComposite layout={activeLayoutMeta} />
              </div>
            </div>
          </div>

          <button className={`action-button primary ${isStreaming ? 'danger' : ''}`} onClick={() => setStreaming(!isStreaming)}>
            <Radio size={18} />
            {isStreaming ? 'Stop Streaming' : 'Start Streaming'}
          </button>
          <button className={`action-button ${isRecording ? 'recording' : ''}`} onClick={() => setRecording(!isRecording)}>
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
              <h2>Stream Settings</h2>
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
