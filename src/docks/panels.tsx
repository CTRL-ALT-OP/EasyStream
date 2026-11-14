import type { ComponentType } from 'react';
import { CameraPreview } from '../components/CameraPreview';
import { MediaControls } from '../components/MediaControls';
import { PtzLightingControls, PtzMainControls } from '../components/PtzDockControls';
import { StreamingControls } from '../components/StreamingControls';
import type { DockBlockId } from './types';

export const dockPanels: Record<DockBlockId, ComponentType> = {
  preview: CameraPreview,
  ptz: PtzMainControls,
  lighting: PtzLightingControls,
  output: StreamingControls,
  media: MediaControls
};
