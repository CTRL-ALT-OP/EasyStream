import { describe, expect, it } from 'vitest';
import { aimAtFrame, aimAtPoint, effectiveZoomCurve, fitCalibration, frameSelection, geometricPoint, isFramingDrag, projectPose, zoomForFootprint } from './aim';
import { defaultCameraConfig, type CalibrationSample, type GeometricModel } from './cameras';

const model: GeometricModel = {
  cx: 960,
  cy: 540,
  f: 800,
  roll: 0.04,
  pan0: 80,
  tilt0: -30,
  panScale: 1500,
  tiltScale: 1400
};

const grid = (): CalibrationSample[] => {
  const samples: CalibrationSample[] = [];
  for (let y = 180; y <= 900; y += 180) {
    for (let x = 240; x <= 1680; x += 360) {
      const predicted = geometricPoint(model, x, y);
      samples.push({ x, y, pan: predicted.pan, tilt: predicted.tilt, zoom: 0, inliers: 40, widePixels: 480 });
    }
  }
  return samples;
};

describe('click and drag framing', () => {
  it('treats a short move as a click and a longer one as a frame', () => {
    expect(isFramingDrag(2.3)).toBe(false);
    expect(isFramingDrag(2.4)).toBe(true);
  });

  it('expands a selection to the PTZ aspect and clamps tiny drags', () => {
    const framed = frameSelection({ x: 100, y: 100 }, { x: 220, y: 500 }, 1920, 1080, 16 / 9);
    expect(framed.width / framed.height).toBeCloseTo(16 / 9, 5);
    expect(framed.x).toBeGreaterThanOrEqual(0);
    expect(framed.y).toBeGreaterThanOrEqual(0);
    expect(framed.x + framed.width).toBeLessThanOrEqual(1920);

    const tiny = frameSelection({ x: 800, y: 400 }, { x: 810, y: 420 }, 1920, 1080, 16 / 9);
    expect(tiny.width).toBeCloseTo(1920 * 0.12, 5);
  });

  it('looks up zoom from the footprint curve', () => {
    const curve = [
      { zoom: 0, panDelta: 0, tiltDelta: 0, widePixels: 800, magnification: 1 },
      { zoom: 8000, panDelta: 4, tiltDelta: -2, widePixels: 200, magnification: 4 },
      { zoom: 16000, panDelta: 8, tiltDelta: -3, widePixels: 80, magnification: 10 }
    ];
    expect(zoomForFootprint(curve, 800)).toBe(0);
    expect(zoomForFootprint(curve, 200)).toBe(8000);
    expect(zoomForFootprint(curve, 140)).toBeGreaterThan(8000);
    expect(zoomForFootprint(curve, 140)).toBeLessThan(16000);
  });
});

describe('calibration mapping', () => {
  const profile = fitCalibration({
    config: defaultCameraConfig,
    samples: grid(),
    zoomCurve: [
      { zoom: 0, panDelta: 0, tiltDelta: 0, widePixels: 480, magnification: 1 },
      { zoom: 8000, panDelta: 12, tiltDelta: -6, widePixels: 120, magnification: 4 }
    ],
    wideWidth: 1920,
    wideHeight: 1080,
    ptzWidth: 1920,
    ptzHeight: 1080,
    calibrationZoom: 0
  });

  it('fits a usable profile and rounds a pose back to the wide image', () => {
    expect(profile.status).toBe('valid');
    const aim = aimAtPoint(profile, { x: 700, y: 420 }, 0);
    const outline = projectPose(profile, aim.pan, aim.tilt, 0);
    expect(outline).not.toBeNull();
    expect(outline!.x + outline!.width / 2).toBeCloseTo(700, -1);
    expect(outline!.y + outline!.height / 2).toBeCloseTo(420, -1);
    expect(outline!.width).toBeGreaterThan(400);
    expect(outline!.width).toBeLessThan(560);
  });

  it('keeps zoom unchanged for a click and sets it for a drag', () => {
    expect(aimAtPoint(profile, { x: 700, y: 420 }, 1000).zoom).toBeNull();
    const framed = aimAtFrame(profile, { x: 600, y: 360, width: 120, height: 67.5 });
    expect(framed.zoom).toBeGreaterThan(7000);
  });

  it('zooms a drag and shrinks the outline when the saved curve has only the wide end', () => {
    const flat = fitCalibration({
      config: defaultCameraConfig,
      samples: grid().map((sample, index) => ({ ...sample, inliers: index % 2 === 0 ? 80 : 20, widePixels: index % 2 === 0 ? 680 : 4000 })),
      zoomCurve: [{ zoom: 0, panDelta: 0, tiltDelta: 0, widePixels: 1400, magnification: 1 }],
      wideWidth: 1920,
      wideHeight: 1080,
      ptzWidth: 1920,
      ptzHeight: 1080,
      calibrationZoom: 0
    });
    expect(flat.status).toBe('valid');
    const wide = projectPose(flat, 0, 0, 0);
    const tele = projectPose(flat, 0, 0, flat.limits.zoomMax);
    expect(wide).not.toBeNull();
    expect(tele).not.toBeNull();
    expect(wide!.width).toBeGreaterThan(600);
    expect(wide!.width).toBeLessThan(800);
    expect(tele!.width).toBeLessThan(wide!.width / 10);

    const framed = aimAtFrame(flat, { x: 800, y: 400, width: 200, height: 112.5 });
    expect(framed.zoom).not.toBeNull();
    expect(framed.zoom!).toBeGreaterThan(flat.limits.zoomMin);
    expect(effectiveZoomCurve(flat).length).toBeGreaterThan(1);
  });
});
