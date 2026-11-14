import { expectJson } from '../../src/api-client';
import { expect, test, target } from '../../src/fixtures';

test.describe('health', () => {
  test('reports the database as up', async ({ api }) => {
    expect(await expectJson(await api.get('/api/health'), 200)).toEqual({ status: 'ok', db: 'up' });
  });

  test('liveness answers with the deployed version', async ({ api }) => {
    const body = await expectJson<{ status: string; version: string }>(await api.get('/api/health/live'), 200);
    expect(body.status).toBe('ok');
    expect(body.version).toBeTruthy();
  });

  // main.ts only mounts Swagger when NODE_ENV isn't production; Render runs staging and
  // production with NODE_ENV=production, so there the docs must not be exposed.
  test('serves the Swagger docs locally and hides them on deployments', async ({ api }) => {
    const res = await api.get('/api/docs');
    if (target.remote) {
      expect(res.status()).toBe(404);
    } else {
      expect(res.status()).toBe(200);
      expect(await res.text()).toContain('swagger');
    }
  });

  test('requires a token for protected routes', async ({ api }) => {
    expect((await api.get('/api/me')).status()).toBe(401);
    expect((await api.as('not-a-jwt').get('/api/me')).status()).toBe(401);
  });
});
