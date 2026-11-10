import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Runs against the REAL server with an EMPTY database; see web/README.md ("Integration test").
 * Runs first (file order, workers: 1) via `npm run e2e:integration`; the normal fake-mode run skips @integration.
 */
test("@integration importerer v1, opretter, arkiverer og gendanner en ret", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/indstillinger");

  // 1. Import the v1 fixture through the settings UI.
  await page.getByLabel("Vælg v1-fil").setInputFiles(resolve(process.cwd(), "e2e/fixtures/v1.json"));
  await expect(page.getByText("Gemte idéer")).toBeVisible();
  await page.getByRole("button", { name: "Importér", exact: true }).click();
  await expect(page.getByText(/Importeret: \d+ dage/u)).toBeVisible();
  await expect(page.getByText(/kun mulig, mens madplanen er tom/u)).toBeVisible();

  // 2. The imported custom dish is in the library.
  await page.goto("/#/retter");
  await expect(page.getByRole("heading", { name: "Farmors gryderet" })).toBeVisible();

  // 3. Create a dish.
  await page.getByRole("button", { name: "Ny ret" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Navn").fill("Integrationsgryde");
  await dialog.getByLabel("Kategori").fill("Gryderet");
  await dialog.getByLabel("Ingredienser").fill("løg\nkartofler");
  await dialog.getByRole("button", { name: "Gem ret" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Integrationsgryde" })).toBeVisible();

  // 4. Archive it (history is kept) and find it under "Arkiveret".
  await page.getByRole("button", { name: "Arkivér" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Arkivér" }).click();
  await expect(page.getByRole("button", { name: "Ny ret" })).toBeVisible();
  await page.getByRole("button", { name: /Arkiveret \(1\)/u }).click();
  await expect(page.getByRole("link", { name: "Integrationsgryde" })).toBeVisible();

  // 5. Restore it.
  await page.getByRole("button", { name: "Gendan" }).click();
  await expect(page.getByRole("heading", { name: "Integrationsgryde" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Arkiveret/u })).toHaveCount(0);
});
