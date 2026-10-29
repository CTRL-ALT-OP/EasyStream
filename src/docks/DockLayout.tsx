import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  applyDockDrop,
  canApplyDockDrop,
  createDefaultDockState,
  createDockBlockMap,
  isBlockOpen,
  removeBlockFromDockState,
  resolveDockLayout,
  setDockCellActiveBlock
} from './layout';
import type { DockBlockDefinition, DockBlockId, DockDimensions, DockDropTarget, DockLayoutState, DockRow } from './types';

type DragState = {
  blockId: DockBlockId;
  target: DockDropTarget | null;
};

type ResizeState =
  | {
      type: 'column';
      rowIndex: number;
      leftIndex: number;
      startX: number;
      leftSize: number;
      rightSize: number;
      leftMin: number;
      rightMin: number;
    }
  | {
      type: 'row';
      startY: number;
      topSize: number;
      bottomSize: number;
      topMin: number;
      bottomMin: number;
    };

type DockLayoutProps = {
  blocks: DockBlockDefinition[];
};

const interactiveSelector = 'button, input, select, textarea, a, [role="button"], [contenteditable="true"], .dock-close-button';
const DOCK_HEADER_DRAG_HEIGHT = 42;
const DOCK_MENU_BAR_HEIGHT = 32;
const DOCK_LAYOUT_STORAGE_KEY = 'easystream.dockLayout.v1';
const EMPTY_DOCK_DIMENSIONS: DockDimensions = { width: 0, height: 0 };

const estimateBoardSize = (): DockDimensions | null => {
  const width = window.innerWidth;
  const height = window.innerHeight - DOCK_MENU_BAR_HEIGHT;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
};

const sameBoardSize = (current: DockDimensions | null, width: number, height: number) =>
  current !== null && Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5;

const cloneLayoutState = (state: DockLayoutState): DockLayoutState => ({
  rows: state.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, blockIds: [...cell.blockIds] })) }))
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const normalizeStoredDockLayout = (value: unknown, blocks: DockBlockDefinition[]): DockLayoutState | null => {
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

const readStoredDockLayout = (blocks: DockBlockDefinition[]) => {
  try {
    const stored = window.localStorage.getItem(DOCK_LAYOUT_STORAGE_KEY);
    return stored ? normalizeStoredDockLayout(JSON.parse(stored), blocks) : null;
  } catch {
    return null;
  }
};

const saveDockLayout = (layout: DockLayoutState) => {
  try {
    window.localStorage.setItem(DOCK_LAYOUT_STORAGE_KEY, JSON.stringify({ version: 1, layout: cloneLayoutState(layout) }));
  } catch {
    // Ignore storage failures; the in-memory layout should continue to work.
  }
};

export function DockLayout({ blocks }: DockLayoutProps) {
  const [layout, setLayout] = useState<DockLayoutState>(() => readStoredDockLayout(blocks) ?? createDefaultDockState(blocks));
  const [dimensions, setDimensions] = useState<DockDimensions | null>(estimateBoardSize);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const latestLayoutRef = useRef(layout);
  const blockMap = useMemo(() => createDockBlockMap(blocks), [blocks]);
  const boardSize = dimensions ?? EMPTY_DOCK_DIMENSIONS;
  const resolvedRows = useMemo(
    () => (boardSize.width > 0 && boardSize.height > 0 ? resolveDockLayout(layout, blocks, boardSize) : []),
    [blocks, boardSize, layout]
  );

  useEffect(() => {
    latestLayoutRef.current = layout;
    const saveTimer = window.setTimeout(() => saveDockLayout(layout), 120);
    return () => window.clearTimeout(saveTimer);
  }, [layout]);

  useEffect(() => {
    const flushLayout = () => saveDockLayout(latestLayoutRef.current);
    window.addEventListener('beforeunload', flushLayout);
    return () => {
      window.removeEventListener('beforeunload', flushLayout);
      flushLayout();
    };
  }, []);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useLayoutEffect(() => {
    const node = boardRef.current;
    if (!node) {
      return;
    }

    const commitSize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) {
        return;
      }

      setDimensions((current) => (sameBoardSize(current, width, height) ? current : { width, height }));
    };

    commitSize(node.clientWidth, node.clientHeight);

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      commitSize(width, height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!drag) {
      return;
    }

    const updateTarget = (clientX: number, clientY: number) => {
      const target = targetFromPoint(clientX, clientY, drag.blockId, layout, blocks, boardSize);
      setDrag((current) => (current ? { ...current, target } : current));
    };

    const onPointerMove = (event: PointerEvent) => updateTarget(event.clientX, event.clientY);
    const onPointerUp = () => {
      const latestDrag = dragRef.current;
      setLayout((current) => (latestDrag?.target ? applyDockDrop(current, latestDrag.target, latestDrag.blockId, blocks) : current));
      setDrag(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [blocks, boardSize, drag, layout]);

  useEffect(() => {
    if (!resize) {
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      if (resize.type === 'row') {
        const delta = Math.min(Math.max(event.clientY - resize.startY, resize.topMin - resize.topSize), resize.bottomSize - resize.bottomMin);
        const topSize = resize.topSize + delta;
        const bottomSize = resize.bottomSize - delta;

        setLayout((current) => ({
          rows: current.rows.map((row, rowIndex) =>
            rowIndex === 0 ? { ...row, size: topSize } : rowIndex === 1 ? { ...row, size: bottomSize } : row
          )
        }));
        return;
      }

      const delta = Math.min(Math.max(event.clientX - resize.startX, resize.leftMin - resize.leftSize), resize.rightSize - resize.rightMin);
      const nextLeft = resize.leftSize + delta;
      const nextRight = resize.rightSize - delta;

      setLayout((current) => ({
        rows: current.rows.map((row, rowIndex) =>
          rowIndex === resize.rowIndex
            ? {
                ...row,
                cells: row.cells.map((cell, cellIndex) =>
                  cellIndex === resize.leftIndex
                    ? { ...cell, size: nextLeft }
                    : cellIndex === resize.leftIndex + 1
                      ? { ...cell, size: nextRight }
                      : cell
                )
              }
            : row
        )
      }));
    };

    const onPointerUp = () => setResize(null);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [resize]);

  const startBlockDrag = (event: React.PointerEvent, blockId: DockBlockId) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (event.button !== 0 || !target) {
      return;
    }

    if (target.closest('.dock-tab:not(.active), .dock-tab-close')) {
      return;
    }

    const activeTab = target.closest('.dock-tab.active');
    if (activeTab && !target.closest('.dock-tab-close')) {
      event.preventDefault();
      setDrag({ blockId, target: null });
      return;
    }

    if (target.closest(interactiveSelector)) {
      return;
    }

    const cell = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const hasTabs = Boolean(cell?.querySelector(':scope > .dock-tabs'));
    const topHandleHeight = DOCK_HEADER_DRAG_HEIGHT + (hasTabs ? 30 : 0);
    const inTopHandle = cell ? event.clientY - cell.getBoundingClientRect().top <= topHandleHeight : false;
    if (!inTopHandle && !target.closest('.panel-heading, .camera-header')) {
      return;
    }

    event.preventDefault();
    setDrag({ blockId, target: null });
  };

  const closeBlock = (blockId: DockBlockId) => {
    setLayout((current) => removeBlockFromDockState(current, blockId));
  };

  const openBlock = (blockId: DockBlockId) => {
    const target = defaultTargetForBlock(blockId, layout, blocks, boardSize);
    if (!target) {
      return;
    }

    setLayout((current) => applyDockDrop(current, target, blockId, blocks));
  };

  const toggleBlock = (blockId: DockBlockId) => {
    if (isBlockOpen(layout, blockId)) {
      closeBlock(blockId);
      return;
    }

    openBlock(blockId);
  };

  return (
    <main className={`dock-shell ${drag ? 'is-dragging' : ''}`}>
      <div className="dock-menu-bar">
        <details className="dock-menu">
          <summary>Docks</summary>
          <div className="dock-menu-list">
            {blocks.map((block) => {
              const open = isBlockOpen(layout, block.id);
              const disabled = !open && defaultTargetForBlock(block.id, layout, blocks, boardSize) === null;

              return (
                <button type="button" key={block.id} disabled={disabled} onClick={() => toggleBlock(block.id)}>
                  <span>{open ? '✓' : ''}</span>
                  {block.title}
                </button>
              );
            })}
          </div>
        </details>
      </div>

      <div className="dock-board" ref={boardRef}>
        {resolvedRows.map((row, rowIndex) => (
          <Fragment key={row.id}>
            <div
              className={`dock-row ${drag?.target?.type === 'insert' && drag.target.rowIndex === rowIndex && row.cells.length === 0 ? 'is-drop-target' : ''}`}
              data-dock-row={rowIndex}
              style={{ height: row.height }}
            >
              {row.cells.map((cell, cellIndex) => {
                const activeBlock = blockMap.get(cell.activeBlockId);
                const targetClass =
                  drag?.target?.rowIndex === rowIndex && drag.target.cellIndex === cellIndex
                    ? drag.target.type === 'stack'
                      ? 'is-stack-target'
                      : 'is-insert-before'
                    : drag?.target?.type === 'insert' && drag.target.rowIndex === rowIndex && drag.target.cellIndex === cellIndex + 1
                      ? 'is-insert-after'
                      : '';

                return (
                  <Fragment key={cell.id}>
                    <div
                      className={`dock-cell ${cell.blockIds.length > 1 ? 'is-stacked' : ''} ${targetClass}`}
                      data-dock-cell={cellIndex}
                      data-dock-row={rowIndex}
                      onPointerDownCapture={(event) => startBlockDrag(event, cell.activeBlockId)}
                      style={{ width: cell.width }}
                    >
                      {cell.blockIds.length > 1 && (
                        <div className="dock-tabs">
                          {cell.blockIds.map((blockId) => {
                            const block = blockMap.get(blockId);
                            return (
                              <button
                                className={`dock-tab ${blockId === cell.activeBlockId ? 'active' : ''}`}
                                type="button"
                                key={blockId}
                                onClick={() => setLayout((current) => setDockCellActiveBlock(current, rowIndex, cellIndex, blockId))}
                              >
                                <span>{block?.title}</span>
                                {blockId === cell.activeBlockId && (
                                  <span
                                    className="dock-tab-close"
                                    role="button"
                                    tabIndex={0}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      closeBlock(blockId);
                                    }}
                                  >
                                    ×
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <button className="dock-close-button" type="button" aria-label={`Close ${activeBlock?.title ?? 'dock'}`} onClick={() => closeBlock(cell.activeBlockId)}>
                        ×
                      </button>
                      <div className="dock-panel">{activeBlock?.content}</div>
                    </div>
                    {cellIndex < row.cells.length - 1 && (
                      <div
                        className="dock-splitter dock-splitter-column"
                        role="separator"
                        aria-orientation="vertical"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          const left = resolvedRows[rowIndex].cells[cellIndex];
                          const right = resolvedRows[rowIndex].cells[cellIndex + 1];
                          setResize({
                            type: 'column',
                            rowIndex,
                            leftIndex: cellIndex,
                            startX: event.clientX,
                            leftSize: left.width,
                            rightSize: right.width,
                            leftMin: left.minWidth,
                            rightMin: right.minWidth
                          });
                        }}
                      />
                    )}
                  </Fragment>
                );
              })}
            </div>
            {rowIndex === 0 && (
              <div
                className="dock-splitter dock-splitter-row"
                role="separator"
                aria-orientation="horizontal"
                onPointerDown={(event) => {
                  event.preventDefault();
                  setResize({
                    type: 'row',
                    startY: event.clientY,
                    topSize: resolvedRows[0]?.height ?? 0,
                    bottomSize: resolvedRows[1]?.height ?? 0,
                    topMin: resolvedRows[0]?.minHeight ?? 0,
                    bottomMin: resolvedRows[1]?.minHeight ?? 0
                  });
                }}
              />
            )}
          </Fragment>
        ))}
      </div>
    </main>
  );
}

const targetFromPoint = (
  clientX: number,
  clientY: number,
  blockId: DockBlockId,
  layout: DockLayoutState,
  blocks: DockBlockDefinition[],
  dimensions: DockDimensions
): DockDropTarget | null => {
  const elements = document.elementsFromPoint(clientX, clientY);
  const cellNode = elements.find((element): element is HTMLElement => element instanceof HTMLElement && element.dataset.dockCell !== undefined);

  if (cellNode) {
    const rect = cellNode.getBoundingClientRect();
    const rowIndex = Number(cellNode.dataset.dockRow);
    const cellIndex = Number(cellNode.dataset.dockCell);
    const localX = (clientX - rect.left) / rect.width;
    const proposed: DockDropTarget =
      localX > 0.25 && localX < 0.75
        ? { type: 'stack', rowIndex, cellIndex }
        : { type: 'insert', rowIndex, cellIndex: localX <= 0.5 ? cellIndex : cellIndex + 1 };

    return canApplyDockDrop(layout, proposed, blockId, blocks, dimensions) ? proposed : null;
  }

  const rowNode = elements.find((element): element is HTMLElement => element instanceof HTMLElement && element.dataset.dockRow !== undefined);
  if (!rowNode) {
    return null;
  }

  const rowIndex = Number(rowNode.dataset.dockRow);
  const row = layout.rows[rowIndex];
  const proposed: DockDropTarget = { type: 'insert', rowIndex, cellIndex: row?.cells.length ?? 0 };
  return canApplyDockDrop(layout, proposed, blockId, blocks, dimensions) ? proposed : null;
};

const defaultTargetForBlock = (
  blockId: DockBlockId,
  layout: DockLayoutState,
  blocks: DockBlockDefinition[],
  dimensions: DockDimensions
): DockDropTarget | null => {
  const block = blocks.find((item) => item.id === blockId);
  if (!block) {
    return null;
  }

  const withoutBlock = removeBlockFromDockState(layout, blockId);
  const row = withoutBlock.rows[block.defaultRow];
  const index = Math.min(block.defaultIndex, row?.cells.length ?? 0);
  const insertTarget: DockDropTarget = { type: 'insert', rowIndex: block.defaultRow, cellIndex: index };
  if (canApplyDockDrop(withoutBlock, insertTarget, blockId, blocks, dimensions)) {
    return insertTarget;
  }

  const stackIndex = Math.min(block.defaultIndex, Math.max(0, (row?.cells.length ?? 1) - 1));
  const stackTarget: DockDropTarget = { type: 'stack', rowIndex: block.defaultRow, cellIndex: stackIndex };
  return canApplyDockDrop(withoutBlock, stackTarget, blockId, blocks, dimensions) ? stackTarget : null;
};
