import { inflateSync } from 'node:zlib';

export type DecodedImage = {
  width: number;
  height: number;
  rgb: Uint8Array;
};

const paeth = (left: number, up: number, upperLeft: number) => {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return upDistance <= upperLeftDistance ? up : upperLeft;
};

export const decodePng = (buffer: Buffer): DecodedImage => {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Camera frame is not a PNG');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 2;
  const bitDepth = { value: 8 };
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth.value = data[8] ?? 8;
      colorType = data[9] ?? 2;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth.value !== 8 || width < 1 || height < 1) {
    throw new Error('Unsupported camera PNG');
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) {
    throw new Error('Unsupported camera PNG');
  }

  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgb = new Uint8Array(width * height * 3);
  let source = 0;
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source] ?? 0;
    source += 1;
    const row = inflated.subarray(source, source + stride);
    source += stride;
    const reconstructed = new Uint8Array(stride);
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? reconstructed[index - channels] : 0;
      const up = previous[index] ?? 0;
      const upperLeft = index >= channels ? previous[index - channels] ?? 0 : 0;
      const raw = row[index] ?? 0;
      if (filter === 0) {
        reconstructed[index] = raw;
      } else if (filter === 1) {
        reconstructed[index] = (raw + left) & 255;
      } else if (filter === 2) {
        reconstructed[index] = (raw + up) & 255;
      } else if (filter === 3) {
        reconstructed[index] = (raw + Math.floor((left + up) / 2)) & 255;
      } else if (filter === 4) {
        reconstructed[index] = (raw + paeth(left, up, upperLeft)) & 255;
      } else {
        throw new Error('Unsupported camera PNG');
      }
    }

    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 3;
      if (channels === 1) {
        const gray = reconstructed[x] ?? 0;
        rgb[destination] = gray;
        rgb[destination + 1] = gray;
        rgb[destination + 2] = gray;
      } else {
        rgb[destination] = reconstructed[x * channels] ?? 0;
        rgb[destination + 1] = reconstructed[x * channels + 1] ?? 0;
        rgb[destination + 2] = reconstructed[x * channels + 2] ?? 0;
      }
    }
    previous = reconstructed;
  }

  return { width, height, rgb };
};
