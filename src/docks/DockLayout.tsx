import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyDockDrop,
  canApplyDockDrop,
  cellMinWidth,
  createDefaultDockState,
  createDockBlockMap,
  isBlockOpen,
  removeBlockFromDockState,
  resolveDockLayout,
  rowMinHeight,
  setDockCellActiveBlock
} from './layout';
import type { DockBlockDefinition, DockBlockId, DockDimensions, DockDropTarget, DockLayoutState } from './types';

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

const cloneLayoutState = (state: DockLayoutState): DockLayoutState => ({
  rows: state.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, blockIds: [...cell.blockIds] })) }))
});

export function DockLayout({ blocks }: DockLayoutProps) {
  const [layout, setLayout] = useState<DockLayoutState>(() => createDefaultDockState(blocks));
  const [dimensions, setDimensions] = useState<DockDimensions>({ width: 0, height: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const blockMap = useMemo(() => createDockBlockMap(blocks), [blocks]);
  const resolvedRows = useMemo(() => resolveDockLayout(layout, blocks, dimensions), [blocks, dimensions, layout]);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    const node = boardRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDimensions({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!drag) {
      return;
    }

    const updateTarget = (clientX: number, clientY: number) => {
      const target = targetFromPoint(clientX, clientY, drag.blockId, layout, blocks, dimensions);
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
  }, [blocks, dimensions, drag, layout]);

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
    const target = defaultTargetForBlock(blockId, layout, blocks, dimensions);
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
              const disabled = !open && defaultTargetForBlock(block.id, layout, blocks, dimensions) === null;

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

export const getDockMinimumWidth = (blocks: DockBlockDefinition[]) => {
  const blockMap = createDockBlockMap(blocks);
  const state = createDefaultDockState(blocks);
  return Math.max(...state.rows.map((row) => row.cells.reduce((total, cell) => total + cellMinWidth(cell, blockMap), 0)));
};

export const getDockMinimumHeight = (blocks: DockBlockDefinition[]) => {
  const blockMap = createDockBlockMap(blocks);
  const state = createDefaultDockState(blocks);
  return state.rows.reduce((total, row) => total + rowMinHeight(row, blockMap), 0);
};
