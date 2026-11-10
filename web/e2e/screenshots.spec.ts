import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";
import { openApp } from "./helpers";

const SHOTS =
  process.env.SHOTS_DIR ??
  "C:\\Users\\claus\\AppData\\Local\\Temp\\claude\\b6460fcb0a68ee27\\b55406dd-907d-48a1-a46d-c7d2c094cd3d\\scratchpad\\shots";

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test("uge på tablet 1280x800", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.screenshot({ path: `${SHOTS}\\uge-1280x800.png` });
});

test("uge på telefon 390x844", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.screenshot({ path: `${SHOTS}\\uge-390x844.png` });
});

test("uge på 840x1000", async ({ page }) => {
  await page.setViewportSize({ width: 840, height: 1000 });
  await openApp(page);
  await page.screenshot({ path: `${SHOTS}\\uge-840x1000.png` });
});

test("handlingsark åbent", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.getByRole("button", { name: /Handlinger for Onsdag 11\./ }).click();
  await page.getByRole("dialog").getByText("Byt med anden dag").waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}\\day-sheet-1280x800.png` });
});

test("ret-vælger åben på telefon", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.getByRole("button", { name: /Handlinger for Tirsdag 10\./ }).click();
  await page.getByRole("button", { name: /Byt ret/ }).click();
  await page.getByPlaceholder("Søg i retter").waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}\\picker-390x844.png` });
});
