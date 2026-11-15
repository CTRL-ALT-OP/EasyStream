import { createRequire } from 'node:module';
import type { DecodedImage } from '../shared/png';

const require = createRequire(import.meta.url);

type CvMat = {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32F: Float32Array;
  delete: () => void;
  ucharAt: (row: number, col?: number) => number;
};

type CvApi = {
  Mat: new () => CvMat;
  KeyPointVector: new () => { get: (index: number) => { pt: { x: number; y: number } }; delete: () => void };
  DMatchVectorVector: new () => { size: () => number; get: (index: number) => { size: () => number; get: (index: number) => { distance: number; queryIdx: number; trainIdx: number } }; delete: () => void };
  ORB: new (features: number) => { detectAndCompute: (image: CvMat, mask: CvMat, keypoints: unknown, descriptors: CvMat) => void; delete: () => void };
  BFMatcher: new (norm: number, crossCheck: boolean) => { knnMatch: (query: CvMat, train: CvMat, matches: unknown, k: number) => void; delete: () => void };
  NORM_HAMMING: number;
  CV_8UC3: number;
  CV_32FC2: number;
  RANSAC: number;
  Size: new (width: number, height: number) => unknown;
  matFromArray: (rows: number, cols: number, type: number, data: ArrayLike<number>) => CvMat;
  resize: (src: CvMat, dst: CvMat, size: unknown) => void;
  findHomography: (src: CvMat, dst: CvMat, method: number, threshold: number, mask: CvMat) => CvMat;
  perspectiveTransform: (src: CvMat, dst: CvMat, matrix: CvMat) => void;
};

let cvPromise: Promise<CvApi> | null = null;

const loadCv = async (): Promise<CvApi> => {
  if (!cvPromise) {
    cvPromise = (async () => {
      const loaded = require('@techstark/opencv-js') as CvApi & { then?: unknown; onRuntimeInitialized?: () => void };
      if (typeof (loaded as { then?: unknown }).then === 'function') {
        return await (loaded as unknown as Promise<CvApi>);
      }
      if (loaded.Mat) {
        return loaded;
      }
      await new Promise<void>((resolve) => {
        loaded.onRuntimeInitialized = () => resolve();
      });
      return loaded;
    })();
  }
  return cvPromise;
};

export type FrameMatch = {
  x: number;
  y: number;
  inliers: number;
  wideWidth: number;
  wideHeight: number;
  ptzWidth: number;
  ptzHeight: number;
  widePixels: number;
};

const release = (value: { delete?: () => void } | null | undefined) => {
  try {
    value?.delete?.();
  } catch {
    // OpenCV objects can already be released when a match fails halfway through.
  }
};

const scaled = (cv: CvApi, image: DecodedImage) => {
  const mat = cv.matFromArray(image.height, image.width, cv.CV_8UC3, image.rgb);
  const maxWidth = 1280;
  if (mat.cols <= maxWidth) {
    return { mat, scale: 1 };
  }
  const scale = maxWidth / mat.cols;
  const resized = new cv.Mat();
  cv.resize(mat, resized, new cv.Size(maxWidth, Math.max(2, Math.round(mat.rows * scale))));
  mat.delete();
  return { mat: resized, scale };
};

const pointAt = (cv: CvApi, homography: CvMat, x: number, y: number, scale: number) => {
  const source = cv.matFromArray(1, 1, cv.CV_32FC2, [x, y]);
  const destination = new cv.Mat();
  cv.perspectiveTransform(source, destination, homography);
  const mapped = { x: (destination.data32F?.[0] ?? 0) / scale, y: (destination.data32F?.[1] ?? 0) / scale };
  source.delete();
  destination.delete();
  return mapped;
};

export const matchFrames = async (wide: DecodedImage, ptz: DecodedImage): Promise<FrameMatch | null> => {
  const cv = await loadCv();
  const wideScaled = scaled(cv, wide);
  const ptzScaled = scaled(cv, ptz);
  const wideKeys = new cv.KeyPointVector();
  const ptzKeys = new cv.KeyPointVector();
  const wideDesc = new cv.Mat();
  const ptzDesc = new cv.Mat();
  const empty = new cv.Mat();
  const matches = new cv.DMatchVectorVector();
  const orb = new cv.ORB(900);
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  let source: CvMat | null = null;
  let destination: CvMat | null = null;
  let mask: CvMat | null = null;
  let homography: CvMat | null = null;

  try {
    orb.detectAndCompute(wideScaled.mat, empty, wideKeys, wideDesc);
    orb.detectAndCompute(ptzScaled.mat, empty, ptzKeys, ptzDesc);
    if (wideDesc.rows < 12 || ptzDesc.rows < 12) {
      return null;
    }

    matcher.knnMatch(ptzDesc, wideDesc, matches, 2);
    const pairs: { sx: number; sy: number; dx: number; dy: number }[] = [];
    for (let index = 0; index < matches.size(); index += 1) {
      const pair = matches.get(index);
      if (pair.size() < 2) {
        continue;
      }
      const best = pair.get(0);
      const second = pair.get(1);
      if (best.distance >= 0.75 * second.distance) {
        continue;
      }
      const ptzPoint = ptzKeys.get(best.queryIdx).pt;
      const widePoint = wideKeys.get(best.trainIdx).pt;
      pairs.push({ sx: ptzPoint.x, sy: ptzPoint.y, dx: widePoint.x, dy: widePoint.y });
    }
    if (pairs.length < 12) {
      return null;
    }

    source = cv.matFromArray(pairs.length, 1, cv.CV_32FC2, pairs.flatMap((pair) => [pair.sx, pair.sy]));
    destination = cv.matFromArray(pairs.length, 1, cv.CV_32FC2, pairs.flatMap((pair) => [pair.dx, pair.dy]));
    mask = new cv.Mat();
    homography = cv.findHomography(source, destination, cv.RANSAC, 4, mask);
    if (!homography || homography.rows !== 3) {
      return null;
    }

    let inliers = 0;
    for (let index = 0; index < pairs.length; index += 1) {
      const value = typeof mask.ucharAt === 'function' ? mask.ucharAt(index, 0) : mask.data?.[index];
      if (value) {
        inliers += 1;
      }
    }
    if (inliers < 12) {
      return null;
    }

    const midX = ptzScaled.mat.cols / 2;
    const midY = ptzScaled.mat.rows / 2;
    const center = pointAt(cv, homography, midX, midY, wideScaled.scale);
    const step = 32;
    const beside = pointAt(cv, homography, midX + step, midY, wideScaled.scale);
    if (center.x < -wide.width || center.y < -wide.height || center.x > wide.width * 2 || center.y > wide.height * 2) {
      return null;
    }
    const widePixels = (Math.hypot(beside.x - center.x, beside.y - center.y) / step) * ptzScaled.mat.cols;
    if (!Number.isFinite(widePixels) || widePixels < 8 || widePixels > wide.width * 1.15) {
      return {
        x: center.x,
        y: center.y,
        inliers,
        wideWidth: wide.width,
        wideHeight: wide.height,
        ptzWidth: ptz.width,
        ptzHeight: ptz.height,
        widePixels: 0
      };
    }

    return {
      x: center.x,
      y: center.y,
      inliers,
      wideWidth: wide.width,
      wideHeight: wide.height,
      ptzWidth: ptz.width,
      ptzHeight: ptz.height,
      widePixels
    };
  } catch {
    return null;
  } finally {
    release(homography);
    release(mask);
    release(source);
    release(destination);
    release(matches);
    release(matcher);
    release(orb);
    release(empty);
    release(wideDesc);
    release(ptzDesc);
    release(wideKeys);
    release(ptzKeys);
    release(wideScaled.mat);
    release(ptzScaled.mat);
  }
};
