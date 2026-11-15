import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePng } from './png';

const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, body, Buffer.alloc(4)]);
};

describe('png frames', () => {
  it('decodes an 8-bit RGB image', () => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const raw = Buffer.from([0, 255, 0, 0, 0, 0, 255]);
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0))
    ]);
    const image = decodePng(png);
    expect(image.width).toBe(2);
    expect(image.height).toBe(1);
    expect([...image.rgb]).toEqual([255, 0, 0, 0, 0, 255]);
  });
});
