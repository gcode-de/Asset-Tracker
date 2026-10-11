import { test, expect } from "@playwright/test";
test('compact mobile view exposes an identity, value and labelled add action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=true');
  await expect(page.getByRole('button', { name: 'Compact list' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Add asset', exact: true })).toBeInViewport();
  await expect(page.getByRole('article').first().getByRole('heading')).toBeInViewport();
  await expect(page.getByRole('article').first().locator('.font-bold')).toBeInViewport();
  await page.screenshot({ path: '/home/hermes/.hermes/cache/scratch/asset-tracker-ux-implemented/compact-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Cards', exact: true }).click();
  await expect(page.getByRole('article').first().locator('[style*="background-image"]')).toBeVisible();
});
test('category reset preserves archive choice and history restores view', async ({ page }) => {
  await page.goto('/?demo=true');
  await page.getByRole('button', { name: 'Real Estate (0)', exact: true }).click();
  await expect(page).toHaveURL(/types=real_estate/);
  await expect(page.getByText(/0 of 4 holdings/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear category filters', exact: true }).first().click();
  await expect(page.getByRole('switch', { name: 'Include deleted holdings' })).toHaveAttribute('aria-checked', 'false');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Real Estate (0)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Real Estate (0)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(page.getByRole('button', { name: 'Real Estate (0)', exact: true })).toHaveAttribute('aria-pressed', 'false');
});
for (const width of [320, 390]) {
  test(`gold dialog bounded and footer reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 667 });
    await page.goto('/?demo=true');
    await page.getByRole('button', { name: 'Edit Physical Gold', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(667);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 80) })));
    expect(await page.evaluate(() => document.documentElement.scrollWidth), JSON.stringify(overflow)).toBeLessThanOrEqual(width);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
    await page.getByLabel('Notes').focus();
    await expect(page.getByLabel('Notes')).toBeInViewport();
    await page.screenshot({ path: `/home/hermes/.hermes/cache/scratch/asset-tracker-ux-implemented/dialog-${width}.png` });
  });
}
