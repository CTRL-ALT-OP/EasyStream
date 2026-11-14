import type { CropRect } from '../types';

export const MIN_CROP = 12;
export const MAX_CROP = 100;

/** Width% / height% for a 9:16 window on a 16:9 source. */
export const PORTRAIT_CUT = 81 / 256;

export const TIGHT_PORTRAIT_SCALE = 0.72;

export type CropPoint = {
  x: number;
  y: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** A 16:9 window on the 16:9 source uses equal width and height percentages. */
export function fitCrop(crop: CropRect): CropRect {
  const size = clamp(crop.width, MIN_CROP, MAX_CROP);
  return {
    x: clamp(crop.x, 0, MAX_CROP - size),
    y: clamp(crop.y, 0, MAX_CROP - size),
    width: size,
    height: size
  };
}

export function panCrop(crop: CropRect, dx: number, dy: number): CropRect {
  const current = fitCrop(crop);
  return fitCrop({
    ...current,
    x: current.x + dx,
    y: current.y + dy
  });
}

export function zoomCrop(crop: CropRect, scale: number): CropRect {
  const current = fitCrop(crop);
  const size = clamp(current.width * scale, MIN_CROP, MAX_CROP);
  return fitCrop({
    x: current.x + (current.width - size) / 2,
    y: current.y + (current.height - size) / 2,
    width: size,
    height: size
  });
}

export function centerCropAt(crop: CropRect, point: CropPoint): CropRect {
  const current = fitCrop(crop);
  return fitCrop({
    ...current,
    x: point.x - current.width / 2,
    y: point.y - current.height / 2
  });
}

/** Smallest 16:9 window that contains the selection, shifted back onto the frame. */
export function cropFromSelection(a: CropPoint, b: CropPoint): CropRect {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const size = clamp(Math.max(x1 - x0, y1 - y0, MIN_CROP), MIN_CROP, MAX_CROP);
  return fitCrop({
    x: (x0 + x1) / 2 - size / 2,
    y: (y0 + y1) / 2 - size / 2,
    width: size,
    height: size
  });
}

/** Maps a source crop onto a view box with origin at the top left. Percentages match the previous left/top/width/height placement. */
export function cropPlacement(frame: CropRect) {
  const width = frame.width || 1;
  const height = frame.height || 1;
  const scaleX = 100 / width;
  const scaleY = 100 / height;
  return {
    scaleX,
    scaleY,
    translateX: -frame.x * scaleX,
    translateY: -frame.y * scaleY
  };
}

export function cropTransform(frame: CropRect) {
  const placement = cropPlacement(frame);
  return `translate3d(${placement.translateX}%, ${placement.translateY}%, 0) scale(${placement.scaleX}, ${placement.scaleY})`;
}

/** Centered 9:16 cut of a 16:9 crop. Tightness below 1 zooms that cut in. */
export function portraitWindow(crop: CropRect, tightness = 1): CropRect {
  const current = fitCrop(crop);
  const height = current.height * tightness;
  const width = height * PORTRAIT_CUT;
  return {
    x: current.x + (current.width - width) / 2,
    y: current.y + (current.height - height) / 2,
    width,
    height
  };
}
