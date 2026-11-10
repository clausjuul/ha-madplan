import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test.use({ hasTouch: true, viewport: { width: 1280, height: 800 } });

const card = (page: import("@playwright/test").Page, name: string) =>
  page.locator("[data-day]").filter({ hasText: name }).first();

/** Touch drag through CDP so it behaves like a finger on the wall tablet. */
async function touchDrag(page: import("@playwright/test").Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps },
      ],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("trækker et dagskort over et andet og bytter dagene (touch)", async ({ page }) => {
  await openApp(page);
  const strip = page.getByRole("region", { name: "Ugen" });
  const laks = strip.locator("[data-day='2026-11-10']");
  const tacos = strip.locator("[data-day='2026-11-15']");
  await expect(laks).toContainText("Laks");
  await expect(tacos).toContainText("Tacos");

  const a = (await laks.boundingBox())!;
  const b = (await tacos.boundingBox())!;
  await touchDrag(
    page,
    { x: a.x + a.width / 2, y: a.y + 60 },
    { x: b.x + b.width / 2, y: b.y + 60 },
  );

  await expect(strip.locator("[data-day='2026-11-10']")).toContainText("Tacos");
  await expect(strip.locator("[data-day='2026-11-15']")).toContainText("Laks");
});

test("nægter at bytte med en låst dag", async ({ page }) => {
  await openApp(page);
  const strip = page.getByRole("region", { name: "Ugen" });
  const laks = strip.locator("[data-day='2026-11-10']");
  const pizza = strip.locator("[data-day='2026-11-13']");
  const a = (await laks.boundingBox())!;
  const b = (await pizza.boundingBox())!;
  await touchDrag(
    page,
    { x: a.x + a.width / 2, y: a.y + 60 },
    { x: b.x + b.width / 2, y: b.y + 60 },
  );
  await expect(page.getByRole("status")).toContainText("låst");
  await expect(strip.locator("[data-day='2026-11-10']")).toContainText("Laks");
});
