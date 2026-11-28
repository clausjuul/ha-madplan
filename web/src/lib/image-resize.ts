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

/** A photo the browser could not read; the message is Danish and meant for the family. */
export class ImageReadError extends Error {}

const UNREADABLE = "Billedet kunne ikke læses. Prøv et andet billede, eller tag et skærmbillede af det og brug det i stedet.";
const UNREADABLE_HEIC =
  "Billedet er i HEIC-format og kunne ikke læses. Tag et skærmbillede af det og brug det i stedet, eller slå højeffektive billeder (HEIF) fra i kameraets indstillinger.";

/** ISO-BMFF brands of HEIC/HEIF photos (as Samsung and iPhone cameras save them). */
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** True for a HEIC/HEIF photo, by its type, name or the "ftyp" box at the start of the file. */
export async function looksLikeHeic(file: Blob): Promise<boolean> {
  if (/^image\/hei[cf]/iu.test(file.type)) return true;
  if ("name" in file && typeof file.name === "string" && /\.hei[cf]$/iu.test(file.name)) return true;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = String.fromCharCode(...head);
  return text.slice(4, 8) === "ftyp" && HEIF_BRANDS.has(text.slice(8, 12).toLowerCase());
}

/** Some browsers can show a photo in an <img> that createImageBitmap refuses (or is too big for). */
function decodeWithImg(file: Blob): Promise<ImageSource & CanvasImageSource> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  return img.decode().then(
    () => Object.assign(img, { close: () => URL.revokeObjectURL(url) }) as unknown as ImageSource & CanvasImageSource,
    (error: unknown) => {
      URL.revokeObjectURL(url);
      throw error;
    },
  );
}

/**
 * Reads a photo from the phone: the browser's own decoder (turned the right way up), then an <img>,
 * and for a HEIC photo, which Chrome on Android cannot read, a HEIC decoder loaded only when needed.
 */
async function decodeInBrowser(file: Blob): Promise<ImageSource> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Try the next way.
  }
  try {
    return await decodeWithImg(file);
  } catch {
    // Try the next way.
  }
  if (!(await looksLikeHeic(file))) throw new ImageReadError(UNREADABLE);
  try {
    const { heicTo } = await import("heic-to");
    return await heicTo({ blob: file, type: "bitmap", options: { imageOrientation: "from-image" } });
  } catch {
    throw new ImageReadError(UNREADABLE_HEIC);
  }
}

const browserDeps: ResizeDeps = {
  decode: decodeInBrowser,
  createCanvas: () => document.createElement("canvas"),
};

export type ImageBox = { maxWidth: number; maxHeight: number; quality: number };

/** A dish photo for the cards. */
export const DISH_PHOTO: ImageBox = { maxWidth: MAX_IMAGE_WIDTH, maxHeight: MAX_IMAGE_HEIGHT, quality: IMAGE_QUALITY };
/** A photo of a recipe (e.g. a cookbook page) for the AI to read: big enough for small print. */
export const RECIPE_PHOTO: ImageBox = { maxWidth: 1600, maxHeight: 1600, quality: 0.85 };

/** A data: URL as a Blob (e.g. to downscale a photo that was already read). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/su.exec(dataUrl);
  if (!match) throw new Error("Not a data URL");
  const [, type, base64, data = ""] = match;
  if (!base64) return new Blob([decodeURIComponent(data)], { type });
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

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
  const url = canvas.toDataURL("image/jpeg", box.quality);
  // A canvas the browser could not draw (e.g. out of memory) exports "data:," instead of a JPEG.
  if (!url.startsWith("data:image/jpeg;base64,")) throw new ImageReadError(UNREADABLE);
  return url;
}
