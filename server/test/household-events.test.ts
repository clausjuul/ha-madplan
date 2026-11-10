import { describe, expect, it } from "vitest";
import type { BootstrapResponse, ChangeEvent, InspirationRecipe, Profile, Settings } from "@madplan/domain";
import { setup } from "./helpers.ts";

const profile: Profile = {
  id: "claus",
  name: "Claus",
  active: true,
  exclusions: ["rejer"],
  preferences: ["pasta"],
  dislikes: [],
  favoriteDishIds: ["lasagne"],
  portions: 1,
};

describe("household collections", () => {
  it("replaces fridge, pantry, profiles, settings and saved inspirations as a whole", async () => {
    const { json, call } = setup();
    const settings: Settings = { globalExclusions: ["nødder"], preferredStores: ["netto"], preferredServings: 4 };
    const saved: InspirationRecipe = {
      id: "i1",
      name: "Pad thai",
      cuisine: "Thailand",
      prepMinutes: 30,
      description: "Nudler",
      tags: ["nudler"],
      sourceName: "Hot Thai Kitchen",
      sourceUrl: "https://hot-thai-kitchen.com/pad-thai",
    };
    expect(await json("PUT", "fridge", [{ name: "Mælk", expiresOn: "2026-11-12", useFirst: true }])).toHaveLength(1);
    expect(await json("PUT", "pantry", ["salt", "peber"])).toEqual(["salt", "peber"]);
    expect(await json("PUT", "profiles", [profile])).toEqual([profile]);
    expect(await json("PUT", "settings", settings)).toEqual(settings);
    expect(await json("PUT", "inspirations/saved", [saved])).toEqual([saved]);

    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.fridge).toEqual([{ name: "Mælk", expiresOn: "2026-11-12", useFirst: true }]);
    expect(boot.pantry).toEqual(["salt", "peber"]);
    expect(boot.profiles).toEqual([profile]);
    expect(boot.settings).toEqual(settings);
    expect(boot.savedInspirations).toEqual([saved]);
    expect(boot.revision).toBe(5);

    await json("PUT", "fridge", []);
    expect((await json<BootstrapResponse>("GET", "bootstrap")).fridge).toEqual([]);
    expect((await call("PUT", "fridge", { name: "x" })).status).toBe(400);
    expect((await call("PUT", "pantry", [1])).status).toBe(400);
    expect((await call("PUT", "profiles", [{ id: "a" }])).status).toBe(400);
    expect((await call("PUT", "settings", { globalExclusions: [], preferredStores: ["fotex"] })).status).toBe(400);
    expect((await call("PUT", "inspirations/saved", [{ ...saved, cuisine: "Atlantis" }])).status).toBe(400);
  });

  it("rolls back a failed mutation completely", async () => {
    const { repo } = setup();
    expect(() =>
      repo.mutate(["meals"], () => {
        repo.db.prepare("INSERT INTO pantry (position, name) VALUES (1, 'x')").run();
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(repo.revision()).toBe(0);
    expect(repo.isEmpty()).toBe(true);
  });
});

async function readChunks(response: Response, until: (text: string) => boolean): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ingen stream");
  const decoder = new TextDecoder();
  let text = "";
  while (!until(text)) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel();
  return text;
}

describe("api/events", () => {
  it("broadcasts a change event after each committed mutation and pings", async () => {
    const { app, json, repo } = setup();
    const events: ChangeEvent[] = [];
    repo.onChange((event) => events.push(event));
    const response = await app.request("http://localhost/api/events");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await json("PUT", "meals/2026-11-10", { dishId: "lasagne" });
    const text = await readChunks(response, (t) => t.includes("event: change") && t.includes(": ping"));
    const data = /data: (.*)/u.exec(text)?.[1] ?? "";
    expect(JSON.parse(data)).toEqual({ revision: 1, topics: ["meals", "shopping"] });
    expect(events).toHaveLength(1);
  });

  it("does not broadcast failed requests and stops listening after disconnect", async () => {
    const { app, call, repo } = setup();
    const response = await app.request("http://localhost/api/events");
    await call("PUT", "meals/2026-11-10", { dishId: "findes-ikke" });
    await readChunks(response, (t) => t.includes(": connected"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(repo.revision()).toBe(0);
    // @ts-expect-error reading a private field to assert cleanup
    expect(repo.listeners.size).toBe(0);
  });
});
