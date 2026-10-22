import { useEffect, useRef, type CSSProperties } from 'react';
import { demoAssets } from '../demo/assets';
import { fitCrop, portraitWindow, TIGHT_PORTRAIT_SCALE } from '../lib/crop';
import type { CameraLook, CropRect, MediaState } from '../types';

type PtzFrameProps = {
  crop: CropRect;
  look?: CameraLook;
  className?: string;
  portrait?: boolean;
  tight?: boolean;
  downsampled?: boolean;
};

type MediaFrameProps = {
  media: MediaState;
  className?: string;
  downsampled?: boolean;
  onPlaybackProgress?: (progress: number) => void;
  onDuration?: (duration: number) => void;
};

export function PtzFrame({ crop, look, className = '', portrait = false, tight = false, downsampled = false }: PtzFrameProps) {
  const frame = portrait ? portraitWindow(crop, tight ? TIGHT_PORTRAIT_SCALE : 1) : fitCrop(crop);
  const scaleX = 100 / frame.width;
  const scaleY = portrait ? 100 / frame.height : scaleX;
  const warmth = look?.warmth ?? 0;
  const tintOpacity = Math.min(Math.abs(warmth) / 100, 0.32);
  const imageStyle: CSSProperties = {
    width: `${scaleX * 100}%`,
    height: `${scaleY * 100}%`,
    left: `${-frame.x * scaleX}%`,
    top: `${-frame.y * scaleY}%`,
    filter: look ? `brightness(${look.brightness}%) contrast(${look.contrast}%) saturate(${look.saturation}%)` : undefined
  };
  const tintStyle: CSSProperties = {
    background: warmth >= 0 ? 'rgb(255, 168, 72)' : 'rgb(76, 148, 255)',
    opacity: tintOpacity
  };

  return (
    <div className={`frame ptz-frame ${portrait ? 'portrait-frame' : ''} ${downsampled ? 'downsampled' : ''} ${className}`}>
      <img
        src={demoAssets.auditorium}
        alt="Simulated PTZ crop"
        style={imageStyle}
        draggable={false}
      />
      <div className="ptz-lighting-tint" style={tintStyle} />
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

export function MediaFrame({ media, className = '', downsampled = false, onPlaybackProgress, onDuration }: MediaFrameProps) {
  const slide = demoAssets.slides[media.slideIndex % demoAssets.slides.length];
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekLock = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || media.mode !== 'video') {
      return;
    }

    const seek = () => {
      if (!Number.isFinite(video.duration) || video.duration === 0) {
        return;
      }

      const target = (media.progress / 100) * video.duration;
      if (Math.abs(video.currentTime - target) > 0.08) {
        seekLock.current = target;
        video.currentTime = target;
      }
    };

    seek();
    video.addEventListener('loadedmetadata', seek);
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [media.mode, media.progress]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || media.mode !== 'video') {
      return;
    }

    if (media.isPlaying) {
      void video.play().catch(() => undefined);
      return;
    }

    video.pause();
  }, [media.isPlaying, media.mode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || media.mode !== 'video' || !onPlaybackProgress) {
      return;
    }

    const publishDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        onDuration?.(video.duration);
      }
    };

    const publishProgress = () => {
      if (video.paused || !video.duration) {
        return;
      }

      if (seekLock.current !== null) {
        if (Math.abs(video.currentTime - seekLock.current) > 0.25) {
          return;
        }

        seekLock.current = null;
      }

      onPlaybackProgress((video.currentTime / video.duration) * 100);
    };

    publishDuration();
    video.addEventListener('loadedmetadata', publishDuration);
    video.addEventListener('timeupdate', publishProgress);
    return () => {
      video.removeEventListener('loadedmetadata', publishDuration);
      video.removeEventListener('timeupdate', publishProgress);
    };
  }, [media.mode, onDuration, onPlaybackProgress]);

  if (media.mode === 'video') {
    return (
      <div className={`frame media-frame video-frame ${downsampled ? 'downsampled' : ''} ${className}`}>
        <video ref={videoRef} src={demoAssets.video} muted loop playsInline preload="auto" />
      </div>
    );
  }

  return (
    <div className={`frame media-frame slide-frame ${downsampled ? 'downsampled' : ''} ${className}`}>
      <img src={slide} alt={`Mock presentation slide ${media.slideIndex + 1}`} draggable={false} />
    </div>
  );
}
