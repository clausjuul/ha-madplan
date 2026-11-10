/** Splits typed text into chip values on comma, semicolon and newline. */
export function parseChipInput(text: string): string[] {
  return text
    .split(/[,;\n]/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Adds the parsed values, skipping case-insensitive duplicates. */
export function addChips(current: readonly string[], text: string): string[] {
  const seen = new Set(current.map((value) => value.toLocaleLowerCase("da-DK")));
  const next = [...current];
  for (const value of parseChipInput(text)) {
    const key = value.toLocaleLowerCase("da-DK");
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(value);
  }
  return next;
}

export const removeChip = (current: readonly string[], value: string): string[] =>
  current.filter((item) => item !== value);

/** Textarea lines -> trimmed non-empty list. */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}
