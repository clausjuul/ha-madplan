import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// A 2x2 PNG: enough for the browser to decode and downscale.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");

/**
 * Runs against the REAL server with an EMPTY database; see web/README.md ("Integration test").
 * Runs first (file order, workers: 1) via `npm run e2e:integration`; the normal fake-mode run skips @integration.
 */
test("@integration importerer v1, opretter, arkiverer og gendanner en ret", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/indstillinger/data");

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
  await page.getByRole("button", { name: "Tilføj ret" }).click();
  await page.getByRole("button", { name: /Skriv selv/u }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Navn").fill("Integrationsgryde");
  await dialog.getByLabel("Kategori").fill("Gryderet");
  await dialog.getByLabel("Ingredienser").fill("løg\nkartofler");
  // An uploaded photo is stored by the server and the dish gets a link to it.
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Tilføj billede" }).click();
  await (await chooser).setFiles({ name: "gryde.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByRole("img", { name: "Billede af retten" })).toHaveAttribute("src", /^data:image\/jpeg/u);
  await dialog.getByRole("button", { name: "Gem ret" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Integrationsgryde" })).toBeVisible();
  const photo = page.locator('img[src^="api/photos/"]').first();
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // 4. Archive it (history is kept) and find it under "Arkiveret", next to the fixture's lasagne: a
  //    built-in that no longer ships, so the import kept it as an archived dish.
  await page.getByRole("button", { name: "Arkivér" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Arkivér" }).click();
  await expect(page.getByRole("button", { name: "Tilføj ret" })).toBeVisible();
  await page.getByRole("button", { name: /Arkiveret \(2\)/u }).click();
  await expect(page.getByRole("link", { name: "Integrationsgryde" })).toBeVisible();

  // 5. Restore it.
  await page.getByRole("listitem").filter({ hasText: "Integrationsgryde" }).getByRole("button", { name: "Gendan" }).click();
  await expect(page.getByRole("heading", { name: "Integrationsgryde" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Arkiveret \(1\)/u })).toBeVisible();
});
