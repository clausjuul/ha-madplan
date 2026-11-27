import { describe, expect, it } from "vitest";
import type { BootstrapResponse, Dish } from "@madplan/domain";
import { setup } from "./helpers.ts";

// A real (tiny) JPEG header is not needed: the server stores the bytes as they are.
const BYTES = Buffer.from("fake jpeg bytes for a dish photo");
const PHOTO = `data:image/jpeg;base64,${BYTES.toString("base64")}`;
const dish = (imageUrl?: string) => ({ name: "Kylling med pasta", ingredients: ["400 g kylling"], prepMinutes: 35, category: "Pasta", ...(imageUrl ? { imageUrl } : {}) });

describe("uploaded dish photos", () => {
  it("stores the photo on its own, serves it, and keeps only a link on the dish", async () => {
    const { json, call } = setup();
    const saved = await json<Dish>("POST", "dishes", dish(PHOTO));
    expect(saved.imageUrl).toMatch(/^api\/photos\/[0-9a-f-]{36}$/u);

    const photo = await call("GET", saved.imageUrl!.slice("api/".length));
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await photo.arrayBuffer())).toEqual(BYTES);

    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.dishes.find((candidate) => candidate.id === saved.id)?.imageUrl).toBe(saved.imageUrl);
    expect(JSON.stringify(boot)).not.toContain("base64");
  });

  it("removes the old photo when it is replaced or removed, and keeps it when nothing changed", async () => {
    const { json, call } = setup();
    const first = await json<Dish>("POST", "dishes", dish(PHOTO));
    const path = (link: string) => link.slice("api/".length);

    const same = await json<Dish>("PUT", `dishes/${first.id}`, { ...dish(first.imageUrl), name: "Nyt navn" });
    expect(same.imageUrl).toBe(first.imageUrl);
    expect((await call("GET", path(first.imageUrl!))).status).toBe(200);

    const replaced = await json<Dish>("PUT", `dishes/${first.id}`, dish(PHOTO));
    expect(replaced.imageUrl).not.toBe(first.imageUrl);
    expect((await call("GET", path(first.imageUrl!))).status).toBe(404);

    const removed = await json<Dish>("PUT", `dishes/${first.id}`, dish());
    expect(removed.imageUrl).toBeUndefined();
    expect((await call("GET", path(replaced.imageUrl!))).status).toBe(404);
  });

  it("refuses photos that are not images and unknown photo ids", async () => {
    const { call } = setup();
    expect((await call("POST", "dishes", dish("data:image/svg+xml;base64,PHN2Zz4="))).status).toBe(400);
    expect((await call("POST", "dishes", dish("data:text/html;base64,PGI+"))).status).toBe(400);
    expect((await call("GET", "photos/findes-ikke")).status).toBe(404);
    expect((await call("GET", "photos/00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });
});
