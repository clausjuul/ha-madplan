import type { Hono } from "hono";
import type { Deps } from "../deps.ts";
import { readJson } from "../http.ts";
import {
  setFridge,
  setPantry,
  setProfiles,
  setSavedInspirations,
  setSettings,
} from "../store-household.ts";
import * as v from "../validate.ts";
import { strList } from "../validate-basic.ts";

/** Small household collections that clients replace as a whole. */
export function householdRoutes(api: Hono, deps: Deps): void {
  const { repo } = deps;

  api.put("/fridge", async (c) => {
    const items = v.fridge(await readJson(c));
    repo.mutate(["household", "shopping"], () => setFridge(repo.db, items));
    return c.json(items);
  });

  api.put("/pantry", async (c) => {
    const names = strList(await readJson(c), "Basisvarer", 300, 100);
    repo.mutate(["household", "shopping"], () => setPantry(repo.db, names));
    return c.json(names);
  });

  api.put("/profiles", async (c) => {
    const profiles = v.profiles(await readJson(c));
    repo.mutate(["household"], () => setProfiles(repo.db, profiles));
    return c.json(profiles);
  });

  api.put("/settings", async (c) => {
    const settings = v.settings(await readJson(c));
    repo.mutate(["settings", "shopping"], () => setSettings(repo.db, settings));
    return c.json(settings);
  });

  api.put("/inspirations/saved", async (c) => {
    const recipes = v.inspirations(await readJson(c));
    repo.mutate(["inspirations"], () => setSavedInspirations(repo.db, recipes));
    return c.json(recipes);
  });
}
