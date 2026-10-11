import { test, expect } from '@playwright/test';

test('global Undo is dismissed after switching mocked accounts sharing ID zero', async ({ page }) => {
  let account = 'a@example.com';
  const writes: string[] = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const session = { user: { email: account, name: account }, expires: '2099-01-01T00:00:00Z' };
    if (url.pathname === '/api/auth/session') return route.fulfill({ json: session });
    if (url.pathname === '/api/user') {
      if (route.request().method() === 'PUT') { writes.push(`${account}:${url.search}`); return route.fulfill({ json: { success: true } }); }
      return route.fulfill({ json: { _id: account, email: account, assets: [{ id: 0, name: 'Shared holding', type: 'cash', quantity: 1, baseValue: 10, value: 10, isDeleted: account.startsWith('b') }] } });
    }
    if (url.pathname === '/api/prices') return route.fulfill({ json: [] });
    if (url.pathname === '/api/user/alpha-vantage-keys') return route.fulfill({ json: { keys: [] } });
    return route.fulfill({ json: { count: 0, remaining: 25, limit: 25 } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit Shared holding', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Shared holding', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  account = 'b@example.com';
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'nextauth.message', newValue: JSON.stringify({ event: 'session', data: { trigger: 'getSession' }, timestamp: Date.now() }) })));
  await expect(page.getByText('b@example.com', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  expect(writes).toEqual(['a@example.com:?action=softDelete']);
  await page.getByRole('button', { name: 'Market data settings', exact: true }).click();
  await expect(page.getByText('No private keys saved.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Market data settings', exact: true })).toBeFocused();
});

for (const action of ['Cancel', 'Escape', 'discard', 'save']) {
  test(`restores the actual edit origin after ${action}`, async ({ page }) => {
    await page.goto('/?demo=true');
    const origin = page.getByRole('button', { name: 'Edit Physical Gold', exact: true });
    await origin.click();
    if (action === 'discard') {
      await page.getByLabel('Name *', { exact: true }).fill('Changed');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    } else if (action === 'save') await page.getByRole('button', { name: 'Save', exact: true }).click();
    else if (action === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(origin).toBeFocused();
  });
}

test('reverted fields close cleanly', async ({ page }) => {
  await page.goto('/?demo=true');
  await page.getByRole('button', { name: 'Edit Physical Gold', exact: true }).click();
  await page.getByLabel('Name *', { exact: true }).fill('Changed');
  await page.getByLabel('Name *', { exact: true }).fill('Physical Gold');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('200 percent text reflows without horizontal clipping', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=true');
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Edit Physical Gold', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('text-200-dialog.png'), fullPage: false });
});

test('reduced motion disables dialog animation and focus reveals skip link', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo=true');
  await expect(page).toHaveTitle(/Asset Tracker.*Demo/);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to assets' })).toBeInViewport();
  await page.getByRole('button', { name: 'Edit Physical Gold', exact: true }).click();
  expect(await page.getByRole('dialog').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});
