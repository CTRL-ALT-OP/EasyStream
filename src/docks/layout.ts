import type { DockBlockDefinition, DockBlockId, DockCell, DockDimensions, DockDropTarget, DockLayoutState, DockRow } from './types';

export const DOCK_TAB_HEIGHT = 30;
export const DOCK_SPLITTER_SIZE = 1;

export type DockBlockMap = Map<DockBlockId, DockBlockDefinition>;

export type ResolvedDockCell = Omit<DockCell, 'size'> & {
  size: number;
  minWidth: number;
  minHeight: number;
  width: number;
  priority: number;
};

export type ResolvedDockRow = Omit<DockRow, 'cells' | 'size'> & {
  cells: ResolvedDockCell[];
  size: number;
  minHeight: number;
  height: number;
  priority: number;
};

export const createDockBlockMap = (blocks: DockBlockDefinition[]) => new Map(blocks.map((block) => [block.id, block]));

export const createDefaultDockState = (blocks: DockBlockDefinition[]): DockLayoutState => {
  const rows: DockRow[] = [
    { id: 'row-0', cells: [], size: 0 },
    { id: 'row-1', cells: [], size: 0 }
  ];

  for (const block of [...blocks].sort((a, b) => a.defaultRow - b.defaultRow || a.defaultIndex - b.defaultIndex)) {
    const row = rows[block.defaultRow] ?? rows[0];
    row.cells.splice(block.defaultIndex, 0, {
      id: `cell-${block.id}`,
      blockIds: [block.id],
      activeBlockId: block.id,
      size: block.minWidth
    });
    row.size = Math.max(row.size, block.minHeight);
  }

  return { rows };
};

export const cellMinWidth = (cell: DockCell, blockMap: DockBlockMap) =>
  Math.max(...cell.blockIds.map((blockId) => blockMap.get(blockId)?.minWidth ?? 0));

export const cellMinHeight = (cell: DockCell, blockMap: DockBlockMap) =>
  Math.max(...cell.blockIds.map((blockId) => blockMap.get(blockId)?.minHeight ?? 0)) + (cell.blockIds.length > 1 ? DOCK_TAB_HEIGHT : 0);

export const cellPriority = (cell: DockCell, blockMap: DockBlockMap) =>
  Math.max(...cell.blockIds.map((blockId) => blockMap.get(blockId)?.priority ?? 0));

export const rowMinWidth = (row: DockRow, blockMap: DockBlockMap) => row.cells.reduce((total, cell) => total + cellMinWidth(cell, blockMap), 0);

export const rowSplitterWidth = (row: DockRow) => Math.max(0, row.cells.length - 1) * DOCK_SPLITTER_SIZE;

export const rowMinHeight = (row: DockRow, blockMap: DockBlockMap) =>
  row.cells.length === 0 ? 0 : Math.max(...row.cells.map((cell) => cellMinHeight(cell, blockMap)));

export const rowPriority = (row: DockRow, blockMap: DockBlockMap) =>
  row.cells.length === 0 ? 0 : Math.max(...row.cells.map((cell) => cellPriority(cell, blockMap)));

export type FitSpan = {
  min: number;
  size: number;
  priority: number;
};

const shrinkToFit = (items: FitSpan[], available: number) => {
  let total = items.reduce((sum, item) => sum + item.size, 0);
  if (total <= available) {
    return;
  }

  for (const item of [...items].sort((a, b) => a.priority - b.priority)) {
    const reducible = item.size - item.min;
    const shrink = Math.min(reducible, total - available);
    item.size -= shrink;
    total -= shrink;

    if (total <= available) {
      return;
    }
  }
};

const giveRemainderToPriority = (items: FitSpan[], available: number) => {
  const total = items.reduce((sum, item) => sum + item.size, 0);
  const extra = available - total;
  if (extra <= 0 || items.length === 0) {
    return;
  }

  const winner = [...items].sort((a, b) => b.priority - a.priority)[0];
  winner.size += extra;
};

/** Fit spans into available space. Declared minimums win when they fit; otherwise the shortfall is shared so the painted sum matches the board. */
export const fitSpans = (items: FitSpan[], available: number) => {
  if (items.length === 0) {
    return;
  }

  const room = Math.max(0, available);
  if (room === 0) {
    items.forEach((item) => {
      item.size = 0;
    });
    return;
  }

  const minSum = items.reduce((sum, item) => sum + item.min, 0);
  if (minSum > room) {
    const weights = items.map((item) => Math.max(item.size, item.min, 0));
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    let assigned = 0;
    items.forEach((item, index) => {
      if (index === items.length - 1) {
        item.size = Math.max(0, room - assigned);
        return;
      }

      const share = weightSum === 0 ? room / items.length : (room * weights[index]) / weightSum;
      item.size = share;
      assigned += share;
    });
    return;
  }

  items.forEach((item) => {
    item.size = Math.max(item.size, item.min);
  });
  shrinkToFit(items, room);
  giveRemainderToPriority(items, room);
};

/** Minimum a splitter may apply. Declared minimums are kept when the pair fits; otherwise the pair stays inside the space it already occupies. */
export const splitterFloor = (spanMin: number, peerMin: number, available: number) => {
  if (!(available > 0)) {
    return 0;
  }

  if (spanMin + peerMin <= available) {
    return spanMin;
  }

  return Math.min(spanMin, available / 2);
};

export const resolveDockLayout = (state: DockLayoutState, blocks: DockBlockDefinition[], dimensions: DockDimensions): ResolvedDockRow[] => {
  const blockMap = createDockBlockMap(blocks);
  const rows = state.rows.map((row) => {
    const availableRowWidth = Math.max(0, dimensions.width - rowSplitterWidth(row));
    const cells = row.cells.map((cell) => {
      const minWidth = cellMinWidth(cell, blockMap);
      return {
        ...cell,
        minWidth,
        minHeight: cellMinHeight(cell, blockMap),
        width: cell.size,
        priority: cellPriority(cell, blockMap)
      };
    });

    const adjustedCells = cells.map((cell) => ({ ...cell }));
    const shrinkItems = adjustedCells.map((cell) => ({ min: cell.minWidth, size: cell.width, priority: cell.priority, cell }));
    fitSpans(shrinkItems, availableRowWidth);
    shrinkItems.forEach((item) => {
      item.cell.width = item.size;
    });

    const minHeight = rowMinHeight(row, blockMap);
    return {
      ...row,
      cells: adjustedCells,
      minHeight,
      height: row.size,
      priority: rowPriority(row, blockMap)
    };
  });

  const availableHeight = Math.max(0, dimensions.height - Math.max(0, rows.filter((row) => row.cells.length > 0).length - 1) * DOCK_SPLITTER_SIZE);
  const rowItems = rows.map((row) => ({ min: row.minHeight, size: row.height, priority: row.priority, row }));
  fitSpans(rowItems, availableHeight);
  rowItems.forEach((item) => {
    item.row.height = item.size;
  });

  return rows;
};

export const removeBlockFromDockState = (state: DockLayoutState, blockId: DockBlockId): DockLayoutState => ({
  rows: state.rows.map((row) => ({
    ...row,
    cells: row.cells.flatMap((cell) => {
      if (!cell.blockIds.includes(blockId)) {
        return [cell];
      }

      const blockIds = cell.blockIds.filter((item) => item !== blockId);
      if (blockIds.length === 0) {
        return [];
      }

      return [
        {
          ...cell,
          blockIds,
          activeBlockId: cell.activeBlockId === blockId ? blockIds[0] : cell.activeBlockId
        }
      ];
    })
  }))
});

export const isBlockOpen = (state: DockLayoutState, blockId: DockBlockId) =>
  state.rows.some((row) => row.cells.some((cell) => cell.blockIds.includes(blockId)));

const normalizeDropTargetAfterRemoval = (state: DockLayoutState, target: DockDropTarget, blockId: DockBlockId): DockDropTarget => {
  const sourceRowIndex = state.rows.findIndex((row) => row.cells.some((cell) => cell.blockIds.includes(blockId)));
  if (sourceRowIndex !== target.rowIndex) {
    return target;
  }

  const sourceCellIndex = state.rows[sourceRowIndex]?.cells.findIndex((cell) => cell.blockIds.includes(blockId)) ?? -1;
  const sourceCell = state.rows[sourceRowIndex]?.cells[sourceCellIndex];
  if (!sourceCell || sourceCell.blockIds.length > 1 || sourceCellIndex >= target.cellIndex) {
    return target;
  }

  return { ...target, cellIndex: target.cellIndex - 1 };
};

export const applyDockDrop = (
  state: DockLayoutState,
  target: DockDropTarget,
  blockId: DockBlockId,
  blocks: DockBlockDefinition[]
): DockLayoutState => {
  const block = blocks.find((item) => item.id === blockId);
  if (!block) {
    return state;
  }

  const normalizedTarget = normalizeDropTargetAfterRemoval(state, target, blockId);
  const next = removeBlockFromDockState(state, blockId);
  const rows = next.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, blockIds: [...cell.blockIds] })) }));
  const row = rows[normalizedTarget.rowIndex];
  if (!row) {
    return state;
  }

  if (normalizedTarget.type === 'stack') {
    const cell = row.cells[normalizedTarget.cellIndex];
    if (!cell) {
      return state;
    }

    cell.blockIds.push(blockId);
    cell.activeBlockId = blockId;
    cell.size = Math.max(cell.size, block.minWidth);
    return { rows };
  }

  row.cells.splice(normalizedTarget.cellIndex, 0, {
    id: `cell-${blockId}-${Date.now()}`,
    blockIds: [blockId],
    activeBlockId: blockId,
    size: block.minWidth
  });
  row.size = Math.max(row.size, block.minHeight);

  return { rows };
};

export const canApplyDockDrop = (
  state: DockLayoutState,
  target: DockDropTarget,
  blockId: DockBlockId,
  blocks: DockBlockDefinition[],
  dimensions: DockDimensions
) => {
  const block = blocks.find((item) => item.id === blockId);
  if (!block || dimensions.width <= 0 || dimensions.height <= 0) {
    return false;
  }

  const normalizedTarget = normalizeDropTargetAfterRemoval(state, target, blockId);
  const next = removeBlockFromDockState(state, blockId);
  const row = next.rows[normalizedTarget.rowIndex];
  if (!row) {
    return false;
  }

  if (normalizedTarget.type === 'stack' && !row.cells[normalizedTarget.cellIndex]) {
    return false;
  }

  if (normalizedTarget.type === 'insert' && normalizedTarget.cellIndex > row.cells.length) {
    return false;
  }

  const candidate = applyDockDrop(state, target, blockId, blocks);
  const blockMap = createDockBlockMap(blocks);
  return (
    candidate.rows.every((candidateRow) => rowMinWidth(candidateRow, blockMap) + rowSplitterWidth(candidateRow) <= dimensions.width) &&
    candidate.rows.reduce((total, candidateRow) => total + rowMinHeight(candidateRow, blockMap), 0) +
      Math.max(0, candidate.rows.filter((candidateRow) => candidateRow.cells.length > 0).length - 1) * DOCK_SPLITTER_SIZE <=
      dimensions.height
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const normalizeStoredDockLayout = (value: unknown, blocks: DockBlockDefinition[]): DockLayoutState | null => {
  const candidate = isRecord(value) && value.version === 1 && 'layout' in value ? value.layout : value;
  if (!isRecord(candidate) || !Array.isArray(candidate.rows)) {
    return null;
  }

  const defaultLayout = createDefaultDockState(blocks);
  if (candidate.rows.length !== defaultLayout.rows.length) {
    return null;
  }

  const validBlockIds = new Set(blocks.map((block) => block.id));
  const usedBlockIds = new Set<DockBlockId>();
  const rows: DockRow[] = [];

  for (const [rowIndex, storedRow] of candidate.rows.entries()) {
    if (!isRecord(storedRow) || !Array.isArray(storedRow.cells)) {
      return null;
    }

    const rowSize = finiteNumber(storedRow.size);
    const row: DockRow = {
      id: typeof storedRow.id === 'string' ? storedRow.id : (defaultLayout.rows[rowIndex]?.id ?? `row-${rowIndex}`),
      size: Math.max(0, rowSize ?? defaultLayout.rows[rowIndex]?.size ?? 0),
      cells: []
    };

    for (const storedCell of storedRow.cells) {
      if (!isRecord(storedCell) || !Array.isArray(storedCell.blockIds)) {
        return null;
      }

      const blockIds = storedCell.blockIds.filter((blockId): blockId is DockBlockId => {
        if (typeof blockId !== 'string' || !validBlockIds.has(blockId as DockBlockId) || usedBlockIds.has(blockId as DockBlockId)) {
          return false;
        }

        usedBlockIds.add(blockId as DockBlockId);
        return true;
      });

      if (blockIds.length === 0) {
        continue;
      }

      const cellSize = finiteNumber(storedCell.size);
      const activeBlockId =
        typeof storedCell.activeBlockId === 'string' && blockIds.includes(storedCell.activeBlockId as DockBlockId)
          ? (storedCell.activeBlockId as DockBlockId)
          : blockIds[0];

      row.cells.push({
        id: typeof storedCell.id === 'string' ? storedCell.id : `cell-${blockIds.join('-')}`,
        blockIds,
        activeBlockId,
        size: Math.max(0, cellSize ?? 0)
      });
    }

    rows.push(row);
  }

  return { rows };
};

export const setDockCellActiveBlock = (state: DockLayoutState, rowIndex: number, cellIndex: number, blockId: DockBlockId): DockLayoutState => ({
  rows: state.rows.map((row, currentRowIndex) =>
    currentRowIndex === rowIndex
      ? {
          ...row,
          cells: row.cells.map((cell, currentCellIndex) => (currentCellIndex === cellIndex ? { ...cell, activeBlockId: blockId } : cell))
        }
      : row
  )
});
