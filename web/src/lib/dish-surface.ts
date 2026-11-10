import type { CSSProperties } from "react";

/** Deterministic 32-bit string hash (FNV-1a). */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Hue 0-359 derived from the category, so every category keeps its own colour. */
export function categoryHue(category: string): number {
  return hashString(category.trim().toLocaleLowerCase("da-DK")) % 360;
}

/** First letter of the dish name, upper-cased; "?" for an empty name. */
export function dishInitial(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toLocaleUpperCase("da-DK") : "?";
}

/** Background + text colour for a dish without a photo (never a grey icon). */
export function dishSurfaceStyle(category: string): CSSProperties {
  const hue = categoryHue(category);
  return {
    background: `linear-gradient(135deg, hsl(${hue} 48% 30%), hsl(${(hue + 36) % 360} 52% 17%))`,
    color: `hsl(${hue} 90% 88%)`,
  };
}
