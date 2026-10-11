import { expect, test } from "@playwright/test";

test("demo login → create asset → filter → edit", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
  await page.getByRole("link", { name: /open interactive demo/i }).click();
  await expect(page.getByText("Anonymous local demo")).toBeVisible();

  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  await page.getByRole("menuitem", { name: "Stock" }).click();
  await page.getByLabel("Name *").fill("Test Index Fund");
  await page.getByLabel("Symbol / Ticker").fill("TEST");
  await page.getByLabel("Units *").fill("2");
  await page.getByLabel("Unit Price *").fill("125");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("article", { name: /Test Index Fund/ })).toBeVisible();

  await page.getByRole("button", { name: "Stocks (2)", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stocks (2)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("article", { name: /Bitcoin/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit Test Index Fund" }).click();
  await page.getByLabel("Units *").fill("4");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("article", { name: /Test Index Fund/ })).toContainText("500,00 €");
});
