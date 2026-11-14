const MAX_ENTRIES = 8;
const BUCKETS = [160, 320, 640, 960];

const cache = new Map<string, Promise<ImageBitmap>>();
const order: string[] = [];

export const sizeBucket = (width: number) => BUCKETS.find((bucket) => width <= bucket) ?? BUCKETS[BUCKETS.length - 1];

const touch = (key: string) => {
  const index = order.indexOf(key);
  if (index >= 0) {
    order.splice(index, 1);
  }

  order.push(key);
  while (order.length > MAX_ENTRIES) {
    const oldest = order.shift();
    if (oldest) {
      cache.delete(oldest);
    }
  }
};

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load still source: ${url}`));
    image.src = url;
  });

const createBitmap = async (url: string, bucket: number) => {
  const image = await loadImage(url);
  const sourceWidth = image.naturalWidth || bucket;
  const sourceHeight = image.naturalHeight || bucket;
  const scale = Math.min(1, bucket / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to downsample still image');
  }

  context.drawImage(image, 0, 0, width, height);
  return createImageBitmap(canvas);
};

/** Cached full-frame bitmaps keyed by source and a coarse width. Live zoom must not be part of the key. */
export const loadDownsampledStill = (url: string, width: number) => {
  const key = `${url}|${sizeBucket(width)}`;
  const existing = cache.get(key);
  if (existing) {
    touch(key);
    return existing;
  }

  const pending = createBitmap(url, sizeBucket(width)).catch((error: unknown) => {
    cache.delete(key);
    const index = order.indexOf(key);
    if (index >= 0) {
      order.splice(index, 1);
    }
    throw error;
  });
  cache.set(key, pending);
  touch(key);
  return pending;
};
