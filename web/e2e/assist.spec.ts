import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { MOCK_NOW } from "./helpers";

const SHOTS =
  process.env.SHOTS_DIR ??
  "C:\\Users\\claus\\AppData\\Local\\Temp\\claude\\b6460fcb0a68ee27\\b55406dd-907d-48a1-a46d-c7d2c094cd3d\\scratchpad\\shots\\phase5b";

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

const TABLET = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

async function open(page: Page, size: { width: number; height: number }, query = ""): Promise<void> {
  await page.setViewportSize(size);
  await page.clock.install({ time: MOCK_NOW });
  await page.goto(`/${query}#/uge`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Spørg Assist" }).click();
}

async function askForProposal(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Byt torsdag ud med noget vegetarisk" }).click();
  await dialog.getByRole("region", { name: "Forslag fra Assist" }).waitFor();
}

test("assist på tablet med forslag", async ({ page }) => {
  await open(page, TABLET);
  await expect(page.getByRole("heading", { name: "Assist · Demo" })).toBeVisible();
  await askForProposal(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}\\assist-1280x800.png` });
});

test("assist på telefon med forslag", async ({ page }) => {
  await open(page, PHONE);
  await askForProposal(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}\\assist-390x844.png` });
});

test("udfør ændrer ugen, og afvis ændrer intet", async ({ page }) => {
  await open(page, TABLET);
  const dialog = page.getByRole("dialog");
  await askForProposal(page);
  await dialog.getByRole("button", { name: "Udfør" }).click();
  await expect(dialog.getByText("Udført")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}\\assist-applied-1280x800.png` });

  // The conversation is kept for the session and "Ny samtale" clears it.
  await page.reload();
  await page.getByRole("button", { name: "Spørg Assist" }).click();
  await expect(page.getByRole("dialog").getByText("Udført")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Ny samtale" }).click();
  await expect(page.getByRole("dialog").getByRole("group", { name: "Forslag til spørgsmål" })).toBeVisible();

  await askForProposal(page);
  await dialog.getByRole("button", { name: "Afvis" }).click();
  await expect(dialog.getByText("Afvist. Der er ikke ændret noget.")).toBeVisible();
});

test("assist uden motor forklarer hvorfor", async ({ page }) => {
  await open(page, PHONE, "?noassist");
  await expect(page.getByRole("heading", { name: "Assist er ikke tilgængelig" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}\\assist-unavailable-390x844.png` });
});
