import { ChevronLeft, ChevronRight, FolderOpen, Pause, Play, Presentation, Video } from 'lucide-react';
import { MediaFrame } from './PreviewFrames';
import { demoAssets } from '../demo/assets';
import type { MediaMode, MediaState } from '../types';

type MediaControlsProps = {
  media: MediaState;
  onMediaChange: (media: MediaState) => void;
};

const videoDuration = '02:15';

export function MediaControls({ media, onMediaChange }: MediaControlsProps) {
  const currentSlide = media.slideIndex + 1;
  const slideCount = demoAssets.slides.length;

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
    <section className="media-panel glass-card">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Media Source</span>
          <h2>{media.mode === 'video' ? 'Mock Video Playback' : 'Mock Slideshow'}</h2>
        </div>
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

      <div className="media-preview-shell">
        <MediaFrame media={media} />
        <div className="media-overlay">
          <span>{media.mode === 'video' ? 'Video file' : 'PowerPoint file'}</span>
          <strong>{media.mode === 'video' ? 'event-opener-demo.mp4' : 'EasyStream pitch deck.pptx'}</strong>
        </div>
      </div>

      {media.mode === 'video' ? (
        <div className="transport-controls">
          <button className="round-button" onClick={() => onMediaChange({ ...media, isPlaying: !media.isPlaying })}>
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
              <span>{formatProgress(media.progress)}</span>
              <span>{videoDuration}</span>
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
    </section>
  );
}

function formatProgress(progress: number) {
  const totalSeconds = Math.round((progress / 100) * 135);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
