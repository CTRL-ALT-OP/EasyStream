import { createContext, memo, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
};

type FeedProjectionProviderProps = {
  media: MediaState;
  onPlaybackProgress?: (progress: number) => void;
  children: ReactNode;
};

type MediaPlaybackValue = {
  videoFrameSrc: string | null;
  videoPreviewSrc: string | null;
  videoPosterSrc: string | null;
  duration: number;
};

type CachedProjection = {
  src?: string;
  promise?: Promise<string>;
  listeners: Set<() => void>;
};

const projectionCache = new Map<string, CachedProjection>();
const mediaPlaybackContext = createContext<MediaPlaybackValue>({
  videoFrameSrc: null,
  videoPreviewSrc: null,
  videoPosterSrc: null,
  duration: 0
});

const wideCameraSource = demoAssets.auditorium;
// Simulated separately so the eventual PTZ camera stream can replace this source without changing consumers.
const ptzCameraSource = demoAssets.auditorium;
const videoFrameWidth = 960;
const previewFrameWidth = 320;
const ptzPreviewHeight = 144;
const ptzPreviewWidth = Math.round((16 / 9) * ptzPreviewHeight);
const ptzPreviewPortraitWidth = Math.round((9 / 16) * ptzPreviewHeight);

const projectionKey = (parts: Array<string | number | boolean | undefined>) => parts.map((part) => String(part)).join('|');

function useCachedProjection(key: string, fallbackSrc: string, createProjection: () => Promise<string>, enabled = true) {
  const [, setVersion] = useState(0);
  const createRef = useRef(createProjection);
  createRef.current = createProjection;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let entry = projectionCache.get(key);
    if (!entry) {
      entry = { listeners: new Set() };
      projectionCache.set(key, entry);
    }

    const notify = () => setVersion((version) => version + 1);
    entry.listeners.add(notify);

    if (!entry.src && !entry.promise) {
      entry.promise = createRef
        .current()
        .then((src) => {
          entry!.src = src;
          entry!.promise = undefined;
          entry!.listeners.forEach((listener) => listener());
          return src;
        })
        .catch(() => {
          entry!.promise = undefined;
          return fallbackSrc;
        });
    }

    return () => {
      entry!.listeners.delete(notify);
    };
  }, [enabled, fallbackSrc, key]);

  return enabled ? projectionCache.get(key)?.src ?? fallbackSrc : fallbackSrc;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image projection source: ${src}`));
    image.src = src;
  });
}

function canvasToImage(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function renderDownsampledImage(src: string, maxWidth = previewFrameWidth) {
  const image = await loadImage(src);
  const width = Math.min(maxWidth, image.naturalWidth || maxWidth);
  const height = Math.max(1, Math.round(width / ((image.naturalWidth || 16) / (image.naturalHeight || 9))));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    return src;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToImage(canvas);
}

function captureVideoFrame(video: HTMLVideoElement) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return null;
  }

  const aspect = video.videoWidth / video.videoHeight;
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = Math.min(videoFrameWidth, video.videoWidth);
  fullCanvas.height = Math.max(1, Math.round(fullCanvas.width / aspect));
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = Math.min(previewFrameWidth, video.videoWidth);
  previewCanvas.height = Math.max(1, Math.round(previewCanvas.width / aspect));

  const fullContext = fullCanvas.getContext('2d');
  const previewContext = previewCanvas.getContext('2d');
  if (!fullContext || !previewContext) {
    return null;
  }

  fullContext.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
  previewContext.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);

  return {
    frame: canvasToImage(fullCanvas),
    preview: canvasToImage(previewCanvas)
  };
}

export function useMediaPlayback() {
  return useContext(mediaPlaybackContext);
}

export function FeedProjectionProvider({ media, onPlaybackProgress, children }: FeedProjectionProviderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastPublishedProgress = useRef<number | null>(null);
  const [videoFrameSrc, setVideoFrameSrc] = useState<string | null>(null);
  const [videoPreviewSrc, setVideoPreviewSrc] = useState<string | null>(null);
  const [videoPosterSrc, setVideoPosterSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (media.mode !== 'video') {
      setVideoFrameSrc(null);
      setVideoPreviewSrc(null);
      setVideoPosterSrc(null);
      setDuration(0);
      lastPublishedProgress.current = null;
    }
  }, [media.mode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || media.mode !== 'video') {
      return;
    }

    const seek = () => {
      if (!Number.isFinite(video.duration) || video.duration === 0) {
        return;
      }

      if (lastPublishedProgress.current !== null && Math.abs(media.progress - lastPublishedProgress.current) < 0.5) {
        lastPublishedProgress.current = null;
        return;
      }

      const target = (media.progress / 100) * video.duration;
      if (Math.abs(video.currentTime - target) > 0.08) {
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
    if (!video || media.mode !== 'video') {
      return;
    }

    const publishDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };

    const publishProgress = () => {
      if (video.paused || !video.duration) {
        return;
      }

      const progress = (video.currentTime / video.duration) * 100;
      lastPublishedProgress.current = progress;
      onPlaybackProgress?.(progress);
    };

    publishDuration();
    video.addEventListener('loadedmetadata', publishDuration);
    video.addEventListener('timeupdate', publishProgress);
    return () => {
      video.removeEventListener('loadedmetadata', publishDuration);
      video.removeEventListener('timeupdate', publishProgress);
    };
  }, [media.mode, onPlaybackProgress]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || media.mode !== 'video') {
      return;
    }

    let frame = 0;
    let lastCaptureAt = 0;
    let lastCaptureTime = -1;

    const publishFrame = (now: number) => {
      if (now - lastCaptureAt >= 90 && Math.abs(video.currentTime - lastCaptureTime) > 0.015) {
        const capture = captureVideoFrame(video);
        if (capture) {
          setVideoFrameSrc(capture.frame);
          setVideoPreviewSrc(capture.preview);
          setVideoPosterSrc((current) => current ?? capture.preview);
          lastCaptureAt = now;
          lastCaptureTime = video.currentTime;
        }
      }

      frame = window.requestAnimationFrame(publishFrame);
    };

    frame = window.requestAnimationFrame(publishFrame);
    return () => window.cancelAnimationFrame(frame);
  }, [media.mode]);

  return (
    <mediaPlaybackContext.Provider value={{ videoFrameSrc, videoPreviewSrc, videoPosterSrc, duration }}>
      {media.mode === 'video' && <video ref={videoRef} className="feed-video-owner" src={demoAssets.video} muted loop playsInline preload="auto" />}
      {children}
    </mediaPlaybackContext.Provider>
  );
}

export const PtzFrame = memo(function PtzFrame({ crop, look, className = '', portrait = false, tight = false, downsampled = false }: PtzFrameProps) {
  const frame = portrait ? portraitWindow(crop, tight ? TIGHT_PORTRAIT_SCALE : 1) : fitCrop(crop);
  const scaleX = 100 / frame.width;
  const scaleY = portrait ? 100 / frame.height : scaleX;
  const warmth = look?.warmth ?? 0;
  const tintOpacity = Math.min(Math.abs(warmth) / 100, 0.32);
  const previewOutputWidth = portrait ? ptzPreviewPortraitWidth : ptzPreviewWidth;
  const previewSourceWidth = Math.ceil((previewOutputWidth * 100) / frame.width);
  const projectionSrc = useCachedProjection(
    projectionKey(['ptz-feed-source', ptzCameraSource, previewSourceWidth]),
    ptzCameraSource,
    () => renderDownsampledImage(ptzCameraSource, previewSourceWidth),
    downsampled
  );
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
    <div className={`frame ptz-frame ${portrait ? 'portrait-frame' : ''} ${className}`}>
      <img
        src={downsampled ? projectionSrc : ptzCameraSource}
        alt="Simulated PTZ crop"
        style={imageStyle}
        draggable={false}
      />
      <div className="ptz-lighting-tint" style={tintStyle} />
      <div className="ptz-lens-vignette" />
    </div>
  );
});

export const WideFrame = memo(function WideFrame({ className = '', downsampled = false }: { className?: string; downsampled?: boolean }) {
  const projectionSrc = useCachedProjection(
    projectionKey(['wide-feed-source', wideCameraSource]),
    wideCameraSource,
    () => renderDownsampledImage(wideCameraSource),
    downsampled
  );

  return (
    <div className={`frame wide-frame ${className}`}>
      <img src={downsampled ? projectionSrc : wideCameraSource} alt="Simulated wide-angle auditorium feed" draggable={false} />
      <div className="wide-grid" />
    </div>
  );
});

export const MediaFrame = memo(function MediaFrame({ media, className = '', downsampled = false }: MediaFrameProps) {
  const slide = demoAssets.slides[media.slideIndex % demoAssets.slides.length];
  const slideProjectionSrc = useCachedProjection(projectionKey(['slide', slide]), slide, () => renderDownsampledImage(slide), downsampled);
  const { videoFrameSrc, videoPreviewSrc, videoPosterSrc } = useMediaPlayback();

  if (media.mode === 'video') {
    const src = downsampled ? videoPreviewSrc ?? videoFrameSrc ?? videoPosterSrc : videoFrameSrc ?? videoPreviewSrc ?? videoPosterSrc;

    return (
      <div className={`frame media-frame video-frame ${className}`}>
        {src ? <img src={src} alt="Mock video frame" draggable={false} /> : <div className="video-frame-placeholder" />}
      </div>
    );
  }

  return (
    <div className={`frame media-frame slide-frame ${className}`}>
      <img src={downsampled ? slideProjectionSrc : slide} alt={`Mock presentation slide ${media.slideIndex + 1}`} draggable={false} />
    </div>
  );
});
