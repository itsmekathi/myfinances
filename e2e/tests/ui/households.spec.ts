import type { JoinRequestDto } from '@myfinances/shared';
import { expectJson } from '../../src/api-client';
import { expect, signIn, test } from '../../src/fixtures';

test.describe('households', () => {
  test('a new user finds a household, asks to join, and gets in once approved', async ({ page, newAccount }) => {
    const owner = await newAccount('owner');
    const joiner = await newAccount('joiner', { workspace: false });
    try {
      await signIn(page, joiner);
      await expect(page).toHaveURL(/\/welcome$/);

      await page.getByRole('radio', { name: /Join one/ }).click();
      await page.getByLabel('Search households').fill(owner.workspaceName);
      const result = page.getByRole('list', { name: 'Search results' }).getByRole('listitem');
      await expect(result).toHaveCount(1);
      await expect(result).toContainText(owner.workspaceName);
      await expect(result).toContainText(`Admin: ${owner.user.displayName} (owner)`);
      await page.getByLabel('Message to the admins (optional)').fill('from the e2e suite');
      await result.getByRole('button', { name: `Ask to join ${owner.workspaceName}` }).click();
      await expect(result).toContainText('Requested');

      const mine = page.getByRole('list', { name: 'Your requests' }).getByRole('listitem');
      await expect(mine).toContainText('Waiting for an admin to approve');

      // The owner approves (through the API here; the owner's page is covered below).
      const [req] = await expectJson<JoinRequestDto[]>(await owner.api.get(`${owner.base}/join-requests`), 200);
      expect(req.message).toBe('from the e2e suite');
      await expectJson(await owner.api.post(`/api/join-requests/${req.id}/approve`, { role: 'editor' }), 200);

      await page.reload();
      await mine.getByRole('button', { name: 'Open' }).click();
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Household' }).first()).toHaveValue(owner.workspaceId);
    } finally {
      await owner.api.delete(`${owner.base}/members/${joiner.user.id}`);
    }
  });

  test('the owner approves a request from the Household page, then removes the member', async ({
    loggedInPage: page,
    account,
    newAccount,
  }) => {
    const joiner = await newAccount('joiner', { workspace: false });
    await expectJson(await joiner.api.post(`${account.base}/join-requests`, { message: 'let me in' }), 201);
    const name = joiner.user.displayName!;

    try {
      await page.getByRole('link', { name: /^Household/ }).first().click();
      const requests = page.getByRole('list', { name: 'Requests to join' });
      const row = requests.getByRole('listitem').filter({ hasText: name });
      await expect(row).toContainText('let me in');
      await row.getByLabel(`Role for ${name}`).selectOption('editor');
      await row.getByRole('button', { name: 'Approve' }).click();
      await expect(row).toHaveCount(0);

      const member = page.getByRole('list', { name: 'Members' }).getByRole('listitem').filter({ hasText: name });
      await expect(member.getByLabel(`Role for ${name}`)).toHaveValue('editor');

      await member.getByRole('button', { name: `Remove ${name}` }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
      await expect(member).toHaveCount(0);
    } finally {
      await account.api.delete(`${account.base}/members/${joiner.user.id}`);
    }
  });
});
