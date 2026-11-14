import { expectJson, expectStatus } from '../../src/api-client';
import { files, isoDate } from '../../src/data';
import { test } from '../../src/fixtures';

const MOBILE = { 'X-Client-Type': 'mobile' };

test.describe('account deletion', () => {
  // Four DELETE /api/me calls against a limit of 5 a minute per IP, shared with the UI suite.
  test.describe.configure({ timeout: 240_000 });

  test('checks email and password, then deletes the user and all their data', async ({ api, newAccount }) => {
    const u = await newAccount('del');
    const { id } = await expectJson<{ id: string }>(
      await u.api.post(`${u.base}/expenses`, { amountMinor: 500, date: isoDate() }),
      201,
    );
    await expectJson(await u.api.upload(`${u.base}/expenses/${id}/attachments`, files.png()), 201);

    await expectStatus(await u.api.delete('/api/me', { confirmEmail: u.email, password: 'wrong-password' }), 401);
    await expectStatus(
      await u.api.delete('/api/me', { confirmEmail: 'someone@example.test', password: u.password }),
      400,
    );
    await expectStatus(await u.api.delete('/api/me', { confirmEmail: u.email }), 401);
    await expectStatus(await u.api.get('/api/me'), 200); // still there

    // The confirmation email is trimmed and case-insensitive.
    await expectStatus(
      await u.api.delete('/api/me', { confirmEmail: ` ${u.email.toUpperCase()} `, password: u.password }),
      204,
    );

    // The access token is still signed, but the account is gone.
    await expectStatus(await u.api.get('/api/me'), 404);
    await expectStatus(await u.api.get(`${u.base}/expenses/${id}`), 404);
    await expectStatus(await api.as(undefined, MOBILE).post('/api/auth/refresh', { refreshToken: u.refreshToken }), 401);
    await expectStatus(await api.post('/api/auth/login', { identifier: u.email, password: u.password }), 401);
  });
});
