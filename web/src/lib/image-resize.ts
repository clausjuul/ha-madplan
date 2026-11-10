export const MAX_IMAGE_WIDTH = 1000;
export const MAX_IMAGE_HEIGHT = 700;
export const IMAGE_QUALITY = 0.8;

/** Scales (never up) to fit inside the box while keeping the aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  maxWidth = MAX_IMAGE_WIDTH,
  maxHeight = MAX_IMAGE_HEIGHT,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type ImageSource = { width: number; height: number; close?: () => void };

export type ResizeDeps = {
  decode: (file: Blob) => Promise<ImageSource>;
  createCanvas: () => HTMLCanvasElement;
};

const browserDeps: ResizeDeps = {
  decode: (file) => createImageBitmap(file),
  createCanvas: () => document.createElement("canvas"),
};

/** Downscales an image file to max 1000x700 and returns a JPEG data URL (quality 0.8). */
export async function downscaleImage(file: Blob, deps: ResizeDeps = browserDeps): Promise<string> {
  const source = await deps.decode(file);
  const size = fitWithin(source.width, source.height);
  const canvas = deps.createCanvas();
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Billedet kunne ikke behandles i denne browser.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(source as CanvasImageSource, 0, 0, size.width, size.height);
  source.close?.();
  return canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
}
