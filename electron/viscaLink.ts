import dgram from 'node:dgram';
import type { CameraPose } from '../shared/cameras';
import {
  panTiltAbsolute,
  panTiltDrive,
  panTiltHome,
  panTiltInquiry,
  panTiltRelative,
  ViscaCommandError,
  ViscaSession,
  zoomDirect,
  zoomInquiry,
  zoomStop,
  zoomVariable,
  type DriveDirection,
  type ViscaWait
} from '../shared/visca';

export class ViscaLink {
  private socket: dgram.Socket | null = null;
  private session: ViscaSession | null = null;

  connect(host: string, port: number) {
    this.close();
    const socket = dgram.createSocket('udp4');
    this.socket = socket;
    const session = new ViscaSession({
      send: (packet) => {
        socket.send(packet, port, host);
      }
    });
    this.session = session;
    socket.on('message', (message) => session.handlePacket(new Uint8Array(message.buffer, message.byteOffset, message.byteLength)));
    socket.on('error', () => undefined);
  }

  close() {
    this.socket?.close();
    this.socket = null;
    this.session = null;
  }

  get connected() {
    return this.session !== null;
  }

  private transact(packet: Uint8Array, wait: ViscaWait, timeoutMs?: number) {
    if (!this.session) {
      return Promise.reject(new Error('VISCA is offline'));
    }
    return this.session.transact(packet, wait, timeoutMs);
  }

  drive(direction: DriveDirection, panSpeed: number, tiltSpeed: number) {
    return this.transact(panTiltDrive(panSpeed, tiltSpeed, direction), 'ack', 800);
  }

  absolute(pan: number, tilt: number, panSpeed: number, tiltSpeed: number, wait: 'ack' | 'complete') {
    return this.transact(panTiltAbsolute(panSpeed, tiltSpeed, pan, tilt), wait, wait === 'complete' ? 8000 : 800);
  }

  relative(pan: number, tilt: number, panSpeed: number, tiltSpeed: number) {
    return this.transact(panTiltRelative(panSpeed, tiltSpeed, pan, tilt), 'ack', 800);
  }

  zoom(direction: 'tele' | 'wide', speed: number) {
    return this.transact(zoomVariable(direction, speed), 'ack', 800);
  }

  stopZoom() {
    return this.transact(zoomStop(), 'ack', 800);
  }

  zoomTo(position: number, wait: 'ack' | 'complete') {
    return this.transact(zoomDirect(position), wait, wait === 'complete' ? 8000 : 800);
  }

  home() {
    return this.transact(panTiltHome(), 'ack', 800);
  }

  async pose(): Promise<CameraPose> {
    const panTilt = await this.transact(panTiltInquiry(), 'inquiry', 800);
    const zoom = await this.transact(zoomInquiry(), 'inquiry', 800);
    if (panTilt.kind !== 'panTilt' || zoom.kind !== 'zoom') {
      throw new Error('Unexpected VISCA inquiry');
    }
    return { pan: panTilt.pan, tilt: panTilt.tilt, zoom: zoom.position };
  }
}

export const isRejectedMove = (error: unknown) => error instanceof ViscaCommandError && error.code === 0x41;
