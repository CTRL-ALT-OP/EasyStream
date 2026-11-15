export type DriveDirection = 'up' | 'down' | 'left' | 'right' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight' | 'stop';

export type ViscaReply =
  | { kind: 'ack' }
  | { kind: 'complete' }
  | { kind: 'cancelled' }
  | { kind: 'error'; code: number; text: string }
  | { kind: 'panTilt'; pan: number; tilt: number }
  | { kind: 'zoom'; position: number }
  | { kind: 'unknown' };

const ERROR_TEXT: Record<number, string> = {
  0x02: 'Syntax error',
  0x03: 'Command buffer full',
  0x04: 'Command canceled',
  0x05: 'No socket',
  0x41: 'Command not executable'
};

const DRIVE_AXES: Record<DriveDirection, [number, number]> = {
  up: [0x03, 0x01],
  down: [0x03, 0x02],
  left: [0x01, 0x03],
  right: [0x02, 0x03],
  upLeft: [0x01, 0x01],
  upRight: [0x02, 0x01],
  downLeft: [0x01, 0x02],
  downRight: [0x02, 0x02],
  stop: [0x03, 0x03]
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const roundClamp = (value: number, min: number, max: number) => Math.round(clamp(value, min, max));

export const toUnsigned16 = (value: number) => {
  const signed = roundClamp(value, -32768, 32767);
  return signed < 0 ? signed + 65536 : signed;
};

export const toSigned16 = (value: number) => {
  const unsigned = roundClamp(value, 0, 65535);
  return unsigned >= 32768 ? unsigned - 65536 : unsigned;
};

const nibbles = (value: number, digits: number) => {
  const hex = roundClamp(value, 0, 16 ** digits - 1)
    .toString(16)
    .padStart(digits, '0')
    .slice(-digits);
  return [...hex].map((digit) => Number.parseInt(digit, 16));
};

const readNibbles = (bytes: Uint8Array) => {
  let value = 0;
  for (const byte of bytes) {
    value = (value << 4) | (byte & 0x0f);
  }
  return value;
};

export const panSpeedFromSlider = (slider: number) => Math.round(1 + clamp((slider - 0.6) / 1, 0, 1) * 23);

export const zoomSpeedFromSlider = (slider: number) => Math.round(clamp((slider - 0.6) / 1, 0, 1) * 7);

export const nudgeUnits = (slider: number) => 40 + panSpeedFromSlider(slider) * 8;

export const panTiltDrive = (panSpeed: number, tiltSpeed: number, direction: DriveDirection) => {
  const [panAxis, tiltAxis] = DRIVE_AXES[direction];
  return Uint8Array.of(0x81, 0x01, 0x06, 0x01, roundClamp(panSpeed, 0, 24), roundClamp(tiltSpeed, 0, 24), panAxis, tiltAxis, 0xff);
};

export const panTiltAbsolute = (panSpeed: number, tiltSpeed: number, pan: number, tilt: number) =>
  Uint8Array.of(
    0x81,
    0x01,
    0x06,
    0x02,
    roundClamp(panSpeed, 1, 24),
    roundClamp(tiltSpeed, 1, 24),
    ...nibbles(toUnsigned16(pan), 4),
    ...nibbles(toUnsigned16(tilt), 4),
    0xff
  );

export const panTiltRelative = (panSpeed: number, tiltSpeed: number, pan: number, tilt: number) =>
  Uint8Array.of(
    0x81,
    0x01,
    0x06,
    0x03,
    roundClamp(panSpeed, 1, 24),
    roundClamp(tiltSpeed, 1, 24),
    ...nibbles(toUnsigned16(pan), 4),
    ...nibbles(toUnsigned16(tilt), 4),
    0xff
  );

export const zoomVariable = (direction: 'tele' | 'wide', speed: number) => {
  const level = roundClamp(speed, 0, 7);
  return Uint8Array.of(0x81, 0x01, 0x04, 0x07, (direction === 'tele' ? 0x20 : 0x30) | level, 0xff);
};

export const zoomStop = () => Uint8Array.of(0x81, 0x01, 0x04, 0x07, 0x00, 0xff);

export const zoomDirect = (position: number) => Uint8Array.of(0x81, 0x01, 0x04, 0x47, ...nibbles(roundClamp(position, 0, 65535), 4), 0xff);

export const panTiltHome = () => Uint8Array.of(0x81, 0x01, 0x06, 0x04, 0xff);

export const panTiltInquiry = () => Uint8Array.of(0x81, 0x09, 0x06, 0x12, 0xff);

export const zoomInquiry = () => Uint8Array.of(0x81, 0x09, 0x04, 0x47, 0xff);

export const bytesToHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const parseViscaReply = (packet: Uint8Array): ViscaReply => {
  if (packet.length < 3 || packet[0] !== 0x90 || packet[packet.length - 1] !== 0xff) {
    return { kind: 'unknown' };
  }

  const header = packet[1] ?? 0;
  const group = header >> 4;
  if (group === 0x4 && packet.length === 3) {
    return { kind: 'ack' };
  }

  if (group === 0x5 && packet.length === 3) {
    return { kind: 'complete' };
  }

  if (group === 0x6 && packet.length >= 4) {
    const code = packet[2] ?? 0;
    if (code === 0x04) {
      return { kind: 'cancelled' };
    }

    return { kind: 'error', code, text: ERROR_TEXT[code] ?? 'VISCA error' };
  }

  if (header !== 0x50) {
    return { kind: 'unknown' };
  }

  const payload = packet.subarray(2, packet.length - 1);
  if (payload.length === 8) {
    return {
      kind: 'panTilt',
      pan: toSigned16(readNibbles(payload.subarray(0, 4))),
      tilt: toSigned16(readNibbles(payload.subarray(4, 8)))
    };
  }

  if (payload.length === 4) {
    return { kind: 'zoom', position: readNibbles(payload) };
  }

  return { kind: 'unknown' };
};

export type ViscaWait = 'ack' | 'complete' | 'inquiry';

export type ViscaTransport = {
  send: (packet: Uint8Array) => void;
};

type Pending = {
  wait: ViscaWait;
  resolve: (reply: ViscaReply) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  sawAck: boolean;
};

export class ViscaSession {
  private pending: Pending | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private discardCompletions = 0;

  constructor(
    private readonly transport: ViscaTransport,
    private readonly timeoutMs = 1500
  ) {}

  handlePacket(packet: Uint8Array) {
    const reply = parseViscaReply(packet);
    if (reply.kind === 'complete' && this.discardCompletions > 0) {
      this.discardCompletions -= 1;
      return;
    }

    const pending = this.pending;
    if (!pending) {
      return;
    }

    if (reply.kind === 'ack') {
      pending.sawAck = true;
      if (pending.wait === 'ack') {
        this.finish(reply);
      }
      return;
    }

    if (reply.kind === 'complete') {
      if (pending.wait === 'inquiry') {
        return;
      }

      this.finish(reply);
      return;
    }

    if (reply.kind === 'cancelled') {
      this.finish(reply);
      return;
    }

    if (reply.kind === 'error') {
      this.fail(new ViscaCommandError(reply.text, reply.code));
      return;
    }

    if ((reply.kind === 'panTilt' || reply.kind === 'zoom') && pending.wait === 'inquiry') {
      this.finish(reply);
    }
  }

  transact(packet: Uint8Array, wait: ViscaWait, timeoutMs = this.timeoutMs) {
    const run = () =>
      new Promise<ViscaReply>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending = null;
          reject(new Error('VISCA reply timed out'));
        }, timeoutMs);
        this.pending = { wait, resolve, reject, timer, sawAck: false };
        try {
          this.transport.send(packet);
        } catch (error) {
          clearTimeout(timer);
          this.pending = null;
          reject(error instanceof Error ? error : new Error('VISCA send failed'));
        }
      });

    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private finish(reply: ViscaReply) {
    const pending = this.pending;
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending = null;
    if (pending.wait === 'ack' && pending.sawAck) {
      this.discardCompletions += 1;
    }
    pending.resolve(reply);
  }

  private fail(error: Error) {
    const pending = this.pending;
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending = null;
    pending.reject(error);
  }
}

export class ViscaCommandError extends Error {
  constructor(
    message: string,
    readonly code: number
  ) {
    super(message);
    this.name = 'ViscaCommandError';
  }
}
