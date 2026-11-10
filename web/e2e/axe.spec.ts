import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MOCK_NOW } from "./helpers";

/**
 * Accessibility: axe-core on every route at tablet and phone size (fake mode, dark scheme as shipped).
 * Serious and critical violations fail the test. Minor/moderate findings are printed, not asserted;
 * accepted ones (documented here): none at the time of writing.
 */
const SIZES = [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "390x844", width: 390, height: 844 },
];

async function open(page: Page, hash: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.clock.install({ time: MOCK_NOW });
  await page.goto(`/${hash}`);
  await page.waitForLoadState("networkidle");
}

async function audit(page: Page, label: string): Promise<void> {
  // Let entrance animations settle so contrast is measured on final colours.
  await page.waitForTimeout(700);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of violations) {
    console.log(`[axe ${label}] ${v.impact} ${v.id}: ${v.nodes.length} node(s) e.g. ${v.nodes[0]?.target.join(" ")}`);
  }
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`), label).toEqual([]);
}

const next = (page: Page) => page.getByRole("button", { name: /^Næste: / });

for (const size of SIZES) {
  test.describe(`axe ${size.name}`, () => {
    const routes: [string, string, (page: Page) => Promise<void>][] = [
      ["uge", "#/uge", (p) => p.getByRole("region", { name: "I aften" }).waitFor()],
      ["indkøb", "#/indkob", (p) => p.getByRole("heading", { name: /Indkøb/ }).first().waitFor()],
      ["retter", "#/retter", (p) => p.getByRole("heading", { name: "Lasagne" }).first().waitFor()],
      ["opskrift", "#/retter/lasagne", (p) => p.getByRole("heading", { name: "Ingredienser" }).waitFor()],
      ["opdag", "#/retter/opdag", (p) => p.getByRole("heading", { name: "Fra samlingen" }).waitFor()],
      ["indstillinger", "#/indstillinger", (p) => p.getByRole("heading", { name: "Familien" }).waitFor()],
      ["kogetilstand", "#/lav-mad/lasagne", (p) => p.getByRole("button").first().waitFor()],
    ];
    for (const [name, hash, ready] of routes) {
      test(name, async ({ page }) => {
        await open(page, hash, size);
        await ready(page);
        await audit(page, `${name} ${size.name}`);
      });
    }

    test("planlæg trin 1-3", async ({ page }) => {
      await open(page, "#/planlaeg", size);
      await expect(page.getByRole("heading", { name: "Hvilke dage skal planlægges?" })).toBeVisible();
      await audit(page, `planlæg 1 ${size.name}`);
      await next(page).click();
      await expect(page.getByRole("heading", { name: "Hvad har I lyst til?" })).toBeVisible();
      await audit(page, `planlæg 2 ${size.name}`);
      await page.getByRole("button", { name: "Lav forslag" }).click();
      await expect(page.getByRole("heading", { name: "Forslag til ugen" })).toBeVisible({ timeout: 15_000 });
      await audit(page, `planlæg 3 ${size.name}`);    });

    test("assist", async ({ page }) => {
      await open(page, "#/uge", size);
      await page.getByRole("button", { name: "Spørg Assist" }).click();
      await page.getByRole("dialog").waitFor();
      await audit(page, `assist ${size.name}`);
    });
  });
}
