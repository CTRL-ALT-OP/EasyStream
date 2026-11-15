import { fitCalibration, suggestExtraTargets, zoomDeltaForShift } from '../shared/aim';
import type { CalibrationProfile, CalibrationSample, CameraConfig, CameraPose, ZoomCorrection } from '../shared/cameras';
import { limitsOf } from '../shared/cameras';
import { matchFrames } from './matchFrames';
import { readPng } from './rtsp';
import { isRejectedMove, type ViscaLink } from './viscaLink';

export type CalibrationCallbacks = {
  onProgress: (phase: string, completed: number, total: number) => void;
  onLimits: (config: CameraConfig) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const POSITION_TOLERANCE = 24;
const ZOOM_TOLERANCE = 48;
const STILL_POSITION = 8;
const STILL_ZOOM = 16;
const SETTLE_READS = 3;
const SETTLE_INTERVAL_MS = 120;
const SETTLE_DEADLINE_MS = 20000;

const isTimeout = (error: unknown) => error instanceof Error && error.message === 'VISCA reply timed out';

const medianWidth = (samples: CalibrationSample[], wideWidth: number) => {
  const widths = samples
    .map((sample) => sample.widePixels)
    .filter((width) => width > 8 && width <= Math.max(wideWidth, 1) * 1.15)
    .sort((a, b) => a - b);
  if (widths.length === 0) {
    return Math.max(8, wideWidth * 0.45);
  }
  const mid = Math.floor(widths.length / 2);
  return widths.length % 2 === 0 ? (widths[mid - 1] + widths[mid]) / 2 : widths[mid];
};

const nearTarget = (pose: CameraPose, target: Partial<CameraPose>) =>
  (target.pan === undefined || Math.abs(pose.pan - target.pan) <= POSITION_TOLERANCE) &&
  (target.tilt === undefined || Math.abs(pose.tilt - target.tilt) <= POSITION_TOLERANCE) &&
  (target.zoom === undefined || Math.abs(pose.zoom - target.zoom) <= ZOOM_TOLERANCE);

const holdingStill = (pose: CameraPose, previous: CameraPose) =>
  Math.abs(pose.pan - previous.pan) <= STILL_POSITION &&
  Math.abs(pose.tilt - previous.tilt) <= STILL_POSITION &&
  Math.abs(pose.zoom - previous.zoom) <= STILL_ZOOM;

const grid = (config: CameraConfig) => {
  const points: { pan: number; tilt: number }[] = [];
  const steps = 5;
  for (let row = 0; row < steps; row += 1) {
    for (let column = 0; column < steps; column += 1) {
      points.push({
        pan: Math.round(config.panMin + ((config.panMax - config.panMin) * column) / (steps - 1)),
        tilt: Math.round(config.tiltMin + ((config.tiltMax - config.tiltMin) * row) / (steps - 1))
      });
    }
  }
  return points;
};

export const runCalibration = async (
  link: ViscaLink,
  config: CameraConfig,
  signal: AbortSignal,
  callbacks: CalibrationCallbacks
): Promise<CalibrationProfile> => {
  const origin = await link.pose();
  const speed = 12;
  let working = { ...config };
  const dimensions = { wideWidth: 0, wideHeight: 0, ptzWidth: 0, ptzHeight: 0 };
  const throwIfCancelled = () => {
    if (signal.aborted) {
      throw new Error('Calibration cancelled');
    }
  };

  const waitUntilSettled = async (target: Partial<CameraPose>) => {
    const deadline = Date.now() + SETTLE_DEADLINE_MS;
    let previous: CameraPose | null = null;
    let steady = 0;
    while (Date.now() < deadline) {
      throwIfCancelled();
      let pose: CameraPose;
      try {
        pose = await link.pose();
      } catch {
        await sleep(SETTLE_INTERVAL_MS);
        continue;
      }
      if (previous && nearTarget(pose, target) && holdingStill(pose, previous)) {
        steady += 1;
        if (steady >= SETTLE_READS) {
          return pose;
        }
      } else {
        steady = 0;
      }
      previous = pose;
      await sleep(SETTLE_INTERVAL_MS);
    }
    return null;
  };

  const move = async (pan: number, tilt: number, zoom?: number) => {
    try {
      await link.absolute(pan, tilt, speed, speed, 'ack');
    } catch (error) {
      if (isRejectedMove(error)) {
        const known = await link.pose().catch(() => origin);
        working = {
          ...working,
          panMin: pan < known.pan ? Math.max(working.panMin, known.pan) : working.panMin,
          panMax: pan > known.pan ? Math.min(working.panMax, known.pan) : working.panMax,
          tiltMin: tilt < known.tilt ? Math.max(working.tiltMin, known.tilt) : working.tiltMin,
          tiltMax: tilt > known.tilt ? Math.min(working.tiltMax, known.tilt) : working.tiltMax
        };
        callbacks.onLimits(working);
        return null;
      }
      if (!isTimeout(error)) {
        return null;
      }
    }
    return waitUntilSettled({ pan, tilt, zoom });
  };

  const zoomTo = async (zoom: number) => {
    try {
      await link.zoomTo(zoom, 'ack');
    } catch (error) {
      if (!isTimeout(error)) {
        return null;
      }
    }
    return waitUntilSettled({ zoom });
  };

  const capture = async (targets: { pan: number; tilt: number }[], completedOffset: number, total: number) => {
    const samples: CalibrationSample[] = [];
    for (let index = 0; index < targets.length; index += 1) {
      throwIfCancelled();
      callbacks.onProgress('Sampling the room', completedOffset + index, total);
      const target = targets[index];
      const pose = await move(target.pan, target.tilt, working.zoomMin);
      if (!pose) {
        continue;
      }
      try {
        const [wide, ptz] = await Promise.all([readPng(working.wideUrl), readPng(working.ptzUrl)]);
        const matched = await matchFrames(wide, ptz);
        if (!matched) {
          continue;
        }
        dimensions.wideWidth = matched.wideWidth;
        dimensions.wideHeight = matched.wideHeight;
        dimensions.ptzWidth = matched.ptzWidth;
        dimensions.ptzHeight = matched.ptzHeight;
        samples.push({
          x: matched.x,
          y: matched.y,
          pan: pose.pan,
          tilt: pose.tilt,
          zoom: pose.zoom,
          inliers: matched.inliers,
          widePixels: matched.widePixels
        });
      } catch {
        // A missed frame is recorded by omission. The fit rejects a run that cannot collect enough.
      }
    }
    return samples;
  };

  try {
    throwIfCancelled();
    if (!(await zoomTo(working.zoomMin))) {
      throw new Error('Camera did not reach the calibration zoom');
    }
    const baseTargets = grid(working);
    let samples = await capture(baseTargets, 0, baseTargets.length + 8);
    const frameSize = {
      wideWidth: dimensions.wideWidth || 1920,
      wideHeight: dimensions.wideHeight || 1080,
      ptzWidth: dimensions.ptzWidth || 1920,
      ptzHeight: dimensions.ptzHeight || 1080
    };
    const extras = suggestExtraTargets(samples, frameSize.wideWidth, frameSize.wideHeight, limitsOf(working));
    if (extras.length > 0) {
      samples = samples.concat(await capture(extras, baseTargets.length, baseTargets.length + extras.length));
    }

    const preliminary = fitCalibration({
      config: working,
      samples,
      zoomCurve: [],
      ...frameSize,
      wideWidth: dimensions.wideWidth || frameSize.wideWidth,
      wideHeight: dimensions.wideHeight || frameSize.wideHeight,
      ptzWidth: dimensions.ptzWidth || frameSize.ptzWidth,
      ptzHeight: dimensions.ptzHeight || frameSize.ptzHeight,
      calibrationZoom: working.zoomMin
    });
    if (preliminary.status !== 'valid') {
      return preliminary;
    }

    const ranked = [...samples].sort((a, b) => b.inliers - a.inliers).slice(0, 6);
    ranked.sort((a, b) => a.x - b.x);
    const anchors = [ranked[0], ranked[Math.floor(ranked.length / 2)], ranked[ranked.length - 1]].filter(
      (sample, index, list): sample is CalibrationSample => Boolean(sample) && list.indexOf(sample) === index
    );
    const zoomStops = [0.2, 0.45, 0.7, 1].map((fraction) => Math.round(working.zoomMin + (working.zoomMax - working.zoomMin) * fraction));
    const zoomCurve: ZoomCorrection[] = [
      {
        zoom: working.zoomMin,
        panDelta: 0,
        tiltDelta: 0,
        widePixels: medianWidth(samples, dimensions.wideWidth),
        magnification: 1
      }
    ];
    let zoomCompleted = 0;
    for (const anchor of anchors) {
      for (const zoom of zoomStops) {
        throwIfCancelled();
        callbacks.onProgress('Checking zoom', zoomCompleted, anchors.length * zoomStops.length);
        zoomCompleted += 1;
        try {
          if (!(await zoomTo(zoom))) {
            continue;
          }
          if (!(await move(anchor.pan, anchor.tilt, zoom))) {
            continue;
          }
          const [wide, ptz] = await Promise.all([readPng(working.wideUrl), readPng(working.ptzUrl)]);
          const matched = await matchFrames(wide, ptz);
          if (!matched || matched.widePixels < 8) {
            continue;
          }
          const delta = zoomDeltaForShift(preliminary, { x: anchor.x, y: anchor.y }, { x: matched.x, y: matched.y });
          zoomCurve.push({
            zoom,
            panDelta: delta.panDelta,
            tiltDelta: delta.tiltDelta,
            widePixels: matched.widePixels,
            magnification: anchor.widePixels / Math.max(1, matched.widePixels)
          });
        } catch {
          // One missed zoom stop does not invalidate the spatial map.
        }
      }
    }

    return fitCalibration({
      config: working,
      samples,
      zoomCurve,
      wideWidth: dimensions.wideWidth || frameSize.wideWidth,
      wideHeight: dimensions.wideHeight || frameSize.wideHeight,
      ptzWidth: dimensions.ptzWidth || frameSize.ptzWidth,
      ptzHeight: dimensions.ptzHeight || frameSize.ptzHeight,
      calibrationZoom: working.zoomMin
    });
  } finally {
    await restore(link, origin).catch(() => undefined);
  }
};

const restore = async (link: ViscaLink, origin: CameraPose) => {
  await link.zoomTo(origin.zoom, 'ack');
  await link.absolute(origin.pan, origin.tilt, 12, 12, 'ack');
};
