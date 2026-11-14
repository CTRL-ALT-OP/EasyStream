import { describe, expect, it } from 'vitest';
import { MIN_CROP, PORTRAIT_CUT, TIGHT_PORTRAIT_SCALE, cropFromSelection, cropPlacement, fitCrop, panCrop, portraitWindow, zoomCrop } from './crop';

describe('crop math', () => {
  const crop = { x: 20, y: 30, width: 40, height: 40 };

  it('clamps a pan that would leave the frame', () => {
    expect(panCrop(crop, -100, -100)).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(panCrop(crop, 100, 100)).toEqual({ x: 60, y: 60, width: 40, height: 40 });
  });

  it('zooms around the center and clamps to the crop limits', () => {
    const zoomed = zoomCrop(crop, 0.5);
    expect(zoomed.width).toBe(20);
    expect(zoomed.x).toBe(30);
    expect(zoomed.y).toBe(40);
    expect(zoomCrop(crop, 0.01).width).toBe(MIN_CROP);
    expect(zoomCrop(crop, 10).width).toBe(100);
    expect(fitCrop({ x: -20, y: 200, width: 4, height: 80 })).toEqual({ x: 0, y: 88, width: MIN_CROP, height: MIN_CROP });
  });

  it('builds a square selection that stays on the frame', () => {
    const selected = cropFromSelection({ x: 10, y: 10 }, { x: 12, y: 70 });
    expect(selected.width).toBeGreaterThanOrEqual(MIN_CROP);
    expect(selected.height).toBe(selected.width);
    expect(selected.x).toBeGreaterThanOrEqual(0);
    expect(selected.y).toBeGreaterThanOrEqual(0);
    expect(selected.x + selected.width).toBeLessThanOrEqual(100);
  });

  it('cuts a portrait window with unequal placement scales', () => {
    const portrait = portraitWindow(crop, 1);
    expect(portrait.height).toBeCloseTo(40);
    expect(portrait.width).toBeCloseTo(40 * PORTRAIT_CUT);
    const tight = portraitWindow(crop, TIGHT_PORTRAIT_SCALE);
    expect(tight.height).toBeCloseTo(40 * TIGHT_PORTRAIT_SCALE);
    const placement = cropPlacement(portrait);
    expect(placement.scaleX).not.toBeCloseTo(placement.scaleY);
  });
});
