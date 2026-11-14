import { files, uniqueTag } from '../../src/data';
import { expect, test } from '../../src/fixtures';

test.describe('attachments', () => {
  test('uploads a receipt with a new expense, previews it and removes it', async ({ loggedInPage: page }) => {
    const note = uniqueTag('receipt');
    await page.goto('/expenses/new');
    await page.getByLabel('Amount (INR)').fill('99');
    await page.getByLabel('Note').fill(note);

    // Queued until the expense is saved.
    await page.locator('input[type="file"]').setInputFiles(files.png());
    await expect(page.getByText('will upload on save')).toBeVisible();

    await page.getByRole('button', { name: 'Add expense' }).click();
    await expect(page).toHaveURL(/\/expenses$/);
    const row = page.getByRole('link').filter({ hasText: note });
    await expect(row.getByTitle('1 attachments')).toBeVisible();

    // The saved file is downloaded with the auth header and shown as a preview.
    await row.click();
    const preview = page.getByRole('img', { name: 'receipt.png' });
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('src', /^blob:/);

    // On an existing expense, removing deletes it straight away (confirm() is auto-accepted).
    await page.getByRole('button', { name: 'Remove receipt.png' }).click();
    await expect(preview).toHaveCount(0);

    // Uploading to an existing expense happens immediately.
    await page.locator('input[type="file"]').setInputFiles(files.pdf());
    await expect(page.getByText('invoice.pdf')).toBeVisible();
    await expect(page.getByText('will upload on save')).toHaveCount(0);

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(row).toHaveCount(0);
  });

  test('rejects unsupported file types before uploading', async ({ loggedInPage: page }) => {
    await page.goto('/expenses/new');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(page.getByText('notes.txt: only images (JPEG, PNG, WebP, HEIC) and PDFs are allowed')).toBeVisible();
    await expect(page.getByText('will upload on save')).toHaveCount(0);
  });
});
