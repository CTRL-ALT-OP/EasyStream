import type {
  AimResult,
  CalibrationProfile,
  CalibrationSample,
  CameraConfig,
  CameraLimits,
  GeometricModel,
  PixelPoint,
  PixelRect,
  RbfModel,
  ZoomCorrection
} from './cameras';
import { limitsOf } from './cameras';

export const CLICK_DISTANCE = 2.4;
export const MIN_FRAME_FRACTION = 0.12;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const slope = (xs: number[], ys: number[]) => {
  const xMean = average(xs);
  const yMean = average(ys);
  let num = 0;
  let den = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index] - xMean;
    num += x * (ys[index] - yMean);
    den += x * x;
  }
  return den === 0 ? 0 : num / den;
};

const intercept = (xs: number[], ys: number[], gain: number) => average(ys) - gain * average(xs);

export const isFramingDrag = (distancePercent: number) => distancePercent >= CLICK_DISTANCE;

export const frameSelection = (
  a: PixelPoint,
  b: PixelPoint,
  imageWidth: number,
  imageHeight: number,
  aspect: number,
  minFraction = MIN_FRAME_FRACTION
): PixelRect => {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  let width = Math.max(1, x1 - x0);
  let height = Math.max(1, y1 - y0);
  if (width / height < aspect) {
    width = height * aspect;
  } else {
    height = width / aspect;
  }

  const minWidth = imageWidth * minFraction;
  if (width < minWidth) {
    width = minWidth;
    height = width / aspect;
  }
  if (width > imageWidth) {
    width = imageWidth;
    height = width / aspect;
  }
  if (height > imageHeight) {
    height = imageHeight;
    width = height * aspect;
  }

  return {
    x: clamp((x0 + x1) / 2 - width / 2, 0, Math.max(0, imageWidth - width)),
    y: clamp((y0 + y1) / 2 - height / 2, 0, Math.max(0, imageHeight - height)),
    width,
    height
  };
};

const solveLinear = (matrix: number[][], values: number[]): number[] | null => {
  const size = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(rows[pivot][col]) < 1e-10) {
      return null;
    }
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let column = col; column <= size; column += 1) {
      rows[col][column] /= divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === col) {
        continue;
      }
      const factor = rows[row][col];
      for (let column = col; column <= size; column += 1) {
        rows[row][column] -= factor * rows[col][column];
      }
    }
  }
  return rows.map((row) => row[size]);
};

const cross = (origin: PixelPoint, a: PixelPoint, b: PixelPoint) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

const convexHull = (points: PixelPoint[]): PixelPoint[] => {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) {
    return sorted;
  }

  const build = (source: PixelPoint[]) => {
    const hull: PixelPoint[] = [];
    for (const point of source) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) {
        hull.pop();
      }
      hull.push(point);
    }
    return hull;
  };

  const lower = build(sorted);
  const upper = build([...sorted].reverse());
  lower.pop();
  upper.pop();
  return lower.concat(upper);
};

const insideHull = (point: PixelPoint, hull: PixelPoint[]) => {
  if (hull.length < 3) {
    return true;
  }

  let sign = 0;
  for (let index = 0; index < hull.length; index += 1) {
    const value = cross(hull[index], hull[(index + 1) % hull.length], point);
    if (value === 0) {
      continue;
    }
    const next = Math.sign(value);
    if (sign === 0) {
      sign = next;
    } else if (next !== sign) {
      return false;
    }
  }
  return true;
};

const closestOnSegment = (point: PixelPoint, a: PixelPoint, b: PixelPoint): PixelPoint => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1);
  return { x: a.x + dx * t, y: a.y + dy * t };
};

const clampToHull = (point: PixelPoint, hull: PixelPoint[]) => {
  if (hull.length < 3 || insideHull(point, hull)) {
    return { point, clamped: false };
  }

  let best = hull[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < hull.length; index += 1) {
    const candidate = closestOnSegment(point, hull[index], hull[(index + 1) % hull.length]);
    const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return { point: best, clamped: true };
};

export const geometricPoint = (model: GeometricModel, x: number, y: number) => {
  const dx = x - model.cx;
  const dy = y - model.cy;
  const cos = Math.cos(model.roll);
  const sin = Math.sin(model.roll);
  const xr = dx * cos - dy * sin;
  const yr = dx * sin + dy * cos;
  return {
    pan: model.pan0 + model.panScale * Math.atan2(xr, model.f),
    tilt: model.tilt0 + model.tiltScale * Math.atan2(yr, model.f)
  };
};

const geometricInverse = (model: GeometricModel, pan: number, tilt: number): PixelPoint => {
  const xr = model.f * Math.tan((pan - model.pan0) / model.panScale);
  const yr = model.f * Math.tan((tilt - model.tilt0) / model.tiltScale);
  const cos = Math.cos(model.roll);
  const sin = Math.sin(model.roll);
  return {
    x: model.cx + xr * cos + yr * sin,
    y: model.cy - xr * sin + yr * cos
  };
};

const fitGeometric = (samples: CalibrationSample[], width: number, height: number): GeometricModel => {
  const cx = width / 2;
  const cy = height / 2;
  const seedF = (width / 2) / Math.tan((100 * Math.PI) / 360);
  const anglesX = samples.map((sample) => Math.atan2(sample.x - cx, seedF));
  const anglesY = samples.map((sample) => Math.atan2(sample.y - cy, seedF));
  const pans = samples.map((sample) => sample.pan);
  const tilts = samples.map((sample) => sample.tilt);
  const panScale = slope(anglesX, pans) || 1;
  const tiltScale = slope(anglesY, tilts) || 1;
  let params = [seedF, 0, intercept(anglesX, pans, panScale), intercept(anglesY, tilts, tiltScale), panScale, tiltScale];

  const modelOf = (value: number[]): GeometricModel => ({
    cx,
    cy,
    f: value[0],
    roll: value[1],
    pan0: value[2],
    tilt0: value[3],
    panScale: value[4],
    tiltScale: value[5]
  });

  const residual = (value: number[]) => {
    const model = modelOf(value);
    const rows: number[] = [];
    for (const sample of samples) {
      const predicted = geometricPoint(model, sample.x, sample.y);
      rows.push(predicted.pan - sample.pan, predicted.tilt - sample.tilt);
    }
    return rows;
  };

  const sumSquares = (rows: number[]) => rows.reduce((sum, value) => sum + value * value, 0);
  let current = residual(params);
  let error = sumSquares(current);
  let lambda = 1e-3;
  const steps = [1, 1e-4, 1, 1, 1, 1];

  for (let iteration = 0; iteration < 25; iteration += 1) {
    const jacobian: number[][] = [];
    for (let row = 0; row < current.length; row += 1) {
      jacobian.push(new Array(params.length).fill(0));
    }
    for (let column = 0; column < params.length; column += 1) {
      const shifted = [...params];
      shifted[column] += steps[column];
      const next = residual(shifted);
      for (let row = 0; row < next.length; row += 1) {
        jacobian[row][column] = (next[row] - current[row]) / steps[column];
      }
    }

    const normal = params.map(() => new Array(params.length).fill(0));
    const right = new Array(params.length).fill(0);
    for (let row = 0; row < current.length; row += 1) {
      for (let column = 0; column < params.length; column += 1) {
        right[column] -= jacobian[row][column] * current[row];
        for (let other = 0; other < params.length; other += 1) {
          normal[column][other] += jacobian[row][column] * jacobian[row][other];
        }
      }
    }
    for (let column = 0; column < params.length; column += 1) {
      normal[column][column] += lambda * (Math.abs(normal[column][column]) || 1);
    }
    const delta = solveLinear(normal, right);
    if (!delta) {
      lambda = Math.min(lambda * 4, 1e6);
      continue;
    }

    const trial = params.map((value, index) => value + delta[index]);
    trial[0] = Math.max(20, trial[0]);
    if (Math.abs(trial[4]) < 1e-3) {
      trial[4] = Math.sign(trial[4]) || 1;
    }
    if (Math.abs(trial[5]) < 1e-3) {
      trial[5] = Math.sign(trial[5]) || 1;
    }
    const trialResidual = residual(trial);
    const trialError = sumSquares(trialResidual);
    if (trialError < error) {
      params = trial;
      current = trialResidual;
      error = trialError;
      lambda = Math.max(lambda / 3, 1e-6);
    } else {
      lambda = Math.min(lambda * 4, 1e6);
    }
  }

  return modelOf(params);
};

const nearestSigma = (points: PixelPoint[]) => {
  if (points.length < 2) {
    return 32;
  }
  const distances = points.map((point, index) => {
    let best = Number.POSITIVE_INFINITY;
    for (let other = 0; other < points.length; other += 1) {
      if (other === index) {
        continue;
      }
      best = Math.min(best, Math.hypot(point.x - points[other].x, point.y - points[other].y));
    }
    return best;
  });
  distances.sort((a, b) => a - b);
  return Math.max(8, distances[Math.floor(distances.length / 2)] ?? 32);
};

const fitResidual = (model: GeometricModel, samples: CalibrationSample[]): RbfModel => {
  const centers = samples.map((sample) => ({ x: sample.x, y: sample.y }));
  const sigma = nearestSigma(centers);
  const ridge = 0.05;
  const matrix = centers.map((center, row) =>
    centers.map((other, column) => {
      const weight = Math.exp(-((center.x - other.x) ** 2 + (center.y - other.y) ** 2) / (2 * sigma * sigma));
      return weight + (row === column ? ridge : 0);
    })
  );
  const panValues = samples.map((sample) => sample.pan - geometricPoint(model, sample.x, sample.y).pan);
  const tiltValues = samples.map((sample) => sample.tilt - geometricPoint(model, sample.x, sample.y).tilt);
  return {
    sigma,
    ridge,
    centers,
    panWeights: solveLinear(matrix, panValues) ?? samples.map(() => 0),
    tiltWeights: solveLinear(matrix, tiltValues) ?? samples.map(() => 0)
  };
};

const residualAt = (model: RbfModel, x: number, y: number) => {
  let pan = 0;
  let tilt = 0;
  for (let index = 0; index < model.centers.length; index += 1) {
    const center = model.centers[index];
    const weight = Math.exp(-((x - center.x) ** 2 + (y - center.y) ** 2) / (2 * model.sigma * model.sigma));
    pan += model.panWeights[index] * weight;
    tilt += model.tiltWeights[index] * weight;
  }
  return { pan, tilt };
};

const sortedCurve = (curve: ZoomCorrection[]) => [...curve].sort((a, b) => a.zoom - b.zoom);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const correctionAtZoom = (curve: ZoomCorrection[], zoom: number) => {
  const samples = sortedCurve(curve);
  if (samples.length === 0) {
    return { panDelta: 0, tiltDelta: 0, widePixels: 0 };
  }
  if (zoom <= samples[0].zoom) {
    return samples[0];
  }
  const last = samples[samples.length - 1];
  if (zoom >= last.zoom) {
    return last;
  }
  for (let index = 1; index < samples.length; index += 1) {
    if (zoom <= samples[index].zoom) {
      const span = samples[index].zoom - samples[index - 1].zoom || 1;
      const t = (zoom - samples[index - 1].zoom) / span;
      return {
        panDelta: lerp(samples[index - 1].panDelta, samples[index].panDelta, t),
        tiltDelta: lerp(samples[index - 1].tiltDelta, samples[index].tiltDelta, t),
        widePixels: lerp(samples[index - 1].widePixels, samples[index].widePixels, t)
      };
    }
  }
  return last;
};

const OPTICAL_ZOOM_RATIO = 20;

const robustWidePixels = (profile: CalibrationProfile) => {
  const limit = profile.wideWidth * 1.05;
  const plausible = profile.samples.filter((sample) => sample.widePixels > 8 && sample.widePixels <= limit);
  const pool = plausible.length > 0 ? plausible : profile.samples.filter((sample) => sample.widePixels > 8);
  if (pool.length === 0) {
    return Math.max(8, profile.wideWidth * 0.45);
  }
  const inlierCut = median(pool.map((sample) => sample.inliers));
  const trusted = pool.filter((sample) => sample.inliers >= inlierCut);
  const chosen = trusted.length >= 3 ? trusted : pool;
  return median(chosen.map((sample) => sample.widePixels));
};

/** Measured zoom stops when they actually change the footprint; otherwise an optical curve anchored to the wide view. */
export const effectiveZoomCurve = (profile: CalibrationProfile): ZoomCorrection[] => {
  const limit = profile.wideWidth * 1.15;
  const measured = sortedCurve(profile.zoomCurve).filter((sample) => sample.widePixels >= 8 && sample.widePixels <= limit);
  if (measured.length >= 2) {
    const widest = Math.max(...measured.map((sample) => sample.widePixels));
    const tightest = Math.min(...measured.map((sample) => sample.widePixels));
    if (widest / tightest >= 1.25) {
      return measured;
    }
  }

  const span = Math.max(1, profile.limits.zoomMax - profile.limits.zoomMin);
  const magnificationAt = (zoom: number) => Math.pow(OPTICAL_ZOOM_RATIO, (zoom - profile.limits.zoomMin) / span);
  const baseZoom = clamp(profile.calibrationZoom, profile.limits.zoomMin, profile.limits.zoomMax);
  const basePixels = robustWidePixels(profile);
  const baseMagnification = magnificationAt(baseZoom);
  return [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const zoom = profile.limits.zoomMin + span * fraction;
    const magnification = magnificationAt(zoom);
    return {
      zoom,
      panDelta: 0,
      tiltDelta: 0,
      widePixels: basePixels * (baseMagnification / magnification),
      magnification: magnification / baseMagnification
    };
  });
};

export const zoomForFootprint = (curve: ZoomCorrection[], widePixels: number) => {
  const samples = sortedCurve(curve).filter((sample) => sample.widePixels > 0);
  if (samples.length === 0) {
    return 0;
  }
  const ordered = [...samples].sort((a, b) => b.widePixels - a.widePixels);
  if (widePixels >= ordered[0].widePixels) {
    return ordered[0].zoom;
  }
  const tightest = ordered[ordered.length - 1];
  if (widePixels <= tightest.widePixels) {
    return tightest.zoom;
  }
  for (let index = 1; index < ordered.length; index += 1) {
    if (widePixels >= ordered[index].widePixels) {
      const span = ordered[index - 1].widePixels - ordered[index].widePixels || 1;
      const t = (ordered[index - 1].widePixels - widePixels) / span;
      return lerp(ordered[index - 1].zoom, ordered[index].zoom, t);
    }
  }
  return tightest.zoom;
};

const median = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const percentile = (values: number[], fraction: number) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
};

const predictBase = (geometric: GeometricModel, residual: RbfModel, x: number, y: number) => {
  const base = geometricPoint(geometric, x, y);
  const correction = residualAt(residual, x, y);
  return { pan: base.pan + correction.pan, tilt: base.tilt + correction.tilt };
};

const frameErrorPercent = (geometric: GeometricModel, widePixels: number, panError: number, tiltError: number) => {
  const half = Math.max(1, widePixels / 2);
  const framePan = Math.abs(geometric.panScale * Math.atan2(half, geometric.f) * 2);
  const frameTilt = Math.abs(geometric.tiltScale * Math.atan2(half / (16 / 9), geometric.f) * 2);
  const frame = Math.hypot(framePan, frameTilt) || 1;
  return (Math.hypot(panError, tiltError) / frame) * 100;
};

const emptyResidual = (): RbfModel => ({ sigma: 32, ridge: 0.05, centers: [], panWeights: [], tiltWeights: [] });

const failedProfile = (
  message: string,
  input: {
    config: CameraConfig;
    wideWidth: number;
    wideHeight: number;
    ptzWidth: number;
    ptzHeight: number;
    calibrationZoom: number;
    samples: CalibrationSample[];
  }
): CalibrationProfile => ({
  status: 'failed',
  message,
  wideUrl: input.config.wideUrl,
  ptzUrl: input.config.ptzUrl,
  viscaHost: input.config.viscaHost,
  viscaPort: input.config.viscaPort,
  wideWidth: input.wideWidth,
  wideHeight: input.wideHeight,
  ptzWidth: input.ptzWidth,
  ptzHeight: input.ptzHeight,
  calibrationZoom: input.calibrationZoom,
  geometric: { cx: input.wideWidth / 2, cy: input.wideHeight / 2, f: input.wideWidth, roll: 0, pan0: 0, tilt0: 0, panScale: 1, tiltScale: 1 },
  residual: emptyResidual(),
  zoomCurve: [],
  samples: input.samples,
  limits: limitsOf(input.config),
  validation: { medianError: 0, p95Error: 0, medianFramePercent: 0, sampleCount: input.samples.length, holdoutCount: 0 }
});

export const fitCalibration = (input: {
  config: CameraConfig;
  samples: CalibrationSample[];
  zoomCurve: ZoomCorrection[];
  wideWidth: number;
  wideHeight: number;
  ptzWidth: number;
  ptzHeight: number;
  calibrationZoom: number;
}): CalibrationProfile => {
  const usable = input.samples.filter((sample) => Number.isFinite(sample.x) && Number.isFinite(sample.pan) && sample.inliers >= 12);
  if (usable.length < 8) {
    return failedProfile('Calibration needs at least 8 matched positions. Check that both cameras see the same scene.', input);
  }

  const holdout = usable.length >= 10 ? usable.filter((_, index) => index % 5 === 4) : [];
  const training = usable.filter((sample) => !holdout.includes(sample));
  let geometric: GeometricModel;
  try {
    geometric = fitGeometric(training, input.wideWidth, input.wideHeight);
  } catch {
    return failedProfile('The pan and tilt mapping could not be fit.', input);
  }
  const residual = fitResidual(geometric, training);
  const widePixels = median(usable.map((sample) => sample.widePixels).filter((value) => value > 0)) || input.wideWidth * 0.25;
  const errors = holdout.map((sample) => {
    const predicted = predictBase(geometric, residual, sample.x, sample.y);
    return {
      units: Math.hypot(predicted.pan - sample.pan, predicted.tilt - sample.tilt),
      percent: frameErrorPercent(geometric, sample.widePixels || widePixels, predicted.pan - sample.pan, predicted.tilt - sample.tilt)
    };
  });
  const medianError = median(errors.map((error) => error.units));
  const p95Error = percentile(errors.map((error) => error.units), 0.95);
  const medianFramePercent = median(errors.map((error) => error.percent));
  if (holdout.length >= 3 && medianFramePercent > 25) {
    return failedProfile(`Holdout error is ${medianFramePercent.toFixed(1)}% of the PTZ frame. Recalibrate with more scene detail.`, {
      ...input,
      samples: usable
    });
  }

  let storedGeometric: GeometricModel;
  try {
    storedGeometric = fitGeometric(usable, input.wideWidth, input.wideHeight);
  } catch {
    storedGeometric = geometric;
  }
  const storedResidual = fitResidual(storedGeometric, usable);
  const curve = input.zoomCurve.length
    ? sortedCurve(input.zoomCurve)
    : [{ zoom: input.calibrationZoom, panDelta: 0, tiltDelta: 0, widePixels, magnification: 1 }];
  const magnifications = curve.map((sample) => sample.magnification).filter((value) => value > 0);
  const reached = magnifications.length ? ` Zoom samples reach about ${Math.max(...magnifications).toFixed(1)}×.` : '';
  return {
    status: 'valid',
    message: `Calibrated from ${usable.length} positions.${reached}`,
    wideUrl: input.config.wideUrl,
    ptzUrl: input.config.ptzUrl,
    viscaHost: input.config.viscaHost,
    viscaPort: input.config.viscaPort,
    wideWidth: input.wideWidth,
    wideHeight: input.wideHeight,
    ptzWidth: input.ptzWidth,
    ptzHeight: input.ptzHeight,
    calibrationZoom: input.calibrationZoom,
    geometric: storedGeometric,
    residual: storedResidual,
    zoomCurve: curve,
    samples: usable,
    limits: limitsOf(input.config),
    validation: {
      medianError,
      p95Error,
      medianFramePercent,
      sampleCount: usable.length,
      holdoutCount: holdout.length
    }
  };
};

export const suggestExtraTargets = (samples: CalibrationSample[], width: number, height: number, limits: CameraLimits) => {
  if (samples.length < 8) {
    return [];
  }
  let geometric: GeometricModel;
  try {
    geometric = fitGeometric(samples, width, height);
  } catch {
    return [];
  }
  const ranked = samples
    .map((sample) => {
      const predicted = geometricPoint(geometric, sample.x, sample.y);
      return { sample, error: Math.hypot(predicted.pan - sample.pan, predicted.tilt - sample.tilt) };
    })
    .sort((a, b) => b.error - a.error);
  const targets: { pan: number; tilt: number }[] = [];
  for (const item of ranked) {
    if (targets.length >= 8) {
      break;
    }
    let nearest = samples[0];
    let best = Number.POSITIVE_INFINITY;
    for (const other of samples) {
      if (other === item.sample) {
        continue;
      }
      const distance = Math.hypot(other.pan - item.sample.pan, other.tilt - item.sample.tilt);
      if (distance > 1 && distance < best) {
        nearest = other;
        best = distance;
      }
    }
    const pan = clamp(Math.round((item.sample.pan + nearest.pan) / 2), limits.panMin, limits.panMax);
    const tilt = clamp(Math.round((item.sample.tilt + nearest.tilt) / 2), limits.tiltMin, limits.tiltMax);
    const duplicate = samples.some((sample) => Math.hypot(sample.pan - pan, sample.tilt - tilt) < 8) || targets.some((target) => target.pan === pan && target.tilt === tilt);
    if (!duplicate) {
      targets.push({ pan, tilt });
    }
  }
  return targets;
};

export const profileIsCurrent = (profile: CalibrationProfile | null, config: CameraConfig) =>
  profile?.status === 'valid' &&
  profile.wideUrl === config.wideUrl &&
  profile.ptzUrl === config.ptzUrl &&
  profile.viscaHost === config.viscaHost &&
  profile.viscaPort === config.viscaPort &&
  profile.limits.panMin === config.panMin &&
  profile.limits.panMax === config.panMax &&
  profile.limits.tiltMin === config.tiltMin &&
  profile.limits.tiltMax === config.tiltMax &&
  profile.limits.zoomMin === config.zoomMin &&
  profile.limits.zoomMax === config.zoomMax;

const clampPose = (pan: number, tilt: number, limits: CameraLimits) => ({
  pan: clamp(pan, limits.panMin, limits.panMax),
  tilt: clamp(tilt, limits.tiltMin, limits.tiltMax)
});

const aimPixel = (profile: CalibrationProfile, pixel: PixelPoint, zoom: number): AimResult => {
  const hull = convexHull(profile.samples.map((sample) => ({ x: sample.x, y: sample.y })));
  const clamped = clampToHull(pixel, hull);
  const predicted = predictBase(profile.geometric, profile.residual, clamped.point.x, clamped.point.y);
  const correction = correctionAtZoom(profile.zoomCurve, zoom);
  const pose = clampPose(predicted.pan + correction.panDelta, predicted.tilt + correction.tiltDelta, profile.limits);
  return { ...pose, zoom: null, lowConfidence: clamped.clamped };
};

export const aimAtPoint = (profile: CalibrationProfile, pixel: PixelPoint, zoom: number) => aimPixel(profile, pixel, zoom);

export const aimAtFrame = (profile: CalibrationProfile, rect: PixelRect): AimResult => {
  const zoom = clamp(zoomForFootprint(effectiveZoomCurve(profile), rect.width), profile.limits.zoomMin, profile.limits.zoomMax);
  const aim = aimPixel(profile, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, zoom);
  return { ...aim, zoom };
};

export const scalePoint = (point: PixelPoint, fromWidth: number, fromHeight: number, toWidth: number, toHeight: number): PixelPoint => ({
  x: point.x * (toWidth / fromWidth),
  y: point.y * (toHeight / fromHeight)
});

export const scaleRect = (rect: PixelRect, fromWidth: number, fromHeight: number, toWidth: number, toHeight: number): PixelRect => ({
  x: rect.x * (toWidth / fromWidth),
  y: rect.y * (toHeight / fromHeight),
  width: rect.width * (toWidth / fromWidth),
  height: rect.height * (toHeight / fromHeight)
});

export const projectPose = (profile: CalibrationProfile, pan: number, tilt: number, zoom: number): PixelRect | null => {
  const correction = correctionAtZoom(profile.zoomCurve, zoom);
  const targetPan = pan - correction.panDelta;
  const targetTilt = tilt - correction.tiltDelta;
  let point: PixelPoint;
  try {
    point = geometricInverse(profile.geometric, targetPan, targetTilt);
  } catch {
    return null;
  }

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const predicted = predictBase(profile.geometric, profile.residual, point.x, point.y);
    const panError = targetPan - predicted.pan;
    const tiltError = targetTilt - predicted.tilt;
    if (Math.hypot(panError, tiltError) < 0.5) {
      break;
    }
    const step = 2;
    const px = predictBase(profile.geometric, profile.residual, point.x + step, point.y);
    const py = predictBase(profile.geometric, profile.residual, point.x, point.y + step);
    const j00 = (px.pan - predicted.pan) / step;
    const j10 = (px.tilt - predicted.tilt) / step;
    const j01 = (py.pan - predicted.pan) / step;
    const j11 = (py.tilt - predicted.tilt) / step;
    const determinant = j00 * j11 - j01 * j10;
    if (Math.abs(determinant) < 1e-8) {
      break;
    }
    point = {
      x: point.x + (j11 * panError - j01 * tiltError) / determinant,
      y: point.y + (-j10 * panError + j00 * tiltError) / determinant
    };
  }

  const footprint = correctionAtZoom(effectiveZoomCurve(profile), zoom).widePixels;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || footprint <= 0) {
    return null;
  }

  const aspect = profile.ptzWidth > 0 && profile.ptzHeight > 0 ? profile.ptzWidth / profile.ptzHeight : 16 / 9;
  const halfWidth = footprint / 2;
  const halfHeight = footprint / aspect / 2;
  const cos = Math.cos(profile.geometric.roll);
  const sin = Math.sin(profile.geometric.roll);
  const corners = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight]
  ].map(([dx, dy]) => ({
    x: point.x + dx * cos - dy * sin,
    y: point.y + dx * sin + dy * cos
  }));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
};

export const zoomDeltaForShift = (profile: CalibrationProfile, original: PixelPoint, shifted: PixelPoint) => {
  const from = predictBase(profile.geometric, profile.residual, original.x, original.y);
  const to = predictBase(profile.geometric, profile.residual, shifted.x, shifted.y);
  return { panDelta: from.pan - to.pan, tiltDelta: from.tilt - to.tilt };
};
