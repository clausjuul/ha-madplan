/** "Flere retter på én gang": one dish name per line, written by AI and checked before saving. */

export const MAX_BULK_DISHES = 15;

/**
 * The dish names in pasted text: one per line (commas and semicolons also split), bullets and
 * numbering removed, duplicates dropped, at most MAX_BULK_DISHES.
 */
export function parseDishNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of text.split(/[\n;,]+/u)) {
    const name = raw
      .replace(/^\s*(?:[-*•·–]|\d+[.)])\s*/u, "")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 130);
    const key = name.toLocaleLowerCase("da-DK");
    if (name.length < 2 || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** Runs `work` for every item with at most `limit` at a time; results arrive through `work` itself. */
export async function eachLimited<T>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await work(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
