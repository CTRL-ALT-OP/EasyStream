import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Pause, Play, Presentation, Video } from 'lucide-react';
import { MediaFrame } from './PreviewFrames';
import { demoSlides } from '../sources';
import { chooseMedia, setPlaybackProgress, stepSlide, toggleMediaPlayback, useSession } from '../lib/session';
import type { MediaMode } from '../types';

const pickerMenuWidth = 280;
const pickerMenuHeight = 84;

function formatClock(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const remaining = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

function TransportClock() {
  const progress = useSession((current) => current.playbackProgress);
  const duration = useSession((current) => current.playbackDuration);
  const displayDuration = duration || 135;

  return (
    <div className="transport-controls">
      <button className="round-button" onClick={toggleMediaPlayback}>
        <PlayStateIcon />
      </button>
      <div className="seek-area">
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={(event) => setPlaybackProgress(Number(event.currentTarget.value))}
        />
        <div className="time-row">
          <span>{formatClock((progress / 100) * displayDuration)}</span>
          <span>{formatClock(displayDuration)}</span>
        </div>
      </div>
    </div>
  );
}

function PlayStateIcon() {
  const isPlaying = useSession((current) => current.media.isPlaying);
  return isPlaying ? <Pause size={20} /> : <Play size={20} />;
}

export function MediaControls() {
  const media = useSession((current) => current.media);
  const [pickerAlign, setPickerAlign] = useState<'left' | 'right'>('right');
  const [pickerPlace, setPickerPlace] = useState<'down' | 'up'>('down');
  const pickerRef = useRef<HTMLDivElement>(null);
  const currentSlide = media.slideIndex + 1;
  const slideCount = demoSlides.length;

  const updatePickerPlacement = useCallback(() => {
    const picker = pickerRef.current;
    if (!picker) {
      return;
    }

    const rect = picker.getBoundingClientRect();
    const cell = picker.closest('.dock-cell');
    const bounds = cell instanceof HTMLElement ? cell.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
    const spaceBelow = bounds.bottom - rect.bottom;
    const spaceAbove = rect.top - bounds.top;
    setPickerPlace(spaceBelow < pickerMenuHeight && spaceAbove > spaceBelow ? 'up' : 'down');
    setPickerAlign(rect.right - bounds.left < pickerMenuWidth ? 'left' : 'right');
  }, []);

  useLayoutEffect(() => {
    const picker = pickerRef.current;
    if (!picker) {
      return;
    }

    const cell = picker.closest('.dock-cell') ?? picker;
    updatePickerPlacement();
    const observer = new ResizeObserver(updatePickerPlacement);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [updatePickerPlacement]);

  const choose = (mode: MediaMode) => chooseMedia(mode);

  return (
    <section className="media-panel" data-devtip="media">
      <div className="panel-heading">
        <h2>Media</h2>
        <div
          className={`media-picker align-${pickerAlign} place-${pickerPlace}`}
          ref={pickerRef}
          onPointerEnter={updatePickerPlacement}
          onFocusCapture={updatePickerPlacement}
        >
          <button className="action-button compact">
            <FolderOpen size={17} />
            Open File
          </button>
          <div className="picker-menu">
            <button onClick={() => choose('slides')}>
              <Presentation size={16} />
              EasyStream pitch deck.pptx
            </button>
            <button onClick={() => choose('video')}>
              <Video size={16} />
              event-opener-demo.mp4
            </button>
          </div>
        </div>
      </div>

      <div className="media-stage">
        <div className="media-preview-slot">
          <div className="media-preview-shell">
            <MediaFrame mode={media.mode} slideIndex={media.slideIndex} />
            <div className="media-overlay">
              <span>{media.mode === 'video' ? 'Video file' : 'PowerPoint file'}</span>
              <strong>{media.mode === 'video' ? 'event-opener-demo.mp4' : 'EasyStream pitch deck.pptx'}</strong>
            </div>
          </div>
        </div>

        {media.mode === 'video' ? (
          <TransportClock />
        ) : (
          <div className="slide-controls">
            <button className="action-button" onClick={() => stepSlide(-1, slideCount)}>
              <ChevronLeft size={18} />
              Previous
            </button>
            <div className="slide-counter">
              <span>Slide</span>
              <strong>
                {currentSlide} / {slideCount}
              </strong>
            </div>
            <button className="action-button" onClick={() => stepSlide(1, slideCount)}>
              Next
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
