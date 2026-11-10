import { expect, test } from "@playwright/test";

// Real server + web in server mode. See web/README.md ("Integration test").
test.use({ viewport: { width: 390, height: 844 } });

/** Today in the server's zone (TZ=Europe/Copenhagen), as YYYY-MM-DD. */
const today = (): string =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());

test("@integration a checked shopping item survives a reload", async ({ page, request }) => {
  await request.post("/api/shopping/reset");
  const planned = await request.put(`/api/meals/${today()}`, { data: { dishId: "lasagne" } });
  expect(planned.ok()).toBeTruthy();

  await page.goto("/#/indkob");
  const rows = page.getByRole("button", { pressed: false }).filter({ hasText: /\S/u });
  await expect(page.getByRole("heading", { name: "Indkøb" })).toBeVisible();
  const first = page.locator("li button[aria-pressed=false]").first();
  await first.waitFor();
  await expect(rows.first()).toBeVisible();
  const name = (await first.locator("span").nth(2).innerText()).trim();

  await first.click();
  await expect(page.getByRole("heading", { name: /I kurven · 1/u })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: /I kurven · 1/u })).toBeVisible();
  await expect(page.locator("li button[aria-pressed=true]").filter({ hasText: name })).toBeVisible();
});
