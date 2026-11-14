import { uniqueTag } from '../../src/data';
import { expect, test } from '../../src/fixtures';

test.describe('categories', () => {
  test('adds a category and subcategory, uses them in the editor, then deletes them', async ({ loggedInPage: page }) => {
    const name = uniqueTag('cat');
    const sub = uniqueTag('sub');

    await page.getByRole('link', { name: 'Categories' }).click();
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
    await page.getByPlaceholder('New category name').fill(name);
    await page.getByRole('button', { name: 'Add category' }).click();

    const catRow = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Delete ${name}`, exact: true }) });
    await expect(catRow).toBeVisible();
    await expect(catRow).toContainText('0 sub');

    await catRow.getByRole('button', { name: 'Expand' }).click();
    await catRow.getByPlaceholder(`Add subcategory to ${name}`).fill(sub);
    await catRow.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(catRow.getByText(sub)).toBeVisible();
    await expect(catRow).toContainText('1 sub');

    // Both appear in the expense editor.
    await page.goto('/expenses/new');
    await page.getByLabel(/^Category/).selectOption({ label: name });
    await expect(page.getByLabel(/^Subcategory/).locator('option', { hasText: sub })).toHaveCount(1);

    // Deleting the parent removes the subcategory too (confirm() is auto-accepted).
    await page.goto('/categories');
    await page.getByRole('button', { name: `Delete ${name}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `Delete ${name}`, exact: true })).toHaveCount(0);
    await expect(page.getByText(sub)).toHaveCount(0);
  });

  test('shows an error for a duplicate top-level name', async ({ loggedInPage: page }) => {
    await page.goto('/categories');
    await page.getByPlaceholder('New category name').fill('Groceries');
    await page.getByRole('button', { name: 'Add category' }).click();
    await expect(page.getByText('A category with this name already exists here')).toBeVisible();
  });
});
