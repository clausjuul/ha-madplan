import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MOCK_NOW } from "./helpers";

// Adding dishes in fake mode (OpenAI on unless ?noassist): one "Tilføj ret" sheet for a link, pasted text, photos or by hand.
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
  await page.getByRole("button", { name: "Tilføj ret" }).click();
  const sheet = page.getByRole("dialog");
  await noSeriousAxe(page, "tilføj opskrift");
  await sheet.getByLabel("Link eller opskrift").fill("https://opskrifter.example.dk/linsesuppe");
  await expect(sheet.getByText("Link til opskrifter.example.dk")).toBeVisible();
  await sheet.getByRole("button", { name: "Hent opskrift" }).click();

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
  await page.getByRole("button", { name: "Tilføj ret" }).click();
  const sheet = page.getByRole("dialog");
  const recipe = "Gulerodssuppe\n1 kg gulerødder\n1 l bouillon\nKog og blend.";
  await sheet.getByLabel("Link eller opskrift").fill(recipe);
  await expect(sheet.getByText(/Tekst på 4 linjer/u)).toBeVisible();
  await sheet.getByRole("button", { name: "Hent opskrift" }).click();
  const form = page.getByRole("dialog", { name: "Se opskriften igennem" });
  await expect(form.getByText(/AI har læst opskriften/u)).toBeVisible();
  await expect(form.getByLabel("Navn")).toHaveValue("Gulerodssuppe");
  await expect(form.getByLabel("Ingredienser")).toHaveValue("1 kg gulerødder\n1 l bouillon");
  // Back to the start, with the pasted text still there.
  await form.getByRole("button", { name: "Tilbage" }).click();
  await expect(page.getByRole("dialog", { name: "Tilføj ret" }).getByLabel("Link eller opskrift")).toHaveValue(recipe);
});

test("Ny ret: AI udfylder resten ud fra navnet og advarer om dubletter", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Tilføj ret" }).click();
  await page.getByRole("button", { name: /Skriv selv/u }).click();
  const form = page.getByRole("dialog", { name: "Ny ret" });
  await form.getByLabel("Navn").fill("lasagne");
  await expect(form.getByText(/Der findes allerede en ret, der hedder Lasagne/u)).toBeVisible();
  await form.getByLabel("Navn").fill("Mormors gryde");
  await expect(form.getByText(/Der findes allerede/u)).toHaveCount(0);
  await form.getByRole("button", { name: "Udfyld resten med AI" }).click();
  await expect(form.getByText(/AI har udfyldt de tomme felter/u)).toBeVisible();
  await expect(form.getByLabel("Kategori")).toHaveValue("Hverdag");
  await expect(form.getByLabel("Ingredienser")).not.toHaveValue("");
  await form.getByText("Kan fryses").click();
  await expect(form.getByLabel("Kan fryses")).toBeChecked();
  await noSeriousAxe(page, "ny ret udfyldt");
  await form.getByRole("button", { name: "Gem ret" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mormors gryde" })).toBeVisible();
});

test("uden OpenAI: kun link, ingen AI-knapper", async ({ page }) => {
  await open(page, "?noassist");
  await page.getByRole("button", { name: "Tilføj ret" }).click();
  await expect(page.getByRole("button", { name: /Foto/u })).toBeDisabled();
  await expect(page.getByText("Kræver en OpenAI-nøgle")).toBeVisible();
  await page.getByLabel("Link til opskrift").fill("Bare noget tekst");
  await page.getByRole("button", { name: "Hent opskrift" }).click();
  await expect(page.getByText(/Tekst kan kun læses med en OpenAI-nøgle/u)).toBeVisible();
  await page.getByRole("button", { name: /Skriv selv/u }).click();
  await expect(page.getByRole("dialog", { name: "Ny ret" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Udfyld/u })).toHaveCount(0);
  await page.getByRole("button", { name: "Annullér" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// A 2x2 PNG: enough for the browser to decode and downscale.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");

test("et foto af maden genkendes, kogebogssider læses af AI", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Tilføj ret" }).click();
  const sheet = page.getByRole("dialog");
  const file = { name: "side.png", mimeType: "image/png", buffer: PNG };
  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: /Foto/u }).click();
  await (await chooser).setFiles(file);
  await expect(page.getByRole("dialog", { name: "Foto" })).toBeVisible();
  await expect(sheet.getByRole("img", { name: "Billede 1 af opskriften" })).toBeVisible();
  await noSeriousAxe(page, "foto");
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/foto.png` });
  await sheet.getByRole("button", { name: "Fjern billede 1" }).click();
  await expect(sheet.getByRole("img")).toHaveCount(0);
  const again = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "Tag eller vælg billede" }).click();
  await (await again).setFiles(file);
  await sheet.getByRole("button", { name: "Læs billedet" }).click();
  // One photo is a photo of the food in the demo: the dish is recognised and the photo becomes its picture.
  const form = page.getByRole("dialog", { name: "Se opskriften igennem" });
  await expect(form.getByLabel("Navn")).toHaveValue("Demo: Ret fra billedet");
  await expect(form.getByText(/genkendt retten på billedet/u)).toBeVisible();
  await expect(form.getByRole("img", { name: "Billede af retten" })).toHaveAttribute("src", /^data:image\/jpeg/u);

  // Two pages of a cookbook are read as a recipe.
  await form.getByRole("button", { name: "Tilbage" }).click();
  const more = page.getByRole("dialog", { name: "Foto" });
  const third = page.waitForEvent("filechooser");
  await more.getByRole("button", { name: "Næste side" }).click();
  await (await third).setFiles(file);
  await more.getByRole("button", { name: "Læs 2 billeder" }).click();
  await expect(page.getByRole("dialog", { name: "Se opskriften igennem" }).getByLabel("Navn")).toHaveValue("Demo: Ret fra kogebogen");
});
