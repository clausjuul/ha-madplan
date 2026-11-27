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

export type ImageBox = { maxWidth: number; maxHeight: number; quality: number };

/** A dish photo for the cards. */
export const DISH_PHOTO: ImageBox = { maxWidth: MAX_IMAGE_WIDTH, maxHeight: MAX_IMAGE_HEIGHT, quality: IMAGE_QUALITY };
/** A photo of a recipe (e.g. a cookbook page) for the AI to read: big enough for small print. */
export const RECIPE_PHOTO: ImageBox = { maxWidth: 1600, maxHeight: 1600, quality: 0.85 };

/** Downscales an image file to fit the box (default: a dish photo, 1000x700) and returns a JPEG data URL. */
export async function downscaleImage(file: Blob, deps: ResizeDeps = browserDeps, box: ImageBox = DISH_PHOTO): Promise<string> {
  const source = await deps.decode(file);
  const size = fitWithin(source.width, source.height, box.maxWidth, box.maxHeight);
  const canvas = deps.createCanvas();
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Billedet kunne ikke behandles i denne browser.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(source as CanvasImageSource, 0, 0, size.width, size.height);
  source.close?.();
  return canvas.toDataURL("image/jpeg", box.quality);
}
