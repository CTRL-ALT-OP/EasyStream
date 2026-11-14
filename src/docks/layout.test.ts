import { describe, expect, it } from 'vitest';
import type { DockBlockDefinition } from './types';
import { canApplyDockDrop, createDefaultDockState, resolveDockLayout, rowSplitterWidth, splitterFloor } from './layout';

const blocks: DockBlockDefinition[] = [
  { id: 'preview', title: 'Preview', priority: 5, minWidth: 300, minHeight: 200, defaultRow: 0, defaultIndex: 0 },
  { id: 'ptz', title: 'PTZ', priority: 1, minWidth: 200, minHeight: 180, defaultRow: 0, defaultIndex: 1 },
  { id: 'lighting', title: 'Lighting', priority: 2, minWidth: 180, minHeight: 120, defaultRow: 1, defaultIndex: 0 },
  { id: 'output', title: 'Output', priority: 4, minWidth: 220, minHeight: 140, defaultRow: 1, defaultIndex: 1 },
  { id: 'media', title: 'Media', priority: 3, minWidth: 200, minHeight: 140, defaultRow: 1, defaultIndex: 2 }
];

describe('dock layout', () => {
  it('gives leftover space to the highest priority cell when minimums fit', () => {
    const state = createDefaultDockState(blocks);
    const [row] = resolveDockLayout(state, blocks, { width: 800, height: 700 });
    const available = 800 - rowSplitterWidth(row);
    const widths = row.cells.map((cell) => cell.width);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(available);
    expect(widths[0]).toBeGreaterThan(300);
    expect(widths[1]).toBeCloseTo(200);
  });

  it('distributes a shortfall below the declared minimums so the row matches the board', () => {
    const state = createDefaultDockState(blocks);
    const [row] = resolveDockLayout(state, blocks, { width: 250, height: 700 });
    const available = 250 - rowSplitterWidth(row);
    expect(row.cells.reduce((sum, cell) => sum + cell.width, 0)).toBeCloseTo(available);
    expect(row.cells.every((cell) => cell.width < cell.minWidth)).toBe(true);
    expect(row.cells.every((cell) => cell.width > 0)).toBe(true);
  });

  it('refuses a drop that cannot fit at the declared minimums', () => {
    const state = createDefaultDockState(blocks);
    const cramped = { width: 400, height: 700 };
    const roomy = { width: 1400, height: 800 };
    expect(canApplyDockDrop(state, { type: 'insert', rowIndex: 0, cellIndex: 2 }, 'lighting', blocks, cramped)).toBe(false);
    expect(canApplyDockDrop(state, { type: 'insert', rowIndex: 0, cellIndex: 2 }, 'lighting', blocks, roomy)).toBe(true);
  });

  it('keeps a splitter inside a pair that is already below its minimums', () => {
    expect(splitterFloor(300, 200, 240)).toBe(120);
    expect(splitterFloor(300, 200, 600)).toBe(300);
  });
});
