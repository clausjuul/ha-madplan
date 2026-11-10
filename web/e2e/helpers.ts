import type { Page } from "@playwright/test";

/** A Monday matching the design mockups (week 46). */
export const MOCK_NOW = new Date("2026-11-09T17:30:00");

/** Opens the app in fake-API mode with a fixed "now", and waits for the week to render. */
export async function openApp(page: Page, hash = ""): Promise<void> {
  await page.clock.install({ time: MOCK_NOW });
  await page.goto(`/${hash}`);
  await page.getByRole("region", { name: "I aften" }).waitFor();
  await page.waitForLoadState("networkidle");
}
