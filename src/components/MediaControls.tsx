import { useState } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Pause, Play, Presentation, Video } from 'lucide-react';
import { MediaFrame } from './PreviewFrames';
import { demoAssets } from '../demo/assets';
import type { MediaMode, MediaState } from '../types';

type MediaControlsProps = {
  media: MediaState;
  onMediaChange: (media: MediaState) => void;
  onPlaybackProgress: (progress: number) => void;
};

const fallbackDuration = 135;

export function MediaControls({ media, onMediaChange, onPlaybackProgress }: MediaControlsProps) {
  const [duration, setDuration] = useState(fallbackDuration);
  const currentSlide = media.slideIndex + 1;
  const slideCount = demoAssets.slides.length;

  const togglePlayback = () => {
    const atEnd = media.progress >= 99.5;
    onMediaChange({
      ...media,
      isPlaying: !media.isPlaying,
      progress: !media.isPlaying && atEnd ? 0 : media.progress
    });
  };

  const chooseMedia = (mode: MediaMode) => {
    onMediaChange({
      mode,
      isPlaying: mode === 'video',
      progress: mode === 'video' ? 8 : 0,
      slideIndex: mode === 'slides' ? 0 : media.slideIndex
    });
  };

  const nextSlide = (direction: 1 | -1) => {
    onMediaChange({
      ...media,
      slideIndex: (media.slideIndex + direction + slideCount) % slideCount
    });
  };

  return (
    <section className="media-panel glass-card" data-devtip="media">
      <div className="panel-heading">
        <h2>Media</h2>
        <div className="media-picker">
          <button className="action-button compact">
            <FolderOpen size={17} />
            Open File
          </button>
          <div className="picker-menu">
            <button onClick={() => chooseMedia('slides')}>
              <Presentation size={16} />
              EasyStream pitch deck.pptx
            </button>
            <button onClick={() => chooseMedia('video')}>
              <Video size={16} />
              event-opener-demo.mp4
            </button>
          </div>
        </div>
      </div>

      <div className="media-stage">
        <div className="media-preview-shell">
          <MediaFrame media={media} onPlaybackProgress={onPlaybackProgress} onDuration={setDuration} />
          <div className="media-overlay">
            <span>{media.mode === 'video' ? 'Video file' : 'PowerPoint file'}</span>
            <strong>{media.mode === 'video' ? 'event-opener-demo.mp4' : 'EasyStream pitch deck.pptx'}</strong>
          </div>
        </div>

        {media.mode === 'video' ? (
        <div className="transport-controls">
          <button className="round-button" onClick={togglePlayback}>
            {media.isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <div className="seek-area">
            <input
              type="range"
              min="0"
              max="100"
              value={media.progress}
              onChange={(event) => onMediaChange({ ...media, progress: Number(event.currentTarget.value) })}
            />
            <div className="time-row">
              <span>{formatClock((media.progress / 100) * duration)}</span>
              <span>{formatClock(duration)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="slide-controls">
          <button className="action-button" onClick={() => nextSlide(-1)}>
            <ChevronLeft size={18} />
            Previous
          </button>
          <div className="slide-counter">
            <span>Slide</span>
            <strong>
              {currentSlide} / {slideCount}
            </strong>
          </div>
          <button className="action-button" onClick={() => nextSlide(1)}>
            Next
            <ChevronRight size={18} />
          </button>
        </div>
        )}
      </div>
    </section>
  );
}

function formatClock(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const remaining = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}
