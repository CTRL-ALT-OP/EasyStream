import { Camera, Maximize2, MousePointer2 } from 'lucide-react';
import { useState } from 'react';
import { centerCropAt, cropFromSelection, type CropPoint } from '../lib/crop';
import { PtzControls } from './PtzControls';
import { PtzFrame, WideFrame } from './PreviewFrames';
import type { CameraLook, CropRect, FeedKind, LightingPreset, PtzPreset } from '../types';

type CameraPanelProps = {
  crop: CropRect;
  cameraLook: CameraLook;
  panZoomSpeed: number;
  mainFeed: FeedKind;
  presets: PtzPreset[];
  lightingPresets: LightingPreset[];
  activePresetId: string | null;
  activeLightingPresetId: string | null;
  onCropChange: (crop: CropRect, presetId?: string | null) => void;
  onCameraLookChange: (look: CameraLook) => void;
  onPanZoomSpeedChange: (speed: number) => void;
  onMainFeedChange: (feed: FeedKind) => void;
  onPresetRecall: (preset: PtzPreset) => void;
  onPresetSave: (presetId: string) => void;
  onLightingPresetRecall: (preset: LightingPreset) => void;
  onLightingPresetSave: (presetId: string) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function CameraPanel({
  crop,
  cameraLook,
  panZoomSpeed,
  mainFeed,
  presets,
  lightingPresets,
  activePresetId,
  activeLightingPresetId,
  onCropChange,
  onCameraLookChange,
  onPanZoomSpeedChange,
  onMainFeedChange,
  onPresetRecall,
  onPresetSave,
  onLightingPresetRecall,
  onLightingPresetSave
}: CameraPanelProps) {
  const [dragStart, setDragStart] = useState<CropPoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<CropPoint | null>(null);

  const pipFeed: FeedKind = mainFeed === 'wide' ? 'ptz' : 'wide';

  const viewPointFromEvent = (event: React.PointerEvent<HTMLDivElement>): CropPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
    };
  };

  const imagePointFromViewPoint = (point: CropPoint): CropPoint => {
    if (mainFeed === 'wide') {
      return point;
    }

    return {
      x: crop.x + (point.x / 100) * crop.width,
      y: crop.y + (point.y / 100) * crop.height
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = viewPointFromEvent(event);
    setDragStart(point);
    setDragCurrent(point);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The drag still tracks move events when capture is unavailable.
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) {
      return;
    }
    setDragCurrent(viewPointFromEvent(event));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) {
      return;
    }

    const end = viewPointFromEvent(event);
    const distance = Math.hypot(end.x - dragStart.x, end.y - dragStart.y);

    if (distance < 2.4) {
      onCropChange(centerCropAt(crop, imagePointFromViewPoint(end)), null);
    } else {
      onCropChange(cropFromSelection(imagePointFromViewPoint(dragStart), imagePointFromViewPoint(end)), null);
    }

    setDragStart(null);
    setDragCurrent(null);
  };

  const selectionStyle =
    dragStart && dragCurrent
      ? {
          left: `${Math.min(dragStart.x, dragCurrent.x)}%`,
          top: `${Math.min(dragStart.y, dragCurrent.y)}%`,
          width: `${Math.abs(dragStart.x - dragCurrent.x)}%`,
          height: `${Math.abs(dragStart.y - dragCurrent.y)}%`
        }
      : undefined;

  return (
    <section className="camera-section">
      <div className="camera-view" data-devtip="preview">
        <div className="camera-header">
          <h1>{mainFeed === 'wide' ? 'Preview' : 'PTZ'}</h1>
          <div className="camera-hints">
            <span>
              <MousePointer2 size={13} />
              Click to center
            </span>
            <span>
              <Maximize2 size={13} />
              Drag to frame
            </span>
          </div>
        </div>
        <div
          className={`main-feed ${mainFeed}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            setDragStart(null);
            setDragCurrent(null);
          }}
        >
          {mainFeed === 'wide' ? <WideFrame /> : <PtzFrame crop={crop} look={cameraLook} />}
            <div
              className="pip-feed"
              role="button"
              tabIndex={0}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onMainFeedChange(pipFeed);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onMainFeedChange(pipFeed);
                }
              }}
            >
              <div className="pip-label">
                <Camera size={14} />
                {pipFeed === 'wide' ? 'Wide' : 'PTZ'}
              </div>
              {pipFeed === 'wide' ? <WideFrame downsampled /> : <PtzFrame crop={crop} look={cameraLook} downsampled />}
            </div>

            {mainFeed === 'wide' && (
              <div
                className="ptz-outline"
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.width}%`,
                  height: `${crop.height}%`
                }}
              />
            )}

            {selectionStyle && <div className="selection-rect" style={selectionStyle} />}
        </div>
      </div>

      <PtzControls
        crop={crop}
        look={cameraLook}
        speed={panZoomSpeed}
        presets={presets}
        lightingPresets={lightingPresets}
        activePresetId={activePresetId}
        activeLightingPresetId={activeLightingPresetId}
        onCropChange={(nextCrop) => onCropChange(nextCrop, null)}
        onLookChange={onCameraLookChange}
        onSpeedChange={onPanZoomSpeedChange}
        onPresetRecall={onPresetRecall}
        onPresetSave={onPresetSave}
        onLightingPresetRecall={onLightingPresetRecall}
        onLightingPresetSave={onLightingPresetSave}
      />
    </section>
  );
}
