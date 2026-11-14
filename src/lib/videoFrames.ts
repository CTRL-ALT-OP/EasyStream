import { sizeBucket } from './stillCache';

type VideoSink = {
  canvas: HTMLCanvasElement;
  width: number;
};

const sinks = new Set<VideoSink>();
const scratch = new Map<number, HTMLCanvasElement>();
let video: HTMLVideoElement | null = null;
let frame = 0;

const scratchCanvas = (width: number, height: number) => {
  let canvas = scratch.get(width);
  if (!canvas) {
    canvas = document.createElement('canvas');
    scratch.set(width, canvas);
  }

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return canvas;
};

export const drawVideoFrame = () => {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return;
  }

  const buckets = new Set<number>();
  sinks.forEach((sink) => buckets.add(sink.width));
  buckets.forEach((width) => {
    const aspect = video!.videoWidth / video!.videoHeight;
    const canvas = scratchCanvas(width, Math.max(1, Math.round(width / aspect)));
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.drawImage(video!, 0, 0, canvas.width, canvas.height);
  });

  sinks.forEach((sink) => {
    const source = scratch.get(sink.width);
    const context = sink.canvas.getContext('2d');
    if (!source || !context) {
      return;
    }

    if (sink.canvas.width !== source.width || sink.canvas.height !== source.height) {
      sink.canvas.width = source.width;
      sink.canvas.height = source.height;
    }

    context.drawImage(source, 0, 0);
  });
};

const loop = () => {
  drawVideoFrame();
  if (video && !video.paused && sinks.size > 0) {
    frame = window.requestAnimationFrame(loop);
    return;
  }

  frame = 0;
};

export const startVideoLoop = () => {
  if (frame !== 0 || !video || video.paused || sinks.size === 0) {
    return;
  }

  frame = window.requestAnimationFrame(loop);
};

export const stopVideoLoop = () => {
  if (frame !== 0) {
    window.cancelAnimationFrame(frame);
    frame = 0;
  }
};

export const attachVideo = (element: HTMLVideoElement | null) => {
  video = element;
  if (!element) {
    stopVideoLoop();
  }
};

export const registerVideoSink = (canvas: HTMLCanvasElement, width: number) => {
  const sink: VideoSink = { canvas, width: sizeBucket(width) };
  sinks.add(sink);
  drawVideoFrame();
  startVideoLoop();
  return () => {
    sinks.delete(sink);
    if (sinks.size === 0) {
      stopVideoLoop();
    }
  };
};
