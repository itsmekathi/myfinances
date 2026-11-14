import { expectJson } from '../../src/api-client';
import { expect, test } from '../../src/fixtures';

test.describe('health', () => {
  test('reports the database as up', async ({ api }) => {
    expect(await expectJson(await api.get('/api/health'), 200)).toEqual({ status: 'ok', db: 'up' });
  });

  test('liveness answers with the deployed version', async ({ api }) => {
    const body = await expectJson<{ status: string; version: string }>(await api.get('/api/health/live'), 200);
    expect(body.status).toBe('ok');
    expect(body.version).toBeTruthy();
  });

  test('serves the Swagger docs', async ({ api }) => {
    const res = await api.get('/api/docs');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('swagger');
  });

  test('requires a token for protected routes', async ({ api }) => {
    expect((await api.get('/api/me')).status()).toBe(401);
    expect((await api.as('not-a-jwt').get('/api/me')).status()).toBe(401);
  });
});
