import type { Page } from '@playwright/test';
import type { JoinRequestDto } from '@myfinances/shared';
import { expectJson } from '../../src/api-client';
import { isoDate, uniqueTag } from '../../src/data';
import { expect, goInApp, signIn, test, type Account } from '../../src/fixtures';

/** Joins `member` to `owner`'s household with `role`, through a request and an approval. */
async function addMember(owner: Account, member: Account, role: 'editor' | 'viewer') {
  const req = await expectJson<JoinRequestDto>(await member.api.post(`${owner.base}/join-requests`, {}), 201);
  await expectJson(await owner.api.post(`/api/join-requests/${req.id}/approve`, { role }), 200);
}

const row = (page: Page, text: string) => page.getByRole('link').filter({ hasText: text });

test.describe('what each role sees', () => {
  test('a viewer can look at everything but has no way to change it', async ({ page, newAccount }) => {
    const owner = await newAccount('owner');
    const viewer = await newAccount('viewer', { workspace: false });
    const note = uniqueTag('seen');
    const source = uniqueTag('payer');
    try {
      await addMember(owner, viewer, 'viewer');
      await expectJson(await owner.api.post(`${owner.base}/expenses`, { amountMinor: 4200, date: isoDate(), note }), 201);
      await expectJson(await owner.api.post(`${owner.base}/income`, { amountMinor: 9000, date: isoDate(), source }), 201);

      await signIn(page, viewer);
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add expense' })).toHaveCount(0);

      // Expenses: listed, opens read-only.
      await page.getByRole('link', { name: 'Expenses' }).first().click();
      await expect(row(page, note)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Add expense' })).toHaveCount(0);
      await row(page, note).click();
      await expect(page.getByRole('heading', { name: 'Expense', exact: true })).toBeVisible();
      await expect(page.getByRole('note')).toContainText('view-only access');
      await expect(page.getByLabel('Amount (INR)')).toBeDisabled();
      await expect(page.getByLabel('Note')).toHaveValue(note);
      await expect(page.getByLabel('Note')).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
      await expect(page.getByText('Drop bills or receipts here')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();

      // A direct link to "new" goes back to the list.
      await goInApp(page, '/expenses/new');
      await expect(page).toHaveURL(/\/expenses$/);

      // Income: the same.
      await goInApp(page, '/income');
      await expect(row(page, source)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Add income' })).toHaveCount(0);
      await row(page, source).click();
      await expect(page.getByRole('heading', { name: 'Income', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Duplicate' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
      await goInApp(page, '/income/new');
      await expect(page).toHaveURL(/\/income$/);

      // Categories: listed, nothing to add, rename or delete.
      await goInApp(page, '/categories');
      await expect(page.getByText('Food & Dining')).toBeVisible();
      await expect(page.getByRole('note')).toContainText('view-only access');
      await expect(page.getByPlaceholder('New category name')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Rename / })).toHaveCount(0);

      // Household: members are listed but can't be managed; the viewer may leave.
      await goInApp(page, '/household');
      await expect(page.getByText(`You're viewer`)).toBeVisible();
      await expect(page.getByRole('list', { name: 'Requests to join' })).toHaveCount(0);
      const members = page.getByRole('list', { name: 'Members' });
      await expect(members.getByRole('listitem')).toHaveCount(2);
      await expect(members.getByRole('combobox')).toHaveCount(0);
      await expect(members.getByRole('button', { name: /^Remove / })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Leave household' })).toBeVisible();

      // There's no site admin page for them either.
      await expect(page.getByRole('link', { name: 'Site admin' })).toHaveCount(0);
      await goInApp(page, '/admin');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    } finally {
      await owner.api.delete(`${owner.base}/members/${viewer.user.id}`);
    }
  });

  test('an editor can add and edit records but not manage the household', async ({ page, newAccount }) => {
    const owner = await newAccount('owner');
    const editor = await newAccount('editor', { workspace: false });
    const note = uniqueTag('by-editor');
    try {
      await addMember(owner, editor, 'editor');
      await signIn(page, editor);

      await page.getByRole('button', { name: 'Add expense' }).click();
      await expect(page.getByRole('heading', { name: 'New expense' })).toBeVisible();
      await expect(page.getByRole('note')).toHaveCount(0);
      await page.getByLabel('Amount (INR)').fill('75');
      await page.getByLabel('Note').fill(note);
      await page.getByRole('button', { name: 'Add expense' }).click();
      await expect(page).toHaveURL(/\/expenses$/);

      await row(page, note).click();
      await expect(page.getByRole('heading', { name: 'Edit expense' })).toBeVisible();
      await expect(page.getByLabel('Amount (INR)')).toBeEnabled();
      await page.getByRole('button', { name: 'Delete', exact: true }).click(); // confirm() is auto-accepted
      await expect(page).toHaveURL(/\/expenses$/);
      await expect(row(page, note)).toHaveCount(0);

      // Categories can be added by editors.
      await goInApp(page, '/categories');
      await expect(page.getByPlaceholder('New category name')).toBeVisible();

      // Household: no requests and no member controls.
      await goInApp(page, '/household');
      await expect(page.getByText(`You're editor`)).toBeVisible();
      await expect(page.getByRole('list', { name: 'Requests to join' })).toHaveCount(0);
      const members = page.getByRole('list', { name: 'Members' });
      await expect(members.getByRole('listitem')).toHaveCount(2);
      await expect(members.getByRole('combobox')).toHaveCount(0);
      await expect(members.getByRole('button', { name: /^Remove / })).toHaveCount(0);
    } finally {
      await owner.api.delete(`${owner.base}/members/${editor.user.id}`);
    }
  });
});
