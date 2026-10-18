import { demoAssets } from '../demo/assets';
import type { CropRect, MediaState } from '../types';

type PtzFrameProps = {
  crop: CropRect;
  className?: string;
  portrait?: boolean;
  downsampled?: boolean;
};

type MediaFrameProps = {
  media: MediaState;
  className?: string;
  downsampled?: boolean;
  showVideoMotion?: boolean;
};

export function PtzFrame({ crop, className = '', portrait = false, downsampled = false }: PtzFrameProps) {
  return (
    <div className={`frame ptz-frame ${portrait ? 'portrait-frame' : ''} ${downsampled ? 'downsampled' : ''} ${className}`}>
      <img
        src={demoAssets.auditorium}
        alt="Simulated PTZ crop"
        style={{
          width: `${10000 / crop.width}%`,
          height: `${10000 / crop.height}%`,
          left: `-${(crop.x * 100) / crop.width}%`,
          top: `-${(crop.y * 100) / crop.height}%`
        }}
        draggable={false}
      />
      <div className="ptz-lens-vignette" />
    </div>
  );
}

export function WideFrame({ className = '', downsampled = false }: { className?: string; downsampled?: boolean }) {
  return (
    <div className={`frame wide-frame ${downsampled ? 'downsampled' : ''} ${className}`}>
      <img src={demoAssets.auditorium} alt="Simulated wide-angle auditorium feed" draggable={false} />
      <div className="wide-grid" />
    </div>
  );
}

export function MediaFrame({ media, className = '', downsampled = false, showVideoMotion = true }: MediaFrameProps) {
  const slide = demoAssets.slides[media.slideIndex % demoAssets.slides.length];

  if (media.mode === 'video') {
    return (
      <div className={`frame media-frame video-frame ${downsampled ? 'downsampled' : ''} ${className}`}>
        <video src={demoAssets.video} muted loop playsInline autoPlay={showVideoMotion && media.isPlaying} />
        <div className="video-fallback">
          <span>LIVE MEDIA</span>
          <strong>{Math.round(media.progress)}%</strong>
        </div>
      </div>
    );
  }

  return (
    <div className={`frame media-frame slide-frame ${downsampled ? 'downsampled' : ''} ${className}`}>
      <img src={slide} alt={`Mock presentation slide ${media.slideIndex + 1}`} draggable={false} />
    </div>
  );
}
