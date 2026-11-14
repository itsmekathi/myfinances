import type { AuthResponse } from '@myfinances/shared';
import { expectJson, expectStatus } from '../../src/api-client';
import { newCredentials } from '../../src/data';
import { expect, test } from '../../src/fixtures';

const MOBILE = { 'X-Client-Type': 'mobile' };

test.describe('auth', () => {
  test('signs in with email or username and rejects bad passwords', async ({ api, account }) => {
    const byUsername = await expectJson<AuthResponse>(
      await api.post('/api/auth/login', { identifier: account.username, password: account.password }),
      200,
    );
    expect(byUsername.user.email).toBe(account.email);

    // Emails are case-insensitive.
    await expectStatus(
      await api.post('/api/auth/login', { identifier: account.email.toUpperCase(), password: account.password }),
      200,
    );
    await expectStatus(await api.post('/api/auth/login', { identifier: account.username, password: 'wrong-password' }), 401);
  });

  test('returns the signed-in user from /me', async ({ account }) => {
    const me = await expectJson(await account.api.get('/api/me'), 200);
    expect(me.user).toMatchObject({ email: account.email, username: account.username, hasPassword: true });
    expect(me.workspaces).toHaveLength(1);
    expect(me.workspaces[0]).toMatchObject({ id: account.workspaceId });
  });

  test('validates registration input and refuses duplicates', async ({ api, account }) => {
    const creds = newCredentials('dup');
    await expectStatus(await api.post('/api/auth/register', { ...creds, email: 'not-an-email' }), 400);
    await expectStatus(await api.post('/api/auth/register', { ...creds, password: 'short' }), 400);
    await expectStatus(await api.post('/api/auth/register', { ...creds, username: 'no spaces!' }), 400);
    // Same email or username as an existing account.
    await expectStatus(await api.post('/api/auth/register', { ...creds, email: account.email }), 409);
    await expectStatus(await api.post('/api/auth/register', { ...creds, username: account.username }), 409);
  });

  test('web sign-in sets an httpOnly refresh cookie that refreshes the session', async ({ api, account }) => {
    const res = await api.post('/api/auth/login', { identifier: account.email, password: account.password });
    const body = await expectJson<AuthResponse>(res, 200);
    expect(body.refreshToken).toBeUndefined();

    const cookie = res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('mf_rt='));
    expect(cookie?.value).toMatch(/HttpOnly/i);
    expect(cookie?.value).toMatch(/Path=\/api\/auth/i);

    const token = cookie!.value.split(';')[0];
    const refreshed = await expectJson<AuthResponse>(
      await api.post('/api/auth/refresh', {}, { headers: { Cookie: token } }),
      200,
    );
    expect(refreshed.accessToken).toBeTruthy();
    // Sign out so this family doesn't linger.
    await api.post('/api/auth/logout', {}, { headers: { Cookie: token } });
  });

  test('rotates refresh tokens and revokes the family when an old one is reused', async ({ api, account }) => {
    // A new session (its own token family), so the worker's session is untouched.
    const mobile = api.as(undefined, MOBILE);
    const login = await expectJson<AuthResponse>(
      await mobile.post('/api/auth/login', { identifier: account.email, password: account.password }),
      200,
    );
    const first = await expectJson<AuthResponse>(await mobile.post('/api/auth/refresh', { refreshToken: login.refreshToken }), 200);
    expect(first.refreshToken).toBeTruthy();
    expect(first.refreshToken).not.toBe(login.refreshToken);

    // Reusing the old token is treated as theft...
    await expectStatus(await mobile.post('/api/auth/refresh', { refreshToken: login.refreshToken }), 401);
    // ...so the newer token from the same family is revoked too.
    await expectStatus(await mobile.post('/api/auth/refresh', { refreshToken: first.refreshToken }), 401);
  });

  test('logout revokes the refresh token', async ({ api, account }) => {
    const mobile = api.as(undefined, MOBILE);
    const login = await expectJson<AuthResponse>(
      await mobile.post('/api/auth/login', { identifier: account.username, password: account.password }),
      200,
    );
    await expectStatus(await mobile.post('/api/auth/logout', { refreshToken: login.refreshToken }), 204);
    await expectStatus(await mobile.post('/api/auth/refresh', { refreshToken: login.refreshToken }), 401);
  });
});
