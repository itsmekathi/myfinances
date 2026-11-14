import { newCredentials } from '../../src/data';
import { expect, rememberAccount, test } from '../../src/fixtures';

test.describe('sign-up and sign-in', () => {
  test('signs up with the form and lands on the dashboard', async ({ page }) => {
    const creds = newCredentials('ui-signup');
    rememberAccount(creds); // global teardown deletes it
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByLabel('Email').fill(creds.email);
    await page.getByLabel('Username').fill(creds.username);
    await page.getByLabel('Password').fill(creds.password);
    await page.getByRole('button', { name: 'Create account' }).click();

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
