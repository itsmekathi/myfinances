import type { Page } from '@playwright/test';
import { formatMoney } from '@myfinances/shared';
import { uniqueTag } from '../../src/data';
import { expect, test } from '../../src/fixtures';

const inr = (minor: number) => formatMoney(minor, 'INR', 'en-IN');

/** The expense's row in a list (rows link to the editor). */
const row = (page: Page, note: string) => page.getByRole('link').filter({ hasText: note });

async function deleteFromEditor(page: Page, note: string) {
  await page.goto('/expenses');
  await row(page, note).click();
  await expect(page.getByRole('heading', { name: 'Edit expense' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click(); // confirm() is auto-accepted
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(row(page, note)).toHaveCount(0);
}

test.describe('expenses', () => {
  test('adds, edits and deletes an expense', async ({ loggedInPage: page }) => {
    const note = uniqueTag('note');

    await page.getByRole('button', { name: 'Add expense' }).click();
    await expect(page).toHaveURL(/\/expenses\/new$/);
    await expect(page.getByRole('heading', { name: 'New expense' })).toBeVisible();
    await page.getByLabel('Amount (INR)').fill('250');
    await page.getByLabel(/^Category/).selectOption({ label: 'Food & Dining' });
    await page.getByLabel(/^Subcategory/).selectOption({ label: 'Restaurants' });
    await page.getByLabel('Paid with').selectOption({ label: 'UPI' });
    await page.getByLabel('Note').fill(note);
    await page.getByRole('button', { name: 'Add expense' }).click();

    // Back on the list for the current month.
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(row(page, note)).toContainText(inr(25_000));
    await expect(row(page, note)).toContainText('Food & Dining › Restaurants');

    // It shows on the dashboard too.
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(row(page, note)).toBeVisible();

    // Edit.
    await row(page, note).click();
    await expect(page.getByRole('heading', { name: 'Edit expense' })).toBeVisible();
    await expect(page.getByLabel('Amount (INR)')).toHaveValue('250');
    await expect(page.getByText(/Added by/)).toBeVisible();
    await page.getByLabel('Amount (INR)').fill('300.5');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(row(page, note)).toContainText(inr(30_050));

    await deleteFromEditor(page, note);
  });

  test('calculates the total from an item breakdown', async ({ loggedInPage: page }) => {
    const note = uniqueTag('items');
    await page.goto('/expenses/new');
    await page.getByLabel('Note').fill(note);

    await page.getByRole('button', { name: 'Add item breakdown' }).click();
    await page.getByLabel('Item name').nth(0).fill('Milk');
    await page.getByLabel('Quantity').nth(0).fill('2');
    await page.getByLabel('Unit price').nth(0).fill('30');
    await page.getByRole('button', { name: 'Add item', exact: true }).click();
    await page.getByLabel('Item name').nth(1).fill('Bread');
    await page.getByLabel('Unit price').nth(1).fill('45.5');

    // The amount field turns into a computed total: 2 × 30 + 45.50.
    await expect(page.getByLabel('Amount (INR)')).toHaveCount(0);
    await expect(page.getByText('Calculated from items')).toBeVisible();
    await expect(page.locator('tfoot')).toContainText(inr(10_550));

    await page.getByRole('button', { name: 'Add expense' }).click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(row(page, note)).toContainText(inr(10_550));
    await expect(row(page, note).getByTitle('2 items')).toBeVisible();

    await deleteFromEditor(page, note);
  });

  test('requires an amount or items', async ({ loggedInPage: page }) => {
    await page.goto('/expenses/new');
    await page.getByRole('button', { name: 'Add expense' }).click();
    await expect(page.getByText('Enter an amount, or add items with prices')).toBeVisible();
    await expect(page).toHaveURL(/\/expenses\/new$/);
  });
});
