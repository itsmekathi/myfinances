import { expect, test } from '../../src/fixtures';

test.describe('public pages', () => {
  test('signed-out visitors see the landing page at /', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Know where your money goes.' })).toBeVisible();
    await page.getByRole('link', { name: 'Get started free' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('the privacy policy is public', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
  });

  test('app routes redirect to the login page', async ({ page }) => {
    for (const path of ['/expenses', '/expenses/new', '/categories', '/account']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test('unknown routes fall back to the home page', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page).toHaveURL(/\/$/);
  });
});
