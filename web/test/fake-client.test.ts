import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../src/api/client";
import { createFakeClient } from "../src/api/fake-client";

const TODAY = "2026-11-09"; // a Monday

describe("fake client", () => {
  it("seeds a realistic week around today", async () => {
    const client = createFakeClient({ today: TODAY });
    const data = await client.bootstrap();
    expect(data.meals["2026-11-09"]?.dishId).toBe("lasagne");
    expect(data.meals["2026-11-13"]?.locked).toBe(true);
    expect(data.meals["2026-11-14"]).toBeUndefined();
    expect(data.dishes.length).toBeGreaterThan(20);
    expect(data.isEmpty).toBe(false);
  });

  it("reports isEmpty for an empty database", async () => {
    const data = await createFakeClient({ today: TODAY, empty: true }).bootstrap();
    expect(data.isEmpty).toBe(true);
  });

  it("swaps meals and answers 409 when a day is locked", async () => {
    const client = createFakeClient({ today: TODAY });
    const swapped = await client.swapMeals({ a: "2026-11-10", b: "2026-11-15" });
    expect(swapped["2026-11-10"]?.dishId).toBe("tacos");
    expect(swapped["2026-11-15"]?.dishId).toBe("laks");

    const error = await client.swapMeals({ a: "2026-11-10", b: "2026-11-13" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(409);
    expect((error as ApiRequestError).message).toMatch(/låst/);
  });

  it("moves a meal onto an empty day", async () => {
    const client = createFakeClient({ today: TODAY });
    await client.swapMeals({ a: "2026-11-10", b: "2026-11-14" });
    const data = await client.bootstrap();
    expect(data.meals["2026-11-10"]).toBeUndefined();
    expect(data.meals["2026-11-14"]?.dishId).toBe("laks");
  });

  it("suggests a different dish locally and refuses locked days", async () => {
    const client = createFakeClient({ today: TODAY });
    const meal = await client.suggestMeal("2026-11-10", { seed: 7 });
    expect(meal.source).toBe("local");
    expect(meal.dishId).not.toBe("laks");
    await expect(client.suggestMeal("2026-11-13", { seed: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to delete a locked meal, deletes others", async () => {
    const client = createFakeClient({ today: TODAY });
    await expect(client.deleteMeal("2026-11-13")).rejects.toMatchObject({ status: 409 });
    await client.deleteMeal("2026-11-10");
    expect((await client.bootstrap()).meals["2026-11-10"]).toBeUndefined();
  });

  it("builds one shopping list from today and toggles items", async () => {
    const client = createFakeClient({ today: TODAY });
    const list = await client.getShopping();
    expect(list.from).toBe(TODAY);
    expect(list.items.length).toBeGreaterThan(5);
    const first = list.items[0];
    expect(first).toBeDefined();
    const toggled = await client.toggleShoppingItem(first!.id);
    expect(toggled.checkedCount).toBe(1);
    const withExtra = await client.addShoppingExtra("Kaffe");
    expect(withExtra.items.some((item) => item.label === "Kaffe")).toBe(true);
  });

  it("emits change events to subscribers after a mutation", async () => {
    const client = createFakeClient({ today: TODAY });
    const onChange = vi.fn();
    const onConnection = vi.fn();
    const stop = client.subscribe({ onChange, onConnection });
    expect(onConnection).toHaveBeenCalledWith(true);
    await client.patchMeal("2026-11-10", { note: "Husk citron" });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0]?.[0].topics).toContain("meals");
    stop();
  });
});
