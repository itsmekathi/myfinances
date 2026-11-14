import type { Response } from '@playwright/test';
import { clickRateLimited, expect, signIn, test } from '../../src/fixtures';

const isDeleteMe = (res: Response) => res.request().method() === 'DELETE' && new URL(res.url()).pathname === '/api/me';

test.describe('account', () => {
  // DELETE /api/me allows 5 requests a minute per IP, shared with the API suite's deletion test.
  test.describe.configure({ timeout: 240_000 });

  test('shows account details and deletes the account after confirmation', async ({ page, api, newAccount }) => {
    const u = await newAccount('ui-del');
    await signIn(page, u);

    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expect(page.getByText(u.email).first()).toBeVisible();
    await expect(page.getByText('Email and password')).toBeVisible();

    await page.getByRole('button', { name: 'Delete my account' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Delete your account?' })).toBeVisible();

    const confirm = dialog.getByRole('button', { name: 'Delete permanently' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Type your email').fill('someone-else@example.test');
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Type your email').fill(u.email);
    await dialog.getByLabel('Password').fill(u.password);
    await expect(confirm).toBeEnabled();
    expect((await clickRateLimited(page, confirm, isDeleteMe)).status()).toBe(204);

    // Signed out, on the public home page.
    await expect(page.getByRole('heading', { name: 'Know where your money goes.' })).toBeVisible();
    await page.goto('/expenses');
    await expect(page).toHaveURL(/\/login$/);

    // The account is really gone.
    const login = await api.post('/api/auth/login', { identifier: u.email, password: u.password });
    expect(login.status()).toBe(401);
  });

  test('refuses a wrong password', async ({ page, newAccount }) => {
    const u = await newAccount('ui-keep');
    await signIn(page, u);
    await page.goto('/account');
    await page.getByRole('button', { name: 'Delete my account' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Type your email').fill(u.email);
    await dialog.getByLabel('Password').fill('wrong-password');
    // The app's API client treats any 401 as an expired session: it refreshes and sends the
    // DELETE again, so one wrong password costs two of DELETE /me's 5 requests a minute, and the
    // retry can come back 429. Judge by what the dialog finally shows; if throttled, try again.
    const incorrect = dialog.getByText('Incorrect password');
    const outcome = dialog.getByText(/Incorrect password|Too Many Requests/);
    for (let attempt = 1; ; attempt++) {
      await dialog.getByRole('button', { name: 'Delete permanently' }).click();
      await expect(outcome).toBeVisible();
      if ((await incorrect.isVisible()) || attempt === 3) break;
      console.warn('[e2e] wrong-password delete was rate-limited; trying again in 61s');
      await page.waitForTimeout(61_000);
    }
    await expect(incorrect).toBeVisible();
    await expect(dialog).toBeVisible(); // still open: nothing was deleted
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
