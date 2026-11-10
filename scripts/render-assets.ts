/**
 * Renders the Home Assistant app icon (128x128) and logo (250x100) from the sources in scripts/assets/.
 *   npx playwright install chromium   (once)
 *   node scripts/render-assets.ts
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "scripts", "assets");
const out = join(root, "madplan");

const jobs = [
  { source: "icon.svg", file: "icon.png", width: 128, height: 128 },
  { source: "logo.html", file: "logo.png", width: 250, height: 100 },
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const job of jobs) {
    // 2x device scale would give crisper art, but the HA store expects the exact pixel sizes.
    const page = await browser.newPage({ viewport: { width: job.width, height: job.height } });
    await page.goto(pathToFileURL(join(assets, job.source)).href);
    await page.evaluate("document.fonts.ready");
    await page.screenshot({ path: join(out, job.file), clip: { x: 0, y: 0, width: job.width, height: job.height } });
    await page.close();
    console.log(`madplan/${job.file} (${job.width}x${job.height})`);
  }
} finally {
  await browser.close();
}
