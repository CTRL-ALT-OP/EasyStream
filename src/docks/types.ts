export type DockBlockId = 'preview' | 'ptz' | 'lighting' | 'output' | 'media';

export type DockBlockDefinition = {
  id: DockBlockId;
  title: string;
  priority: number;
  minWidth: number;
  minHeight: number;
  defaultRow: number;
  defaultIndex: number;
};

export type DockCell = {
  id: string;
  blockIds: DockBlockId[];
  activeBlockId: DockBlockId;
  size: number;
};

export type DockRow = {
  id: string;
  cells: DockCell[];
  size: number;
};

export type DockLayoutState = {
  rows: DockRow[];
};

export type DockDimensions = {
  width: number;
  height: number;
};

export type DockDropTarget =
  | { type: 'insert'; rowIndex: number; cellIndex: number }
  | { type: 'stack'; rowIndex: number; cellIndex: number };
