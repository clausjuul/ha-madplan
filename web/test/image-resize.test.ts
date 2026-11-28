import { describe, expect, it, vi } from "vitest";
import { downscaleImage, fitWithin, ImageReadError, looksLikeHeic } from "../src/lib/image-resize";

describe("fitWithin", () => {
  it("scales large images down keeping the aspect ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 933, height: 700 });
    expect(fitWithin(2000, 500)).toEqual({ width: 1000, height: 250 });
  });
  it("never scales up", () => {
    expect(fitWithin(400, 300)).toEqual({ width: 400, height: 300 });
  });
});

describe("downscaleImage", () => {
  it("draws onto a scaled canvas and exports JPEG at quality 0.8", async () => {
    const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn(() => "data:image/jpeg;base64,AAAA"),
    } as unknown as HTMLCanvasElement;
    const close = vi.fn();

    const result = await downscaleImage(new Blob(["x"]), {
      decode: () => Promise.resolve({ width: 3000, height: 2000, close }),
      createCanvas: () => canvas,
    });

    expect(result).toBe("data:image/jpeg;base64,AAAA");
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(667);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.8);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1000, 667);
    expect(close).toHaveBeenCalled();
  });

  it("refuses a canvas the browser could not export, instead of sending an empty image", async () => {
    const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = { getContext: () => context, toDataURL: () => "data:," } as unknown as HTMLCanvasElement;
    await expect(
      downscaleImage(new Blob(["x"]), { decode: () => Promise.resolve({ width: 10, height: 10 }), createCanvas: () => canvas }),
    ).rejects.toBeInstanceOf(ImageReadError);
  });

  it("fails with a Danish message when there is no 2d context", async () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    await expect(
      downscaleImage(new Blob(["x"]), { decode: () => Promise.resolve({ width: 10, height: 10 }), createCanvas: () => canvas }),
    ).rejects.toThrow("Billedet");
  });
});

describe("looksLikeHeic", () => {
  const box = (brand: string) => new Blob([new Uint8Array([0, 0, 0, 24]), "ftyp", brand, "0000"]);

  it("knows HEIC photos by type, name or file header", async () => {
    expect(await looksLikeHeic(new Blob(["x"], { type: "image/heic" }))).toBe(true);
    expect(await looksLikeHeic(new File(["x"], "20261128_101500.HEIC"))).toBe(true);
    // Samsung often sends no type at all; the header still says HEIC.
    expect(await looksLikeHeic(box("heic"))).toBe(true);
    expect(await looksLikeHeic(box("mif1"))).toBe(true);
  });

  it("is false for JPEG and other files", async () => {
    expect(await looksLikeHeic(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }))).toBe(false);
    expect(await looksLikeHeic(box("avif"))).toBe(false);
    expect(await looksLikeHeic(new Blob([]))).toBe(false);
  });
});
