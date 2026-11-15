import { Camera, Maximize2, MousePointer2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { frameSelection, isFramingDrag, profileIsCurrent, projectPose, scaleRect } from '../../shared/aim';
import { viewRectFromSource, sourcePointFromView } from '../../shared/view';
import { aimWidePoint, frameWideRect, useCamera, getCameraState } from '../lib/cameras';
import { setMainFeed, useSession } from '../lib/session';
import { PtzFrame, WideFrame } from './PreviewFrames';
import type { FeedKind } from '../types';

type Point = { x: number; y: number };

export function CameraPreview() {
  const mainFeed = useSession((current) => current.mainFeed);
  const look = useSession((current) => current.cameraLook);
  const pose = useCamera((current) => current.pose);
  const calibration = useCamera((current) => current.calibration);
  const config = useCamera((current) => current.config);
  const wide = useCamera((current) => current.wide);
  const notice = useCamera((current) => current.notice);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);
  const [outline, setOutline] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pipFeed: FeedKind = mainFeed === 'wide' ? 'ptz' : 'wide';

  useEffect(() => {
    const node = stageRef.current;
    if (!node || mainFeed !== 'wide' || !pose || !wide || !profileIsCurrent(calibration, config)) {
      setOutline(null);
      return;
    }

    const updateOutline = () => {
      const projected = projectPose(calibration!, pose.pan, pose.tilt, pose.zoom);
      if (!projected) {
        setOutline(null);
        return;
      }
      const previewRect = scaleRect(projected, calibration!.wideWidth, calibration!.wideHeight, wide.width, wide.height);
      setOutline(viewRectFromSource(previewRect, node.clientWidth, node.clientHeight, wide.width, wide.height));
    };

    updateOutline();
    const observer = new ResizeObserver(updateOutline);
    observer.observe(node);
    return () => observer.disconnect();
  }, [calibration, config, mainFeed, pose, wide]);

  const viewPoint = (event: React.PointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mainFeed !== 'wide') {
      return;
    }
    const point = viewPoint(event);
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
    setDragCurrent(viewPoint(event));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart || mainFeed !== 'wide') {
      setDragStart(null);
      setDragCurrent(null);
      return;
    }

    const end = viewPoint(event);
    const rect = event.currentTarget.getBoundingClientRect();
    const distance = Math.hypot(((end.x - dragStart.x) / rect.width) * 100, ((end.y - dragStart.y) / rect.height) * 100);
    if (wide) {
      const ptz = getCameraState().ptz;
      const aspect = ptz && ptz.height > 0 ? ptz.width / ptz.height : 16 / 9;
      const start = sourcePointFromView(dragStart.x, dragStart.y, rect.width, rect.height, wide.width, wide.height);
      const finish = sourcePointFromView(end.x, end.y, rect.width, rect.height, wide.width, wide.height);
      if (!isFramingDrag(distance)) {
        void aimWidePoint(finish, wide.width, wide.height);
      } else {
        void frameWideRect(frameSelection(start, finish, wide.width, wide.height, aspect), wide.width, wide.height);
      }
    }

    setDragStart(null);
    setDragCurrent(null);
  };

  const selectionStyle =
    dragStart && dragCurrent
      ? {
          left: Math.min(dragStart.x, dragCurrent.x),
          top: Math.min(dragStart.y, dragCurrent.y),
          width: Math.abs(dragStart.x - dragCurrent.x),
          height: Math.abs(dragStart.y - dragCurrent.y)
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
          {notice ? <span className="is-warning">{notice}</span> : null}
        </div>
      </div>
      <div className="preview-stage">
        <div
          className={`main-feed ${mainFeed}`}
          ref={stageRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            setDragStart(null);
            setDragCurrent(null);
          }}
        >
          {mainFeed === 'wide' ? <WideFrame /> : <PtzFrame look={look} />}
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
            {pipFeed === 'wide' ? <WideFrame compact /> : <PtzFrame look={look} compact />}
          </div>

          {outline ? <div className="ptz-outline" style={outline} /> : null}
          {selectionStyle ? <div className="selection-rect" style={selectionStyle} /> : null}
        </div>
      </div>
    </section>
  );
}
