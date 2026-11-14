import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cropTransform, fitCrop, portraitWindow, TIGHT_PORTRAIT_SCALE } from '../lib/crop';
import { loadDownsampledStill } from '../lib/stillCache';
import { getSessionState, setPlaybackDuration, setPlaybackProgress, subscribeSession } from '../lib/session';
import { attachVideo, drawVideoFrame, registerVideoSink, startVideoLoop, stopVideoLoop } from '../lib/videoFrames';
import { demoSlides, demoVideoSource, ptzCameraSource, wideCameraSource } from '../sources';
import type { CameraLook, CameraSource, CropRect, MediaMode } from '../types';

type PtzFrameProps = {
  crop: CropRect;
  look?: CameraLook;
  className?: string;
  portrait?: boolean;
  tight?: boolean;
  downsampled?: boolean;
};

type MediaFrameProps = {
  mode: MediaMode;
  slideIndex: number;
  className?: string;
  downsampled?: boolean;
};

const THUMBNAIL_WIDTH = 320;
let echoedProgress: number | null = null;

const publishPlaybackProgress = (progress: number) => {
  if (Object.is(getSessionState().playbackProgress, progress)) {
    return;
  }

  echoedProgress = progress;
  setPlaybackProgress(progress);
};

const isEchoedProgress = (progress: number) => {
  if (echoedProgress !== null && Math.abs(progress - echoedProgress) < 0.5) {
    echoedProgress = null;
    return true;
  }

  return false;
};

function StillPicture({ url, downsampled = false, alt, style }: { url: string; downsampled?: boolean; alt: string; style?: CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!downsampled) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    void loadDownsampledStill(url, THUMBNAIL_WIDTH)
      .then((bitmap) => {
        if (cancelled) {
          return;
        }

        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [downsampled, url]);

  if (!downsampled) {
    return <img src={url} alt={alt} style={style} draggable={false} />;
  }

  return <canvas ref={canvasRef} aria-label={alt} style={style} />;
}

function VideoSurface({ downsampled = false }: { downsampled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    return registerVideoSink(canvas, downsampled ? THUMBNAIL_WIDTH : 960);
  }, [downsampled]);

  return <canvas ref={canvasRef} aria-label="Video frame" />;
}

function SourcePicture({
  source,
  downsampled = false,
  alt,
  style
}: {
  source: CameraSource;
  downsampled?: boolean;
  alt: string;
  style?: CSSProperties;
}) {
  if (source.kind === 'still') {
    return <StillPicture url={source.url} downsampled={downsampled} alt={alt} style={style} />;
  }

  if (source.kind === 'video') {
    return <VideoSurface downsampled={downsampled} />;
  }

  return null;
}

export function FeedProjectionProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    attachVideo(video);

    const publishDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setPlaybackDuration(video.duration);
      }
    };

    const publishTime = () => {
      if (video.paused || !video.duration) {
        return;
      }

      publishPlaybackProgress((video.currentTime / video.duration) * 100);
    };

    const draw = () => drawVideoFrame();
    const pause = () => {
      stopVideoLoop();
      drawVideoFrame();
    };

    publishDuration();
    video.addEventListener('loadedmetadata', publishDuration);
    video.addEventListener('loadeddata', draw);
    video.addEventListener('seeked', draw);
    video.addEventListener('timeupdate', publishTime);
    video.addEventListener('play', startVideoLoop);
    video.addEventListener('pause', pause);

    return () => {
      video.removeEventListener('loadedmetadata', publishDuration);
      video.removeEventListener('loadeddata', draw);
      video.removeEventListener('seeked', draw);
      video.removeEventListener('timeupdate', publishTime);
      video.removeEventListener('play', startVideoLoop);
      video.removeEventListener('pause', pause);
      stopVideoLoop();
      attachVideo(null);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    let seenMedia = getSessionState().media;
    let seenProgress = getSessionState().playbackProgress;

    return subscribeSession(() => {
      if (!video) {
        return;
      }

      const { media, playbackProgress } = getSessionState();
      if (media === seenMedia && playbackProgress === seenProgress) {
        return;
      }

      seenMedia = media;
      seenProgress = playbackProgress;

      if (media.mode !== 'video') {
        if (!video.paused) {
          video.pause();
        }
        stopVideoLoop();
        return;
      }

      if (media.isPlaying) {
        if (video.paused) {
          void video.play().catch(() => undefined);
        }
      } else if (!video.paused) {
        video.pause();
      }

      if (isEchoedProgress(playbackProgress) || !Number.isFinite(video.duration) || video.duration === 0) {
        return;
      }

      const target = (playbackProgress / 100) * video.duration;
      if (Math.abs(video.currentTime - target) > 0.08) {
        video.currentTime = target;
      }
    });
  }, []);

  const videoUrl = demoVideoSource.kind === 'video' ? demoVideoSource.url : undefined;

  return (
    <>
      {videoUrl && <video ref={videoRef} className="feed-video-owner" src={videoUrl} muted loop playsInline preload="auto" />}
      {children}
    </>
  );
}

export function PtzFrame({ crop, look, className = '', portrait = false, tight = false, downsampled = false }: PtzFrameProps) {
  const frame = portrait ? portraitWindow(crop, tight ? TIGHT_PORTRAIT_SCALE : 1) : fitCrop(crop);
  const warmth = look?.warmth ?? 0;
  const imageStyle: CSSProperties = {
    transform: cropTransform(frame),
    filter: look ? `brightness(${look.brightness}%) contrast(${look.contrast}%) saturate(${look.saturation}%)` : undefined
  };
  const tintStyle: CSSProperties = {
    background: warmth >= 0 ? 'rgb(255, 168, 72)' : 'rgb(76, 148, 255)',
    opacity: Math.min(Math.abs(warmth) / 100, 0.32)
  };

  return (
    <div className={`frame ptz-frame ${portrait ? 'portrait-frame' : ''} ${className}`}>
      <SourcePicture source={ptzCameraSource} downsampled={downsampled} alt="Simulated PTZ crop" style={imageStyle} />
      <div className="ptz-lighting-tint" style={tintStyle} />
      <div className="ptz-lens-vignette" />
    </div>
  );
}

export function WideFrame({ className = '', downsampled = false }: { className?: string; downsampled?: boolean }) {
  return (
    <div className={`frame wide-frame ${className}`}>
      <SourcePicture source={wideCameraSource} downsampled={downsampled} alt="Simulated wide-angle auditorium feed" />
      <div className="wide-grid" />
    </div>
  );
}

export function MediaFrame({ mode, slideIndex, className = '', downsampled = false }: MediaFrameProps) {
  if (mode === 'video') {
    return (
      <div className={`frame media-frame video-frame ${className}`}>
        <VideoSurface downsampled={downsampled} />
      </div>
    );
  }

  const slide = demoSlides[slideIndex % demoSlides.length];
  return (
    <div className={`frame media-frame slide-frame ${className}`}>
      <StillPicture url={slide} downsampled={downsampled} alt={`Mock presentation slide ${slideIndex + 1}`} />
    </div>
  );
}
