import { describe, expect, it } from "vitest";
import { LEGACY_DISHES } from "@madplan/domain";
import { Repo } from "../src/repo.ts";
import { allDishes, findDish, retireBuiltinDishes, saveDish } from "../src/store-dishes.ts";
import { setup, testDatabase } from "./helpers.ts";

const NOW = "2026-11-27T10:00:00.000Z";

describe("retiring the built-in dishes", () => {
  it("leaves a new database without dishes, also on later starts", () => {
    const db = testDatabase({ dishes: false });
    expect(retireBuiltinDishes(db, NOW)).toBe(0);
    db.prepare("INSERT INTO meals (date, dish_id) VALUES ('2026-11-27', 'own')").run();
    expect(retireBuiltinDishes(db, NOW)).toBe(0);
    expect(allDishes(db)).toEqual([]);
  });

  it("archives every old built-in once in a database that was in use, keeping edits and earlier archiving", () => {
    const db = testDatabase({ dishes: false });
    db.prepare("INSERT INTO meals (date, dish_id) VALUES ('2026-11-02', 'tacos')").run();
    const lasagne = LEGACY_DISHES.find((dish) => dish.id === "lasagne")!;
    saveDish(db, { ...lasagne, name: "Mormors lasagne", favorite: true });
    saveDish(db, { ...LEGACY_DISHES.find((dish) => dish.id === "hotdogs")!, archivedAt: "2026-01-01T00:00:00.000Z" });

    expect(retireBuiltinDishes(db, NOW)).toBe(LEGACY_DISHES.length);
    const dishes = allDishes(db);
    expect(dishes).toHaveLength(LEGACY_DISHES.length);
    expect(dishes.every((dish) => dish.custom && dish.archivedAt)).toBe(true);
    expect(findDish(db, "tacos")).toMatchObject({ name: "Tacos", archivedAt: NOW });
    expect(findDish(db, "lasagne")).toMatchObject({ name: "Mormors lasagne", favorite: true, archivedAt: NOW });
    expect(findDish(db, "hotdogs")?.archivedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(findDish(db, "tacos")?.instructions?.length).toBeGreaterThan(0);

    expect(retireBuiltinDishes(db, NOW)).toBe(0);
  });

  it("can restore an archived old dish and plan with it", async () => {
    const db = testDatabase({ dishes: false });
    db.prepare("INSERT INTO pantry (position, name) VALUES (1, 'salt')").run();
    retireBuiltinDishes(db, NOW);
    const { json } = setup({ repo: new Repo(db) });
    const restored = await json<{ archivedAt?: string }>("POST", "dishes/tacos/restore");
    expect(restored.archivedAt).toBeUndefined();
    expect(await json("PUT", "meals/2026-11-27", { dishId: "tacos" })).toMatchObject({ dishId: "tacos" });
  });
});
