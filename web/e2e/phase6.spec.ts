import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { MOCK_NOW } from "./helpers";

const SHOTS =
  process.env.SHOTS_DIR ??
  "C:\\Users\\claus\\AppData\\Local\\Temp\\claude\\b6460fcb0a68ee27\\b55406dd-907d-48a1-a46d-c7d2c094cd3d\\scratchpad\\shots\\phase6";
const FIXTURE = resolve(process.cwd(), "e2e/fixtures/v1.json");

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

async function open(page: Page, hash: string, size: { width: number; height: number }, query = ""): Promise<void> {
  await page.setViewportSize(size);
  await page.clock.install({ time: MOCK_NOW });
  await page.goto(`/${query}${hash}`);
  await page.waitForLoadState("networkidle");
}

const TABLET = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

test("retter på tablet", async ({ page }) => {
  await open(page, "#/retter", TABLET);
  await page.getByRole("heading", { name: "Lasagne" }).first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}\\retter-1280x800.png` });
});

test("retter på telefon", async ({ page }) => {
  await open(page, "#/retter", PHONE);
  await page.getByRole("heading", { name: "Lasagne" }).first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}\\retter-390x844.png` });
});

test("opskrift", async ({ page }) => {
  await open(page, "#/retter/lasagne", TABLET);
  await page.getByRole("heading", { name: "Ingredienser" }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}\\recipe-1280x800.png` });
});

test("redigér-ark på telefon", async ({ page }) => {
  await open(page, "#/retter/lasagne", PHONE);
  await page.getByRole("button", { name: "Redigér" }).click();
  await page.getByRole("dialog").getByLabel("Navn").waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}\\edit-sheet-390x844.png` });
});

test("opdag nyt", async ({ page }) => {
  await open(page, "#/retter/opdag", TABLET);
  await page.getByRole("heading", { name: "Fra samlingen" }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}\\opdag-1280x800.png` });
});

test("gem til senere vises under Gemt", async ({ page }) => {
  await open(page, "#/retter/opdag", TABLET);
  await page.getByRole("heading", { name: "Fra samlingen" }).waitFor();
  await page.getByRole("button", { name: "Gem til senere" }).first().click();
  await page.getByRole("tab", { name: "Gemt (1)" }).click();
  await expect(page.getByRole("button", { name: "Gemt" })).toHaveCount(1);
  await page.getByRole("button", { name: "Gemt" }).click();
  await expect(page.getByText("Du har ikke gemt nogen retter endnu.")).toBeVisible();
});

test("indstillinger", async ({ page }) => {
  await open(page, "#/indstillinger", TABLET);
  await page.getByRole("heading", { name: "Familien" }).waitFor();
  await page.screenshot({ path: `${SHOTS}\\settings-1280x800.png`, fullPage: false });
});

test("indstillinger på telefon", async ({ page }) => {
  await open(page, "#/indstillinger", PHONE);
  await page.getByRole("heading", { name: "Familien" }).waitFor();
  await page.screenshot({ path: `${SHOTS}\\settings-390x844.png` });
});

test("forhåndsvisning af import", async ({ page }) => {
  await open(page, "#/indstillinger", TABLET, "?empty");
  await page.getByLabel("Vælg v1-fil").setInputFiles(FIXTURE);
  await page.getByText("Gemte idéer").waitFor();
  await page.getByRole("heading", { name: "Importér fra den gamle Meal Planner" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}\\import-preview-1280x800.png` });
});

test("opret og arkivér en ret i demotilstand", async ({ page }) => {
  await open(page, "#/retter", TABLET);
  await page.getByRole("button", { name: "Ny ret" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Gem ret" }).click();
  await expect(dialog.getByText("Giv retten et navn.")).toBeVisible();
  await dialog.getByLabel("Navn").fill("Testgryde");
  await dialog.getByLabel("Kategori").fill("Gryderet");
  await dialog.getByLabel("Ingredienser").fill("løg\nkartofler");
  await dialog.getByRole("button", { name: "Gem ret" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Testgryde" })).toBeVisible();
  await page.getByRole("button", { name: "Arkivér" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Arkivér" }).click();
  await expect(page.getByRole("status").getByText(/Historikken er bevaret/u)).toBeVisible();
  await page.getByRole("button", { name: "Fortryd" }).click();
  await page.goto("/#/retter/opdag");
});
