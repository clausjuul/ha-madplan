import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { MOCK_NOW } from "./helpers";

const SHOTS = `${
  process.env.SHOTS_DIR ??
  "C:\\Users\\claus\\AppData\\Local\\Temp\\claude\\b6460fcb0a68ee27\\b55406dd-907d-48a1-a46d-c7d2c094cd3d\\scratchpad\\shots"
}\\phase4`;

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

async function open(page: Page, hash: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.clock.install({ time: MOCK_NOW });
  await page.goto(`/${hash}`);
  await page.waitForLoadState("networkidle");
}

test("indkøb på telefon 390x844", async ({ page }) => {
  await open(page, "#/indkob", { width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Indkøb" })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}\\indkob-390x844.png` });

  const rows = page.locator("li button[aria-pressed=false]");
  await rows.first().click();
  await rows.first().click();
  await expect(page.getByRole("heading", { name: /I kurven · 2/u })).toBeVisible();
  await page.getByRole("heading", { name: /I kurven/u }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}\\indkob-checked-390x844.png` });
});

test("indkøb på tablet 1280x800", async ({ page }) => {
  await open(page, "#/indkob", { width: 1280, height: 800 });
  await expect(page.getByRole("heading", { name: "Indkøb" })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}\\indkob-1280x800.png` });
});

test("indkøb: ekstra vare, slutdato og ny tur", async ({ page }) => {
  await open(page, "#/indkob", { width: 390, height: 844 });
  await page.getByPlaceholder("Tilføj fx 2 liter mælk").fill("Vaskemiddel");
  await page.keyboard.press("Enter");
  await expect(page.locator("li button", { hasText: "Vaskemiddel" })).toBeVisible();
  await page.getByRole("button", { name: "Fjern Vaskemiddel" }).click();
  await expect(page.locator("li button", { hasText: "Vaskemiddel" })).toHaveCount(0);

  await page.getByRole("button", { name: /Skift slutdato/u }).click();
  await page.getByRole("button", { name: "14 dage" }).click();
  await expect(page.getByRole("button", { name: /søndag 22\. nov\./u })).toBeVisible();

  await page.locator("li button[aria-pressed=false]").first().click();
  await page.getByRole("button", { name: "Ny indkøbstur" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ny indkøbstur" }).click();
  await expect(page.getByRole("heading", { name: /I kurven/u })).toHaveCount(0);
});

test("kogetilstand på tablet 1280x800 med timer og piletaster", async ({ page }) => {
  await open(page, "#/lav-mad/lasagne", { width: 1280, height: 800 });
  await expect(page.getByText(/Trin 1 af/u)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/Trin 3 af/u)).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}\\cook-1280x800.png` });
  const start = page.getByRole("button", { name: /Start timer/u });
  if (await start.count()) {
    await start.click();
    await expect(page.getByRole("timer")).toBeVisible();
  }
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText(/Trin 2 af/u)).toBeVisible();
});

test("kogetilstand på telefon 390x844", async ({ page }) => {
  await open(page, "#/lav-mad/lasagne", { width: 390, height: 844 });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}\\cook-390x844.png` });
  await page.getByRole("button", { name: "Vis ingredienser" }).click();
  await page.getByRole("dialog").getByText("Ingredienser").first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}\\cook-ingredients-390x844.png` });
});

test("kogetilstand: færdig vender tilbage til ugen", async ({ page }) => {
  await open(page, "#/lav-mad/lasagne", { width: 1280, height: 800 });
  for (let i = 0; i < 12; i += 1) {
    const done = page.getByRole("button", { name: "Færdig – velbekomme" });
    if (await done.count()) break;
    await page.getByRole("button", { name: "Næste trin" }).click();
  }
  await page.getByRole("button", { name: "Færdig – velbekomme" }).click();
  await expect(page).toHaveURL(/#\/uge/u);
});
