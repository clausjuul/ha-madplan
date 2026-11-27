import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MOCK_NOW } from "./helpers";

// Adding dishes in fake mode (OpenAI on unless ?noassist): link, text, AI fill and several at once.
const PHONE = { width: 390, height: 844 };

async function open(page: Page, query = ""): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.clock.install({ time: MOCK_NOW });
  await page.goto(`/${query}#/retter`);
  await page.getByRole("heading", { name: "Lasagne" }).first().waitFor();
}

async function noSeriousAxe(page: Page, label: string): Promise<void> {
  await page.waitForTimeout(500);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`), label).toEqual([]);
}

test("en opskrift fra et link ses igennem og gemmes først ved Gem ret", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Hent opskrift" }).click();
  const sheet = page.getByRole("dialog");
  await noSeriousAxe(page, "tilføj opskrift");
  await sheet.getByLabel("Link til opskrift").fill("https://opskrifter.example.dk/linsesuppe");
  await sheet.getByRole("button", { name: "Læs opskriften" }).click();

  const form = page.getByRole("dialog", { name: "Se opskriften igennem" });
  await expect(form.getByText("Opskriften er tjekket og rettet")).toBeVisible();
  await expect(form.getByLabel("Navn")).not.toHaveValue("");
  await noSeriousAxe(page, "forhåndsvisning");
  await form.getByLabel("Navn").fill("Linsesuppe fra nettet");
  await form.getByRole("button", { name: "Gem ret" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Linsesuppe fra nettet" })).toBeVisible();
});

test("en opskrift i tekst læses af AI", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Hent opskrift" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: "Tekst" }).click();
  await sheet.getByLabel("Opskriftens tekst").fill("Gulerodssuppe\n1 kg gulerødder\n1 l bouillon\nKog og blend.");
  await sheet.getByRole("button", { name: "Læs opskriften" }).click();
  const form = page.getByRole("dialog", { name: "Se opskriften igennem" });
  await expect(form.getByText(/AI har læst opskriften/u)).toBeVisible();
  await expect(form.getByLabel("Navn")).toHaveValue("Gulerodssuppe");
  await expect(form.getByLabel("Ingredienser")).toHaveValue("1 kg gulerødder\n1 l bouillon");
});

test("Ny ret: AI udfylder resten ud fra navnet og advarer om dubletter", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Ny ret" }).click();
  const form = page.getByRole("dialog", { name: "Ny ret" });
  await form.getByLabel("Navn").fill("lasagne");
  await expect(form.getByText(/Der findes allerede en ret, der hedder Lasagne/u)).toBeVisible();
  await form.getByLabel("Navn").fill("Mormors gryde");
  await expect(form.getByText(/Der findes allerede/u)).toHaveCount(0);
  await form.getByRole("button", { name: "Udfyld resten med AI" }).click();
  await expect(form.getByText(/AI har udfyldt de tomme felter/u)).toBeVisible();
  await expect(form.getByLabel("Kategori")).toHaveValue("Hverdag");
  await expect(form.getByLabel("Ingredienser")).not.toHaveValue("");
  await noSeriousAxe(page, "ny ret udfyldt");
  await form.getByRole("button", { name: "Gem ret" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mormors gryde" })).toBeVisible();
});

test("flere retter på én gang: dubletter er fravalgt, resten gemmes", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Flere/u }).click();
  const sheet = page.getByRole("dialog", { name: "Flere retter på én gang" });
  await sheet.getByLabel("Retter").fill("Lasagne\nFiskegratin\nFejlret\nPandekager");
  await sheet.getByRole("button", { name: "Skriv 4 opskrifter" }).click();

  await expect(sheet.getByText(/Findes allerede: Lasagne/u)).toBeVisible();
  await expect(sheet.getByRole("checkbox", { name: /Lasagne/u })).not.toBeChecked();
  await expect(sheet.getByRole("checkbox", { name: /Fiskegratin/u })).toBeChecked();
  await expect(sheet.getByRole("button", { name: "Prøv igen" })).toBeVisible();
  await noSeriousAxe(page, "flere retter");
  await sheet.getByRole("button", { name: "Gem 2 retter" }).click();

  await expect(page.getByRole("status").getByText("2 retter er tilføjet til jeres retter.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fiskegratin" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pandekager" })).toBeVisible();
});

test("uden OpenAI: kun link, ingen AI-knapper", async ({ page }) => {
  await open(page, "?noassist");
  await expect(page.getByRole("button", { name: /Flere/u })).toHaveCount(0);
  await page.getByRole("button", { name: "Ny ret" }).click();
  await expect(page.getByRole("button", { name: /Udfyld/u })).toHaveCount(0);
  await page.getByRole("button", { name: "Annullér" }).click();
  await page.getByRole("button", { name: "Hent opskrift" }).click();
  await page.getByRole("radio", { name: "Foto" }).click();
  await expect(page.getByText(/kræver en OpenAI-nøgle/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Læs opskriften" })).toHaveCount(0);
});

// A 2x2 PNG: enough for the browser to decode and downscale.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");

test("et foto af en kogebogsside læses af AI", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Hent opskrift" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: "Foto" }).click();
  await sheet.getByText("Tag eller vælg billede").locator("input").setInputFiles({ name: "side.png", mimeType: "image/png", buffer: PNG });
  await expect(sheet.getByRole("img", { name: "Billede 1 af opskriften" })).toBeVisible();
  await noSeriousAxe(page, "foto");
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/foto.png` });
  await sheet.getByRole("button", { name: "Fjern billede 1" }).click();
  await expect(sheet.getByRole("img")).toHaveCount(0);
  await sheet.getByText("Tag eller vælg billede").locator("input").setInputFiles({ name: "side.png", mimeType: "image/png", buffer: PNG });
  await sheet.getByRole("button", { name: "Læs opskriften" }).click();
  await expect(page.getByRole("dialog", { name: "Se opskriften igennem" }).getByLabel("Navn")).toHaveValue("Demo: Ret fra kogebogen");
});
