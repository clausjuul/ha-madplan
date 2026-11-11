import { expect, test } from "@playwright/test";

// Real server + web in server mode. See web/README.md ("Integration test").
// Plans three days four weeks ahead, so the test does not depend on what other specs planned.
test.use({ viewport: { width: 1280, height: 800 } });

const copenhagenToday = (): string =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());

const addDays = (key: string, amount: number): string => {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

const mondayOf = (key: string): string => {
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay() || 7;
  return addDays(key, 1 - weekday);
};

test("@integration a local plan draft is made, edited and saved into the week", async ({ page, request }) => {
  const from = addDays(copenhagenToday(), 28);
  const current = await (await request.get("/api/plan-drafts/current")).json();
  if (current) await request.delete(`/api/plan-drafts/${current.id}`);

  await page.goto("/#/planlaeg");
  await expect(page.getByRole("heading", { name: "Hvilke dage skal planlægges?" })).toBeVisible();
  await page.getByLabel("Startdato").fill(from);
  for (let i = 0; i < 4; i += 1) await page.getByRole("button", { name: "Færre dage" }).click();
  await expect(page.getByText("3 dage", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /Næste: Ønsker/ }).click();

  // Without an OpenAI key only the local engine is offered, and it says so honestly.
  await expect(page.getByRole("radio", { name: /Assist/ })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Hurtigt forslag \(lokalt\)/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/ikke slået til/u)).toBeVisible();
  await page.getByRole("button", { name: "Lav forslag" }).click();

  await expect(page.getByRole("heading", { name: "Forslag til ugen" })).toBeVisible();
  await expect(page.getByText(/Hurtigt forslag ud fra jeres retter/)).toBeVisible();
  const rows = page.getByRole("article");
  await expect(rows).toHaveCount(3);

  // Lock the first day, redo the second.
  await rows.nth(0).getByRole("button", { name: "Lås dagen" }).click();
  await expect(rows.nth(0).getByRole("button", { name: "Lås dagen op" })).toHaveAttribute("aria-pressed", "true");
  const regenerated = page.waitForResponse((response) => response.url().includes("/regenerate") && response.ok());
  await rows.nth(1).getByRole("button", { name: /Lav om/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Nyt forslag" }).click();
  await regenerated;
  await expect(rows).toHaveCount(3);

  // A reload resumes the same draft from the server.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Forslag til ugen" })).toBeVisible();
  await expect(rows.nth(0).getByRole("button", { name: "Lås dagen op" })).toBeVisible();

  const names = await rows.locator("strong").allInnerTexts();
  expect(names).toHaveLength(3);
  await page.getByRole("button", { name: "Gem i ugeplanen" }).click();

  await expect(page).toHaveURL(new RegExp(`#/uge/${mondayOf(from)}`, "u"));
  for (const name of names) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  expect(await (await request.get("/api/plan-drafts/current")).json()).toBeNull();
  const meals = (await (await request.get("/api/bootstrap")).json()).meals as Record<string, { dishId: string; locked: boolean }>;
  expect(meals[from]?.locked).toBe(true);
});
