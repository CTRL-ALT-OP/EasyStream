import { demoAssets } from './demo/assets';
import type { CameraSource } from './types';

export const wideCameraSource: CameraSource = { kind: 'still', url: demoAssets.auditorium };
export const ptzCameraSource: CameraSource = { kind: 'still', url: demoAssets.auditorium };
export const demoVideoSource: CameraSource = { kind: 'video', url: demoAssets.video };
export const demoSlides: readonly string[] = demoAssets.slides;
