import { Camera, Maximize2, MousePointer2 } from 'lucide-react';
import { useState } from 'react';
import { PtzControls } from './PtzControls';
import { PtzFrame, WideFrame } from './PreviewFrames';
import type { CropRect, FeedKind, PtzPreset } from '../types';

type CameraPanelProps = {
  crop: CropRect;
  mainFeed: FeedKind;
  presets: PtzPreset[];
  activePresetId: string | null;
  onCropChange: (crop: CropRect, presetId?: string | null) => void;
  onMainFeedChange: (feed: FeedKind) => void;
  onPresetRecall: (preset: PtzPreset) => void;
};

type Point = {
  x: number;
  y: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeCrop = (crop: CropRect): CropRect => ({
  x: clamp(crop.x, 0, 100 - crop.width),
  y: clamp(crop.y, 0, 100 - crop.height),
  width: clamp(crop.width, 10, 96),
  height: clamp(crop.height, 10, 96)
});

const centerCropAt = (crop: CropRect, point: Point): CropRect =>
  normalizeCrop({
    ...crop,
    x: point.x - crop.width / 2,
    y: point.y - crop.height / 2
  });

const cropFromSelection = (a: Point, b: Point): CropRect => {
  const aspect = 16 / 9;
  let x = Math.min(a.x, b.x);
  let y = Math.min(a.y, b.y);
  let width = Math.max(Math.abs(a.x - b.x), 8);
  let height = Math.max(Math.abs(a.y - b.y), 8);

  if (width / height < aspect) {
    const nextWidth = height * aspect;
    x -= (nextWidth - width) / 2;
    width = nextWidth;
  } else {
    const nextHeight = width / aspect;
    y -= (nextHeight - height) / 2;
    height = nextHeight;
  }

  width = Math.min(width * 1.06, 96);
  height = Math.min(height * 1.06, 96);

  return normalizeCrop({
    x: x - (width - Math.abs(a.x - b.x)) / 2,
    y: y - (height - Math.abs(a.y - b.y)) / 2,
    width,
    height
  });
};

export function CameraPanel({
  crop,
  mainFeed,
  presets,
  activePresetId,
  onCropChange,
  onMainFeedChange,
  onPresetRecall
}: CameraPanelProps) {
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);

  const pipFeed: FeedKind = mainFeed === 'wide' ? 'ptz' : 'wide';

  const viewPointFromEvent = (event: React.PointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
    };
  };

  const imagePointFromViewPoint = (point: Point): Point => {
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
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    setDragCurrent(point);
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
      <div className="camera-view glass-card">
        <div className="camera-header">
          <div>
            <span className="eyebrow">Preview</span>
            <h1>{mainFeed === 'wide' ? 'Wide-Angle Viewfinder' : 'PTZ Program Camera'}</h1>
          </div>
          <div className="camera-hints">
            <span>
              <MousePointer2 size={15} />
              Click to center
            </span>
            <span>
              <Maximize2 size={15} />
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
          {mainFeed === 'wide' ? <WideFrame /> : <PtzFrame crop={crop} />}
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
            {pipFeed === 'wide' ? <WideFrame downsampled /> : <PtzFrame crop={crop} downsampled />}
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
        presets={presets}
        activePresetId={activePresetId}
        onCropChange={(nextCrop) => onCropChange(nextCrop, null)}
        onPresetRecall={onPresetRecall}
      />
    </section>
  );
}
