import type { DockBlockDefinition } from './types';

export const dockBlocks: DockBlockDefinition[] = [
  {
    id: 'preview',
    title: 'Preview',
    priority: 5,
    minWidth: 460,
    minHeight: 260,
    defaultRow: 0,
    defaultIndex: 0
  },
  {
    id: 'ptz',
    title: 'PTZ',
    priority: 2,
    minWidth: 230,
    minHeight: 300,
    defaultRow: 0,
    defaultIndex: 1
  },
  {
    id: 'lighting',
    title: 'Lighting',
    priority: 1,
    minWidth: 250,
    minHeight: 300,
    defaultRow: 0,
    defaultIndex: 2
  },
  {
    id: 'output',
    title: 'Output',
    priority: 4,
    minWidth: 480,
    minHeight: 300,
    defaultRow: 1,
    defaultIndex: 0
  },
  {
    id: 'media',
    title: 'Media',
    priority: 3,
    minWidth: 440,
    minHeight: 300,
    defaultRow: 1,
    defaultIndex: 1
  }
];
