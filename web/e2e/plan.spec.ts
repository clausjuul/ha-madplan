import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

const SHOTS = `${
  process.env.SHOTS_DIR ??
  "C:\\Users\\claus\\AppData\\Local\\Temp\\claude\\b6460fcb0a68ee27\\b55406dd-907d-48a1-a46d-c7d2c094cd3d\\scratchpad\\shots"
}\\phase5a`;
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

async function openPlan(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await openApp(page);
  await page.evaluate(() => {
    window.location.hash = "#/planlaeg";
  });
  await expect(page.getByRole("heading", { name: "Hvilke dage skal planlægges?" })).toBeVisible();
}

const next = (page: Page) => page.getByRole("button", { name: /Næste: Ønsker/ });

test("trin 1 og 2 på tablet", async ({ page }) => {
  await openPlan(page, 1280, 800);
  await expect(page.getByText("Planlæg uge 46")).toBeVisible();
  await expect(page.getByText(/låst og bevares/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}\\plan-step1-1280x800.png` });
  await next(page).click();
  await expect(page.getByRole("heading", { name: "Hvad har I lyst til?" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}\\plan-step2-1280x800.png` });
});

test("demo-Assist: generering, gennemsyn og genoptagelse efter genindlæsning", async ({ page }) => {
  await openPlan(page, 1280, 800);
  await next(page).click();
  await expect(page.getByRole("radio", { name: /Assist \(AI med websøgning\)/ })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Ønsker til ugen").fill("Noget stærkt med nudler");
  await page.getByRole("button", { name: "Lav forslag" }).click();
  await expect(page.getByRole("heading", { name: "Laver et forslag til jer" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}\\plan-generating-1280x800.png` });
  await expect(page.getByRole("heading", { name: "Forslag til ugen" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Lavet af Assist med websøgning/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}\\plan-review-1280x800.png` });

  // The draft survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hvilke dage skal planlægges?" })).toBeVisible();
});

test("lokalt forslag: lås, lav om, vælg selv og gem", async ({ page }) => {
  await openPlan(page, 1280, 800);
  await next(page).click();
  await page.getByRole("radio", { name: /Hurtigt forslag/ }).click();
  await expect(page.getByText("Hurtigt forslag bruger kun jeres egne retter. Vælg Assist for at få nye retter.")).toBeVisible();
  await expect(page.getByText("Antal nye retter")).toHaveCount(0);
  await page.getByRole("button", { name: "Lav forslag" }).click();
  await expect(page.getByRole("heading", { name: "Forslag til ugen" })).toBeVisible();
  await expect(page.getByText(/Hurtigt forslag ud fra jeres retter/)).toBeVisible();
  const rows = page.getByRole("article");
  await expect(rows).toHaveCount(7);

  await rows.nth(1).getByRole("button", { name: "Lås dagen" }).click();
  await expect(rows.nth(1).getByRole("button", { name: "Lås dagen op" })).toHaveAttribute("aria-pressed", "true");
  await rows.nth(2).getByRole("button", { name: "Vælg selv en ret" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Tacos/ }).click();
  await expect(rows.nth(2).getByText("Tacos")).toBeVisible();
  await page.getByRole("button", { name: "Gem i ugeplanen" }).click();
  await expect(page).toHaveURL(/#\/uge/);
  await expect(page.getByText("Planen er gemt i ugeplanen.")).toBeVisible();
});

test("fejl i AI-planlægning kan gentages lokalt", async ({ page }) => {
  await openPlan(page, 1280, 800);
  await next(page).click();
  await page.getByLabel("Ønsker til ugen").fill("[demo-fejl]");
  await page.getByRole("button", { name: "Lav forslag" }).click();
  await expect(page.getByRole("heading", { name: "Forslaget blev ikke lavet" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Brug hurtigt forslag i stedet" }).click();
  await expect(page.getByRole("heading", { name: "Forslag til ugen" })).toBeVisible();
});

test("telefon: trin 1 og gennemsyn", async ({ page }) => {
  await openPlan(page, 390, 844);
  await page.screenshot({ path: `${SHOTS}\\plan-step1-390x844.png` });
  await next(page).click();
  await page.getByRole("radio", { name: /Hurtigt forslag/ }).click();
  await page.getByRole("button", { name: "Lav forslag" }).click();
  await expect(page.getByRole("heading", { name: "Forslag til ugen" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}\\plan-review-390x844.png` });
  const box = await page.getByRole("button", { name: "Lås dagen" }).first().boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
