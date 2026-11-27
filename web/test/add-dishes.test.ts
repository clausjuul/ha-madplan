import { describe, expect, it } from "vitest";
import type { Dish, DishInput } from "@madplan/domain";
import { createFakeClient } from "../src/api/fake-client";
import { draftFromDish, draftToInput, emptyDraft, fillEmpty, findDuplicate, hasEmptyFields } from "../src/lib/dish-form";

const aiDish: DishInput = {
  name: "Mormors frikadeller",
  category: "Hverdag",
  prepMinutes: 50,
  servings: 4,
  ingredients: ["500 g hakket svinekød", "1 løg"],
  instructions: ["Rør farsen.", "Steg dem."],
  favorite: false,
  leftoverFriendly: true,
  freezerFriendly: true,
  generated: true,
};

const dish = (id: string, name: string, extra: Partial<Dish> = {}): Dish => ({
  id,
  name,
  ingredients: ["løg"],
  prepMinutes: 30,
  category: "Dansk",
  favorite: false,
  leftoverFriendly: false,
  freezerFriendly: false,
  ...extra,
});

describe("Udfyld med AI", () => {
  it("fills only what the user has not typed, keeping the name", () => {
    const typed = { ...emptyDraft(), name: "mormors frikadeller", ingredients: "1 kg fars" };
    const filled = fillEmpty(typed, aiDish);
    expect(filled).toMatchObject({
      name: "mormors frikadeller",
      ingredients: "1 kg fars",
      category: "Hverdag",
      prepMinutes: "50",
      servings: "4",
      steps: "Rør farsen.\nSteg dem.",
      leftoverFriendly: true,
      freezerFriendly: true,
    });
    // Minutes typed by hand stay.
    expect(fillEmpty({ ...typed, prepMinutes: "25" }, aiDish).prepMinutes).toBe("25");
  });

  it("knows when there is something left to fill", () => {
    expect(hasEmptyFields(emptyDraft())).toBe(true);
    expect(hasEmptyFields(draftFromDish(aiDish))).toBe(false);
  });

  it("keeps the AI mark when a preview is saved", () => {
    expect(draftToInput(draftFromDish(aiDish), aiDish).generated).toBe(true);
    expect(draftToInput(draftFromDish(aiDish)).generated).toBeUndefined();
  });
});

describe("findDuplicate", () => {
  const dishes = [dish("a", "Lasagne", { archivedAt: "2026-11-01T00:00:00Z" }), dish("b", "Kylling i karry"), dish("c", "LASAGNE")];

  it("ignores case, spaces and punctuation, and prefers an active dish", () => {
    expect(findDuplicate("  kylling  i karry! ", dishes)?.id).toBe("b");
    expect(findDuplicate("lasagne", dishes)?.id).toBe("c");
    expect(findDuplicate("lasagne", dishes.slice(0, 1))?.archivedAt).toBeTruthy();
    expect(findDuplicate("Lasagne", dishes, "c")?.id).toBe("a");
    expect(findDuplicate("Pizza", dishes)).toBeUndefined();
    expect(findDuplicate(" ", dishes)).toBeUndefined();
  });
});

describe("fake client: reading and writing dishes", () => {
  it("reads links, text and photos into previews without saving", async () => {
    const client = createFakeClient({ today: "2026-11-09", latencyMs: 0, openai: true });
    const before = (await client.bootstrap()).dishes.length;
    expect((await client.readDish({ url: "https://opskrifter.example.dk/x" })).how).toBe("structured");
    expect((await client.readDish({ url: "https://blog.dk/x" })).how).toBe("read");
    expect((await client.readDish({ text: "Suppe\n1 l bouillon\n2 gulerødder" })).dish.ingredients).toEqual(["1 l bouillon", "2 gulerødder"]);
    expect(await client.readDish({ text: "linsesuppe, gerne stærk" })).toMatchObject({ how: "drafted", dish: { name: "Linsesuppe", generated: true } });
    expect(await client.readDish({ images: ["data:image/jpeg;base64,AA=="] })).toMatchObject({ how: "recognized", photo: 0, dish: { generated: true } });
    expect((await client.readDish({ images: ["data:image/jpeg;base64,AA==", "data:image/jpeg;base64,AA=="] })).how).toBe("read");
    expect((await client.draftDish({ name: "frikadeller" })).dish).toMatchObject({ name: "Frikadeller", generated: true });
    expect((await client.bootstrap()).dishes).toHaveLength(before);
  });

  it("needs OpenAI for text, photos and drafts", async () => {
    const client = createFakeClient({ today: "2026-11-09", latencyMs: 0 });
    await expect(client.readDish({ text: "Suppe\n1 l bouillon" })).rejects.toMatchObject({ status: 422 });
    await expect(client.draftDish({ name: "Lasagne" })).rejects.toMatchObject({ status: 422 });
    await expect(client.readDish({ url: "https://blog.dk/x" })).rejects.toMatchObject({ status: 422 });
  });
});
