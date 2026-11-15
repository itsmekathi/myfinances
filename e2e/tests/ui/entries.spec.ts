import type { Page } from '@playwright/test';
import { formatMoney } from '@myfinances/shared';
import { uniqueTag } from '../../src/data';
import { expect, test } from '../../src/fixtures';

const inr = (minor: number) => formatMoney(minor, 'INR', 'en-IN');

/** The entry's row in a list (rows link to the editor). */
const row = (page: Page, text: string) => page.getByRole('link').filter({ hasText: text });

/** Deletes one matching entry through its editor; `remaining` is how many should be left. */
async function deleteEntry(page: Page, listPath: string, text: string, heading: string, remaining = 0) {
  await page.goto(listPath);
  await row(page, text).first().click();
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click(); // confirm() is auto-accepted
  await expect(page).toHaveURL(new RegExp(`${listPath}$`));
  await expect(row(page, text)).toHaveCount(remaining);
}

test.describe('income and investments', () => {
  test('adds, edits, duplicates and deletes income', async ({ loggedInPage: page }) => {
    const source = uniqueTag('employer');

    await page.getByRole('link', { name: 'Income', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Income' })).toBeVisible();
    await page.getByRole('link', { name: 'Add income' }).first().click();
    await expect(page.getByRole('heading', { name: 'New income' })).toBeVisible();
    // No time field or item breakdown for income.
    await expect(page.getByLabel('Time')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add item breakdown' })).toHaveCount(0);
    await page.getByLabel('Amount (INR)').fill('50000');
    await page.getByLabel(/^Category/).selectOption({ label: 'Salary' });
    await page.getByLabel(/^Subcategory/).selectOption({ label: 'Bonus' });
    await page.getByLabel('From').fill(source);
    await page.getByRole('button', { name: 'Add income' }).click();

    await expect(page).toHaveURL(/\/income$/);
    await expect(row(page, source)).toContainText(inr(50_000_00));
    await expect(row(page, source)).toContainText('Salary › Bonus');

    // Expense categories aren't offered for income.
    await page.goto('/income/new');
    await expect(page.getByLabel(/^Category/).locator('option', { hasText: 'Food & Dining' })).toHaveCount(0);

    // Edit.
    await page.goto('/income');
    await row(page, source).click();
    await expect(page.getByRole('heading', { name: 'Edit income' })).toBeVisible();
    await page.getByLabel('Amount (INR)').fill('55000');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(row(page, source)).toContainText(inr(55_000_00));

    // Duplicate pre-fills a new entry.
    await row(page, source).click();
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.getByRole('heading', { name: 'New income' })).toBeVisible();
    await expect(page.getByLabel('Amount (INR)')).toHaveValue('55000');
    await expect(page.getByLabel('From')).toHaveValue(source);
    await page.getByRole('button', { name: 'Add income' }).click();
    await expect(row(page, source)).toHaveCount(2);

    await deleteEntry(page, '/income', source, 'Edit income', 1);
    await deleteEntry(page, '/income', source, 'Edit income');
  });

  test('requires a positive amount', async ({ loggedInPage: page }) => {
    await page.goto('/investments/new');
    await page.getByRole('button', { name: 'Add investment' }).click();
    await expect(page.getByText('Enter an amount greater than zero')).toBeVisible();
    await expect(page).toHaveURL(/\/investments\/new$/);
  });

  test('the dashboard cards link to their lists', async ({ loggedInPage: page }) => {
    await page.getByRole('main').getByRole('link').filter({ hasText: 'Invested' }).click();
    await expect(page).toHaveURL(/\/investments$/);
    await expect(page.getByRole('heading', { name: 'Investments' })).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await page.getByRole('main').getByRole('link').filter({ hasText: 'Income' }).click();
    await expect(page).toHaveURL(/\/income$/);
  });

  test('shows a new investment on the dashboard', async ({ loggedInPage: page }) => {
    const fund = uniqueTag('fund');

    await page.goto('/investments/new');
    await expect(page.getByRole('heading', { name: 'New investment' })).toBeVisible();
    await page.getByLabel('Amount (INR)').fill('1234');
    await page.getByLabel(/^Category/).selectOption({ label: 'Mutual funds' });
    await page.getByLabel('Invested in').fill(fund);
    await page.getByRole('button', { name: 'Add investment' }).click();
    await expect(page).toHaveURL(/\/investments$/);
    await expect(row(page, fund)).toContainText(inr(1_234_00));

    // The worker's account only gets investments from this test, so the card shows exactly this amount.
    await page.getByRole('link', { name: 'Dashboard' }).click();
    const invested = page.getByRole('link').filter({ hasText: 'Invested' });
    await expect(invested).toContainText(inr(1_234_00));
    await expect(page.getByText(/Left over/)).toBeVisible();

    await deleteEntry(page, '/investments', fund, 'Edit investment');
  });
});
