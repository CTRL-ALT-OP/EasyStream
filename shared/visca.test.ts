import { describe, expect, it } from 'vitest';
import { bytesToHex, panTiltAbsolute, panTiltDrive, parseViscaReply, ViscaSession, zoomDirect, zoomVariable } from './visca';

const hex = (value: string) => Uint8Array.from(value.match(/../g)!.map((byte) => Number.parseInt(byte, 16)));

describe('VISCA encoding', () => {
  it('builds direction commands with the PTZOptics bytes', () => {
    expect(bytesToHex(panTiltDrive(7, 7, 'left'))).toBe('8101060107070103ff');
    expect(bytesToHex(panTiltDrive(10, 12, 'upRight'))).toBe('810106010a0c0201ff');
    expect(bytesToHex(panTiltDrive(0, 0, 'stop'))).toBe('8101060100000303ff');
  });

  it('packs absolute pan and tilt into nibbles, including negative positions', () => {
    expect(bytesToHex(panTiltAbsolute(10, 10, 0x1234, 0))).toBe('810106020a0a0102030400000000ff');
    expect(bytesToHex(panTiltAbsolute(1, 1, -256, 10))).toBe('8101060201010f0f00000000000aff');
  });

  it('packs absolute zoom as four nibbles', () => {
    expect(bytesToHex(zoomDirect(0x03e8))).toBe('8101044700030e08ff');
    expect(bytesToHex(zoomVariable('tele', 3))).toBe('8101040723ff');
    expect(bytesToHex(zoomVariable('wide', 5))).toBe('8101040735ff');
  });

  it('reads pan, tilt, and zoom inquiries', () => {
    expect(parseViscaReply(hex('9050010203040000000aff'))).toEqual({ kind: 'panTilt', pan: 0x1234, tilt: 10 });
    expect(parseViscaReply(hex('90500f0f00000000000aff'))).toEqual({ kind: 'panTilt', pan: -256, tilt: 10 });
    expect(parseViscaReply(hex('905000030e08ff'))).toEqual({ kind: 'zoom', position: 0x03e8 });
    expect(parseViscaReply(hex('9041ff'))).toEqual({ kind: 'ack' });
    expect(parseViscaReply(hex('9051ff'))).toEqual({ kind: 'complete' });
    expect(parseViscaReply(hex('906004ff')).kind).toBe('cancelled');
    expect(parseViscaReply(hex('906141ff'))).toMatchObject({ kind: 'error', code: 0x41 });
  });

  it('does not treat a previous completion as the next command', async () => {
    const sent: Uint8Array[] = [];
    const session = new ViscaSession({ send: (packet) => sent.push(packet) }, 200);
    const first = session.transact(panTiltDrive(7, 7, 'left'), 'ack');
    await Promise.resolve();
    session.handlePacket(hex('9041ff'));
    await first;
    const second = session.transact(panTiltDrive(7, 7, 'stop'), 'ack');
    await Promise.resolve();
    expect(sent).toHaveLength(2);
    session.handlePacket(hex('9051ff'));
    let settled = false;
    const done = second.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    session.handlePacket(hex('9042ff'));
    await done;
  });
});
