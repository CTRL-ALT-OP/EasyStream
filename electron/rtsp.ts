import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { decodePng } from '../shared/png';

const require = createRequire(import.meta.url);

const ffmpegBinary = (): string | null => {
  try {
    const binary = require('ffmpeg-static') as string | null;
    return typeof binary === 'string' && binary ? binary : null;
  } catch {
    return null;
  }
};

export const grabPng = (url: string) =>
  new Promise<Buffer>((resolve, reject) => {
    const ffmpeg = ffmpegBinary();
    if (!ffmpeg) {
      reject(new Error('ffmpeg is not available'));
      return;
    }

    const child = spawn(
      ffmpeg,
      ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-i', url, '-frames:v', '1', '-vf', 'scale=min(1920\\,iw):-2', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'],
      { windowsHide: true }
    );
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Timed out grabbing a camera frame'));
    }, 8000);
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      const buffer = Buffer.concat(chunks);
      if (code === 0 && buffer.length > 8) {
        resolve(buffer);
        return;
      }
      reject(new Error(Buffer.concat(errors).toString().trim() || 'Could not grab a camera frame'));
    });
  });

const jpegSize = (buffer: Buffer) => {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1] ?? 0;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += marker === 0xd9 ? 0 : 2;
      if (marker === 0xd9) {
        break;
      }
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
};

export class MjpegFeed {
  private child: ChildProcess | null = null;
  private pending: Buffer = Buffer.alloc(0);
  private stopped = true;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(
    private url: string,
    private readonly onFrame: (jpeg: Buffer, width: number, height: number) => void,
    private readonly onStatus: (live: boolean, message: string) => void
  ) {}

  setUrl(url: string) {
    const changed = this.url !== url;
    this.url = url;
    if (changed && !this.stopped) {
      this.spawn();
    }
  }

  start() {
    this.stopped = false;
    this.spawn();
  }

  stop() {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.child?.kill();
    this.child = null;
    this.pending = Buffer.alloc(0);
  }

  private spawn() {
    this.child?.kill();
    const ffmpeg = ffmpegBinary();
    if (!ffmpeg) {
      this.onStatus(false, 'ffmpeg is not available');
      return;
    }

    const child = spawn(
      ffmpeg,
      ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-fflags', 'nobuffer', '-flags', 'low_delay', '-i', this.url, '-an', '-vf', 'scale=960:-2', '-r', '12', '-q:v', '8', '-f', 'mjpeg', 'pipe:1'],
      { windowsHide: true }
    );
    this.child = child;
    child.stdout.on('data', (chunk: Buffer) => this.push(chunk));
    child.on('error', (error) => this.onStatus(false, error.message));
    child.on('exit', () => {
      if (this.child !== child) {
        return;
      }
      this.child = null;
      this.onStatus(false, 'Camera stream stopped');
      if (!this.stopped) {
        this.restartTimer = setTimeout(() => this.spawn(), 2000);
      }
    });
  }

  private push(chunk: Buffer) {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    while (this.pending.length > 4) {
      const start = this.pending.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) {
        this.pending = Buffer.alloc(0);
        return;
      }
      if (start > 0) {
        this.pending = this.pending.subarray(start);
      }
      const end = this.pending.indexOf(Buffer.from([0xff, 0xd9]), 2);
      if (end < 0) {
        return;
      }
      const frame = this.pending.subarray(0, end + 2);
      this.pending = this.pending.subarray(end + 2);
      const size = jpegSize(frame);
      if (!size) {
        continue;
      }
      this.onFrame(frame, size.width, size.height);
      this.onStatus(true, '');
    }
  }
}

export const readPng = async (url: string) => decodePng(await grabPng(url));
