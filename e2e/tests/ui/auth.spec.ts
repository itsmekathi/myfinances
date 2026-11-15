import type { Response } from '@playwright/test';
import { newCredentials, uniqueTag } from '../../src/data';
import { clickRateLimited, expect, rememberAccount, test } from '../../src/fixtures';

const isRegister = (res: Response) =>
  res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/auth/register';

test.describe('sign-up and sign-in', () => {
  test('signs up with the form, creates a household and lands on the dashboard', async ({ page }) => {
    const creds = newCredentials('ui-signup');
    rememberAccount(creds); // global teardown deletes it
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByLabel('Email').fill(creds.email);
    await page.getByLabel('Username').fill(creds.username);
    await page.getByLabel('Password').fill(creds.password);
    // Registration is rate limited (10/min per IP) and other tests register users too.
    const res = await clickRateLimited(page, page.getByRole('button', { name: 'Create account' }), isRegister);
    expect(res.status()).toBe(201);

    // No household yet: pick "create" or "join".
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { name: /^Welcome/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Create a household/ })).toBeChecked();
    await page.getByLabel('Household name').fill(uniqueTag('ui-home'));
    await page.getByRole('button', { name: 'Create household' }).click();

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText(creds.email)).toBeVisible();
  });

  test('signs in with a username, survives a reload and signs out', async ({ page, account }) => {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill(account.username);
    await page.getByLabel('Password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // The session is restored from the httpOnly refresh cookie.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Know where your money goes.' })).toBeVisible();
    await page.goto('/expenses');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('shows an error for a wrong password', async ({ page, account }) => {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill(account.email);
    await page.getByLabel('Password').fill('definitely-wrong');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
