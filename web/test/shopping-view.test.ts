import { describe, expect, it } from "vitest";
import { createFakeClient } from "../src/api/fake-client";
import {
  activeChip,
  groupByCategory,
  rangeChips,
  rangeTitle,
  removeItemIn,
  toggleItemIn,
  usableEnd,
} from "../src/lib/shopping-view";

describe("range chips", () => {
  it("computes end dates from today (Monday 9 Nov 2026)", () => {
    const chips = rangeChips("2026-11-09");
    expect(chips.map((chip) => [chip.id, chip.to])).toEqual([
      ["week", "2026-11-15"],
      ["7", "2026-11-15"],
      ["14", "2026-11-22"],
    ]);
  });

  it("ends the rest of the week on Sunday, and 7 days differ midweek", () => {
    const chips = rangeChips("2026-11-12"); // Thursday
    expect(chips.find((chip) => chip.id === "week")?.to).toBe("2026-11-15");
    expect(chips.find((chip) => chip.id === "7")?.to).toBe("2026-11-18");
    expect(activeChip("2026-11-12", "2026-11-15")).toBe("week");
    expect(activeChip("2026-11-12", "2026-11-17")).toBeUndefined();
  });

  it("titles the range like the mockup and drops stale remembered dates", () => {
    expect(rangeTitle("2026-11-09", "2026-11-15", "2026-11-09")).toBe("Til i dag – søndag 15. nov.");
    expect(rangeTitle("2026-11-09", "2026-11-09", "2026-11-09")).toBe("Til i dag");
    expect(usableEnd("2026-11-08", "2026-11-09")).toBeUndefined();
    expect(usableEnd("rod", "2026-11-09")).toBeUndefined();
    expect(usableEnd("2026-11-20", "2026-11-09")).toBe("2026-11-20");
  });
});

describe("shopping list helpers", async () => {
  const client = createFakeClient({ today: "2026-11-09" });
  const list = await client.getShopping();

  it("groups open items by category in walking order", () => {
    const groups = groupByCategory(list.items);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.reduce((total, group) => total + group.items.length, 0)).toBe(list.items.length);
  });

  it("toggles optimistically and keeps counts consistent", () => {
    const id = list.items[0]?.id ?? "";
    const toggled = toggleItemIn(list, id);
    expect(toggled.checkedCount).toBe(1);
    expect(toggled.items[0]?.checked).toBe(true);
    expect(toggleItemIn(toggled, id).checkedCount).toBe(0);
    expect(list.checkedCount).toBe(0);
  });

  it("removes an item and its price", () => {
    const first = list.items[0];
    const removed = removeItemIn(list, first?.id ?? "");
    expect(removed.items).toHaveLength(list.items.length - 1);
    expect(removed.totalEstimatedPrice).toBe(list.totalEstimatedPrice - (first?.estimatedPrice ?? 0));
  });
});
