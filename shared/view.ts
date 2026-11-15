export type CoverTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export const coverTransform = (viewWidth: number, viewHeight: number, imageWidth: number, imageHeight: number): CoverTransform => {
  const scale = Math.max(viewWidth / imageWidth, viewHeight / imageHeight);
  return {
    scale,
    offsetX: (viewWidth - imageWidth * scale) / 2,
    offsetY: (viewHeight - imageHeight * scale) / 2
  };
};

export const sourcePointFromView = (
  viewX: number,
  viewY: number,
  viewWidth: number,
  viewHeight: number,
  imageWidth: number,
  imageHeight: number
) => {
  const { scale, offsetX, offsetY } = coverTransform(viewWidth, viewHeight, imageWidth, imageHeight);
  return {
    x: (viewX - offsetX) / scale,
    y: (viewY - offsetY) / scale
  };
};

export const viewRectFromSource = (
  rect: { x: number; y: number; width: number; height: number },
  viewWidth: number,
  viewHeight: number,
  imageWidth: number,
  imageHeight: number
) => {
  const { scale, offsetX, offsetY } = coverTransform(viewWidth, viewHeight, imageWidth, imageHeight);
  return {
    left: offsetX + rect.x * scale,
    top: offsetY + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale
  };
};
