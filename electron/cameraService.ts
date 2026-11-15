import { BrowserWindow } from 'electron';
import type { CalibrationOutcome, CalibrationProgress, CameraConfig, CameraFrame, CameraPose, CameraStatus } from '../shared/cameras';
import { parseCameraConfig, shrinkLimits } from '../shared/cameras';
import { runCalibration } from './calibrate';
import { MjpegFeed } from './rtsp';
import { isRejectedMove, ViscaLink } from './viscaLink';
import type { DriveDirection } from '../shared/visca';

export type PtzCommandResult = { ok: boolean; message: string };

const emptyStatus = (): CameraStatus => ({ wide: 'connecting', ptz: 'connecting', visca: 'connecting', message: '' });

let config = parseCameraConfig(null);
let status = emptyStatus();
let pose: CameraPose | null = null;
let calibrating = false;
let calibrationAbort: AbortController | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let followTimer: NodeJS.Timeout | null = null;
const link = new ViscaLink();

const broadcast = (channel: string, payload: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
};

const publishStatus = (patch: Partial<CameraStatus>) => {
  status = { ...status, ...patch };
  broadcast('cameras:status', status);
};

const publishPose = (next: CameraPose) => {
  pose = next;
  broadcast('cameras:pose', next);
};

const publishConfig = () => {
  broadcast('cameras:config', config);
};

const wideFeed = new MjpegFeed(
  config.wideUrl,
  (jpeg, width, height) => broadcast('cameras:frame', { feed: 'wide', image: `data:image/jpeg;base64,${jpeg.toString('base64')}`, width, height } satisfies CameraFrame),
  (live, message) => publishStatus({ wide: live ? 'live' : status.wide === 'connecting' && !message ? 'connecting' : 'offline', message: message || status.message })
);

const ptzFeed = new MjpegFeed(
  config.ptzUrl,
  (jpeg, width, height) => broadcast('cameras:frame', { feed: 'ptz', image: `data:image/jpeg;base64,${jpeg.toString('base64')}`, width, height } satisfies CameraFrame),
  (live, message) => publishStatus({ ptz: live ? 'live' : status.ptz === 'connecting' && !message ? 'connecting' : 'offline', message: message || status.message })
);

const stopPoll = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

const inquire = async () => {
  const next = await link.pose();
  publishPose(next);
  publishStatus({ visca: 'open' });
  return next;
};

const followPose = () => {
  if (followTimer) {
    clearInterval(followTimer);
  }
  let remaining = 6;
  followTimer = setInterval(() => {
    remaining -= 1;
    void inquire().catch(() => undefined);
    if (remaining <= 0 && followTimer) {
      clearInterval(followTimer);
      followTimer = null;
    }
  }, 300);
};

const guard = () => {
  if (calibrating) {
    throw new Error('Calibration is running');
  }
  if (!link.connected) {
    throw new Error('VISCA is offline');
  }
};

const command = async (action: () => Promise<unknown>): Promise<PtzCommandResult> => {
  try {
    guard();
    await action();
    return { ok: true, message: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PTZ command failed';
    if (message.includes('timed out') || message.includes('offline')) {
      publishStatus({ visca: 'offline', message });
    }
    return { ok: false, message };
  }
};

export const startCameraService = (initial: CameraConfig) => {
  config = parseCameraConfig(initial);
  wideFeed.setUrl(config.wideUrl);
  ptzFeed.setUrl(config.ptzUrl);
  wideFeed.start();
  ptzFeed.start();
  void connectVisca();
};

export const stopCameraService = () => {
  calibrationAbort?.abort();
  stopPoll();
  if (followTimer) {
    clearInterval(followTimer);
  }
  wideFeed.stop();
  ptzFeed.stop();
  link.close();
};

export const getCameraSnapshot = () => ({ config, status, pose });

export const setCameraConfig = (value: unknown) => {
  const next = parseCameraConfig(value);
  const wideChanged = next.wideUrl !== config.wideUrl;
  const ptzChanged = next.ptzUrl !== config.ptzUrl;
  const viscaChanged = next.viscaHost !== config.viscaHost || next.viscaPort !== config.viscaPort;
  config = next;
  publishConfig();
  if (wideChanged) {
    wideFeed.setUrl(next.wideUrl);
  }
  if (ptzChanged) {
    ptzFeed.setUrl(next.ptzUrl);
  }
  if (viscaChanged) {
    void connectVisca();
  }
  return config;
};

const connectVisca = async () => {
  stopPoll();
  link.connect(config.viscaHost, config.viscaPort);
  publishStatus({ visca: 'connecting', message: '' });
  try {
    await inquire();
  } catch (error) {
    publishStatus({ visca: 'offline', message: error instanceof Error ? error.message : 'VISCA is offline' });
  }
};

export const driveCamera = (direction: DriveDirection, panSpeed: number, tiltSpeed: number) =>
  command(async () => {
    if (!['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight', 'stop'].includes(direction)) {
      throw new Error('Unknown PTZ direction');
    }
    await link.drive(direction, panSpeed, tiltSpeed);
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        void inquire().catch(() => undefined);
      }, 250);
    }
  });

export const stopCamera = () =>
  command(async () => {
    stopPoll();
    await link.drive('stop', 1, 1);
    await inquire().catch(() => undefined);
  });

export const nudgeCamera = (pan: number, tilt: number, panSpeed: number, tiltSpeed: number) =>
  command(async () => {
    await link.relative(pan, tilt, panSpeed, tiltSpeed);
    followPose();
  });

export const zoomCamera = (direction: 'tele' | 'wide', speed: number) =>
  command(async () => {
    await link.zoom(direction, speed);
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        void inquire().catch(() => undefined);
      }, 250);
    }
  });

export const stopZoomCamera = () =>
  command(async () => {
    stopPoll();
    await link.stopZoom();
    await inquire().catch(() => undefined);
  });

export const stepZoomCamera = (delta: number) =>
  command(async () => {
    const current = pose ?? (await inquire());
    const position = Math.min(config.zoomMax, Math.max(config.zoomMin, current.zoom + delta));
    await link.zoomTo(position, 'ack');
    publishPose({ ...current, zoom: position });
    followPose();
  });

export const moveCamera = (pan: number, tilt: number, zoom: number | null, panSpeed: number, tiltSpeed: number) =>
  command(async () => {
    try {
      if (zoom !== null) {
        const position = Math.min(config.zoomMax, Math.max(config.zoomMin, zoom));
        await link.zoomTo(position, 'ack');
      }
      await link.absolute(pan, tilt, panSpeed, tiltSpeed, 'ack');
    } catch (error) {
      if (isRejectedMove(error)) {
        config = shrinkLimits(config, { pan, tilt }, pose);
        publishConfig();
      }
      throw error;
    }
    followPose();
  });

export const homeCamera = () =>
  command(async () => {
    await link.home();
    followPose();
  });

export const startCalibration = () => {
  if (calibrating) {
    return { ok: false, message: 'Calibration is already running' };
  }
  if (!link.connected) {
    return { ok: false, message: 'VISCA is offline' };
  }

  calibrating = true;
  calibrationAbort = new AbortController();
  const signal = calibrationAbort.signal;
  void (async () => {
    try {
      const profile = await runCalibration(link, config, signal, {
        onProgress: (phase, completed, total) => {
          const progress: CalibrationProgress = { phase, completed, total };
          broadcast('calibration:progress', progress);
        },
        onLimits: (next) => {
          config = next;
          publishConfig();
        }
      });
      const outcome: CalibrationOutcome = profile.status === 'valid' ? { ok: true, message: profile.message, profile } : { ok: false, message: profile.message, profile: null };
      broadcast('calibration:result', outcome);
    } catch (error) {
      const outcome: CalibrationOutcome = { ok: false, message: error instanceof Error ? error.message : 'Calibration failed', profile: null };
      broadcast('calibration:result', outcome);
    } finally {
      calibrating = false;
      calibrationAbort = null;
      void inquire().catch(() => undefined);
    }
  })();
  return { ok: true, message: '' };
};

export const cancelCalibration = () => {
  calibrationAbort?.abort();
  return { ok: true, message: '' };
};
