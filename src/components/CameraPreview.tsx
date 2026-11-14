import { Camera, Maximize2, MousePointer2 } from 'lucide-react';
import { useState } from 'react';
import { centerCropAt, cropFromSelection, fitCrop, type CropPoint } from '../lib/crop';
import { getSessionState, setCrop, setMainFeed, useSession } from '../lib/session';
import { PtzFrame, WideFrame } from './PreviewFrames';
import type { FeedKind } from '../types';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function SubscribedPtzFrame({ downsampled = false }: { downsampled?: boolean }) {
  const crop = useSession((current) => current.crop);
  const look = useSession((current) => current.cameraLook);
  return <PtzFrame crop={crop} look={look} downsampled={downsampled} />;
}

function CropOutline() {
  const crop = useSession((current) => current.crop);
  const fitted = fitCrop(crop);
  const scaleX = fitted.width / 100;
  const scaleY = fitted.height / 100;
  const borderScale = (scaleX + scaleY) / 2 || 1;

  return (
    <div
      className="ptz-outline"
      style={{
        transform: `translate3d(${fitted.x}%, ${fitted.y}%, 0) scale(${scaleX}, ${scaleY})`,
        borderTopWidth: `${2 / scaleY}px`,
        borderRightWidth: `${2 / scaleX}px`,
        borderBottomWidth: `${2 / scaleY}px`,
        borderLeftWidth: `${2 / scaleX}px`,
        boxShadow: `0 0 0 ${999 / borderScale}px rgba(0, 0, 0, 0.28)`
      }}
    />
  );
}

export function CameraPreview() {
  const mainFeed = useSession((current) => current.mainFeed);
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

    const crop = getSessionState().crop;
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
      setCrop(centerCropAt(getSessionState().crop, imagePointFromViewPoint(end)));
    } else {
      setCrop(cropFromSelection(imagePointFromViewPoint(dragStart), imagePointFromViewPoint(end)));
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
    <section className="camera-view" data-devtip="preview">
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
      <div className="preview-stage">
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
          {mainFeed === 'wide' ? <WideFrame /> : <SubscribedPtzFrame />}
          <div
            className="pip-feed"
            role="button"
            tabIndex={0}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setMainFeed(pipFeed);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setMainFeed(pipFeed);
              }
            }}
          >
            <div className="pip-label">
              <Camera size={14} />
              {pipFeed === 'wide' ? 'Wide' : 'PTZ'}
            </div>
            {pipFeed === 'wide' ? <WideFrame downsampled /> : <SubscribedPtzFrame downsampled />}
          </div>

          {mainFeed === 'wide' && <CropOutline />}
          {selectionStyle && <div className="selection-rect" style={selectionStyle} />}
        </div>
      </div>
    </section>
  );
}
