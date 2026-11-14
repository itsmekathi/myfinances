import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { applyTrustProxy, configureApp } from '../src/setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { GoogleVerifierService, type GoogleProfile } from '../src/auth/google-verifier.service';

/** Fake Google: the "ID token" is a JSON-encoded profile. */
class FakeGoogleVerifier {
  async verify(idToken: string): Promise<GoogleProfile> {
    return JSON.parse(idToken) as GoogleProfile;
  }
}

describe('MyFinances API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());
  const mobile = (req: request.Test) => req.set('x-client-type', 'mobile');

  async function register(name: string) {
    const res = await mobile(api().post('/api/auth/register'))
      .send({ email: `${name}@example.com`, username: name, password: 'correct-horse-1' })
      .expect(201);
    const me = await api().get('/api/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    return {
      token: res.body.accessToken as string,
      refreshToken: res.body.refreshToken as string,
      workspaceId: me.body.workspaces[0].id as string,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleVerifierService)
      .useClass(FakeGoogleVerifier)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Attachment", "ExpenseItem", "Expense", "Category", "WorkspaceMember", "Workspace", "RefreshToken", "AuthIdentity", "User" CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('client IP behind proxies', () => {
    const ipOf = async (xff?: string) => {
      const req = api().get('/api/health/client-ip');
      if (xff) req.set('X-Forwarded-For', xff);
      return (await req.expect(200)).body.ip as string;
    };

    afterEach(() => applyTrustProxy(app, 0));

    it('ignores X-Forwarded-For by default', async () => {
      expect(await ipOf('203.0.113.9')).not.toBe('203.0.113.9');
    });

    it('takes the client from the right with one trusted hop, ignoring forged entries', async () => {
      applyTrustProxy(app, 1);
      expect(await ipOf('198.51.100.1, 203.0.113.9')).toBe('203.0.113.9');
    });

    it('trusts two hops when configured', async () => {
      applyTrustProxy(app, 2);
      expect(await ipOf('198.51.100.1, 203.0.113.9, 192.0.2.7')).toBe('203.0.113.9');
    });
  });

  describe('auth', () => {
    it('registers, logs in with username or email, and rejects bad passwords', async () => {
      await register('alice');
      await api().post('/api/auth/login').send({ identifier: 'alice', password: 'correct-horse-1' }).expect(200);
      await api()
        .post('/api/auth/login')
        .send({ identifier: 'ALICE@example.com', password: 'correct-horse-1' })
        .expect(200);
      await api().post('/api/auth/login').send({ identifier: 'alice', password: 'wrong-password' }).expect(401);
      await api().post('/api/auth/login').send({ identifier: 'nobody', password: 'whatever1' }).expect(401);
    });

    it('rejects duplicate email/username', async () => {
      await register('bob');
      await api()
        .post('/api/auth/register')
        .send({ email: 'bob@example.com', username: 'bob2', password: 'correct-horse-1' })
        .expect(409);
    });

    it('sets an httpOnly refresh cookie for web clients', async () => {
      const res = await api()
        .post('/api/auth/register')
        .send({ email: 'web@example.com', username: 'webuser', password: 'correct-horse-1' })
        .expect(201);
      expect(res.body.refreshToken).toBeUndefined();
      const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
      expect(cookie).toMatch(/mf_rt=.+HttpOnly/i);

      const refreshed = await api().post('/api/auth/refresh').set('Cookie', cookie).send({}).expect(200);
      expect(refreshed.body.accessToken).toBeTruthy();
    });

    it('rotates refresh tokens and revokes the family when an old one is reused', async () => {
      const { refreshToken } = await register('carol');
      const first = await mobile(api().post('/api/auth/refresh')).send({ refreshToken }).expect(200);
      expect(first.body.refreshToken).not.toEqual(refreshToken);

      // Reusing the old token is treated as theft...
      await mobile(api().post('/api/auth/refresh')).send({ refreshToken }).expect(401);
      // ...so the newer token is revoked too.
      await mobile(api().post('/api/auth/refresh')).send({ refreshToken: first.body.refreshToken }).expect(401);
    });

    it('logout revokes the refresh token', async () => {
      const { refreshToken } = await register('dave');
      await mobile(api().post('/api/auth/logout')).send({ refreshToken }).expect(204);
      await mobile(api().post('/api/auth/refresh')).send({ refreshToken }).expect(401);
    });

    it('requires a token for protected routes', async () => {
      await api().get('/api/me').expect(401);
      await api().get('/api/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });
  });

  describe('google sign-in', () => {
    const googleToken = (p: Partial<GoogleProfile> = {}) =>
      JSON.stringify({ sub: 'g-123', email: 'gina@example.com', emailVerified: true, name: 'Gina', ...p });

    it('creates a user with a personal workspace, then signs the same user in again', async () => {
      const first = await api().post('/api/auth/google').send({ idToken: googleToken() }).expect(200);
      expect(first.body.user.providers).toEqual(['google']);
      const second = await api().post('/api/auth/google').send({ idToken: googleToken() }).expect(200);
      expect(second.body.user.id).toEqual(first.body.user.id);

      const me = await api().get('/api/me').set('Authorization', `Bearer ${first.body.accessToken}`).expect(200);
      expect(me.body.workspaces).toHaveLength(1);
    });

    it('rejects unverified Google emails', async () => {
      await api().post('/api/auth/google').send({ idToken: googleToken({ emailVerified: false }) }).expect(401);
    });

    it('links to an existing account and drops its unverified password', async () => {
      await mobile(api().post('/api/auth/register'))
        .send({ email: 'gina@example.com', username: 'gina', password: 'correct-horse-1' })
        .expect(201);

      const res = await api().post('/api/auth/google').send({ idToken: googleToken() }).expect(200);
      expect(res.body.user.providers).toEqual(['google']);
      expect(res.body.user.hasPassword).toBe(false);
      await api().post('/api/auth/login').send({ identifier: 'gina', password: 'correct-horse-1' }).expect(401);
    });
  });

  describe('expenses, categories and stats', () => {
    it('supports CRUD, filtering and a dashboard summary', async () => {
      const { token, workspaceId } = await register('erin');
      const auth = { Authorization: `Bearer ${token}` };
      const base = `/api/workspaces/${workspaceId}`;

      const cats = await api().get(`${base}/categories`).set(auth).expect(200);
      expect(cats.body.length).toBeGreaterThan(5);
      const food = cats.body.find((c: { name: string }) => c.name === 'Food & Dining');

      const e1 = await api()
        .post(`${base}/expenses`)
        .set(auth)
        .send({ amountMinor: 25000, date: '2026-11-01', categoryId: food.id, note: 'Dinner' })
        .expect(201);
      expect(e1.body.currency).toBe('INR');
      await api().post(`${base}/expenses`).set(auth).send({ amountMinor: 1000, date: '2026-11-03' }).expect(201);
      await api().post(`${base}/expenses`).set(auth).send({ amountMinor: -5, date: '2026-11-03' }).expect(400);

      const list = await api().get(`${base}/expenses?from=2026-11-01&to=2026-11-30`).set(auth).expect(200);
      expect(list.body.total).toBe(2);

      await api().patch(`${base}/expenses/${e1.body.id}`).set(auth).send({ amountMinor: 30000 }).expect(200);

      const stats = await api().get(`${base}/stats/summary?from=2026-11-01&to=2026-11-30`).set(auth).expect(200);
      expect(stats.body.totalMinor).toBe(31000);
      expect(stats.body.byDay).toHaveLength(30);
      expect(stats.body.byCategory[0]).toMatchObject({ name: 'Food & Dining', totalMinor: 30000 });

      await api().delete(`${base}/expenses/${e1.body.id}`).set(auth).expect(204);
      await api().get(`${base}/expenses/${e1.body.id}`).set(auth).expect(404);
    });

    it("never exposes another user's workspace", async () => {
      const a = await register('frank');
      const b = await register('grace');
      const exp = await api()
        .post(`/api/workspaces/${a.workspaceId}/expenses`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({ amountMinor: 500, date: '2026-11-02' })
        .expect(201);

      const asB = { Authorization: `Bearer ${b.token}` };
      await api().get(`/api/workspaces/${a.workspaceId}/expenses`).set(asB).expect(404);
      await api().get(`/api/workspaces/${a.workspaceId}/expenses/${exp.body.id}`).set(asB).expect(404);
      await api().get(`/api/workspaces/${b.workspaceId}/expenses/${exp.body.id}`).set(asB).expect(404);
      await api()
        .post(`/api/workspaces/${b.workspaceId}/expenses`)
        .set(asB)
        .send({ amountMinor: 500, date: '2026-11-02', categoryId: (await firstCategory(a)).id })
        .expect(400);
    });

    async function firstCategory(u: { token: string; workspaceId: string }) {
      return (await categories(u)).find((c) => !c.parentId)!;
    }
  });

  type Cat = { id: string; name: string; parentId: string | null };
  async function categories(u: { token: string; workspaceId: string }): Promise<Cat[]> {
    const res = await api()
      .get(`/api/workspaces/${u.workspaceId}/categories`)
      .set('Authorization', `Bearer ${u.token}`)
      .expect(200);
    return res.body;
  }

  describe('rich expenses', () => {
    const CHROME_UA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

    async function setup(name = 'rita') {
      const u = await register(name);
      const cats = await categories(u);
      const food = cats.find((c) => c.name === 'Food & Dining')!;
      const transport = cats.find((c) => c.name === 'Transport')!;
      const restaurants = cats.find((c) => c.name === 'Restaurants' && c.parentId === food.id)!;
      return {
        ...u,
        base: `/api/workspaces/${u.workspaceId}`,
        auth: { Authorization: `Bearer ${u.token}` },
        food,
        transport,
        restaurants,
      };
    }

    it('seeds default subcategories for new workspaces', async () => {
      const s = await setup();
      expect(s.restaurants).toBeDefined();
      const children = (await categories(s)).filter((c) => c.parentId === s.food.id);
      expect(children.length).toBeGreaterThanOrEqual(3);
    });

    it('stores time, details and tags; filters by tag', async () => {
      const s = await setup();
      const res = await api()
        .post(`${s.base}/expenses`)
        .set(s.auth)
        .send({
          amountMinor: 45000,
          date: '2026-11-05',
          time: '19:45',
          categoryId: s.food.id,
          subcategoryId: s.restaurants.id,
          merchant: 'Truffles',
          location: 'Koramangala, Bengaluru',
          description: 'Team dinner after the release',
          tags: ['Work', ' work ', 'reimbursable'],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        time: '19:45',
        subcategoryId: s.restaurants.id,
        merchant: 'Truffles',
        tags: ['work', 'reimbursable'],
      });
      await api().post(`${s.base}/expenses`).set(s.auth).send({ amountMinor: 100, date: '2026-11-05' }).expect(201);

      const tagged = await api().get(`${s.base}/expenses?tag=reimbursable`).set(s.auth).expect(200);
      expect(tagged.body.total).toBe(1);
      await api().post(`${s.base}/expenses`).set(s.auth).send({ amountMinor: 100, date: '2026-11-05', time: '25:00' }).expect(400);
    });

    it('validates that the subcategory belongs to the category', async () => {
      const s = await setup();
      const send = (body: object) =>
        api().post(`${s.base}/expenses`).set(s.auth).send({ amountMinor: 100, date: '2026-11-05', ...body });
      await send({ categoryId: s.transport.id, subcategoryId: s.restaurants.id }).expect(400);
      await send({ subcategoryId: s.restaurants.id }).expect(400);
      await send({ categoryId: s.restaurants.id }).expect(400); // a subcategory is not a top-level category

      // Changing the category clears a subcategory that no longer fits.
      const created = await send({ categoryId: s.food.id, subcategoryId: s.restaurants.id }).expect(201);
      const moved = await api()
        .patch(`${s.base}/expenses/${created.body.id}`)
        .set(s.auth)
        .send({ categoryId: s.transport.id })
        .expect(200);
      expect(moved.body.subcategoryId).toBeNull();
    });

    it('calculates the total from items and recalculates on update', async () => {
      const s = await setup();
      const created = await api()
        .post(`${s.base}/expenses`)
        .set(s.auth)
        .send({
          date: '2026-11-06',
          amountMinor: 1, // ignored when items are present
          items: [
            { name: 'Milk', quantity: 2, unitPriceMinor: 3000 },
            { name: 'Bread', unitPriceMinor: 4500 },
            { name: 'Rice (kg)', quantity: 1.5, unitPriceMinor: 6000 },
          ],
        })
        .expect(201);
      expect(created.body.amountMinor).toBe(6000 + 4500 + 9000);
      expect(created.body.items.map((i: { name: string }) => i.name)).toEqual(['Milk', 'Bread', 'Rice (kg)']);
      expect(created.body.itemCount).toBe(3);

      const id = created.body.id;
      // While items exist, the amount can't be edited directly.
      await api().patch(`${s.base}/expenses/${id}`).set(s.auth).send({ amountMinor: 5 }).expect(400);

      const updated = await api()
        .patch(`${s.base}/expenses/${id}`)
        .set(s.auth)
        .send({ items: [{ name: 'Eggs', quantity: 12, unitPriceMinor: 700 }] })
        .expect(200);
      expect(updated.body.amountMinor).toBe(8400);
      expect(updated.body.items).toHaveLength(1);

      // Removing all items requires an explicit amount.
      await api().patch(`${s.base}/expenses/${id}`).set(s.auth).send({ items: [] }).expect(400);
      const cleared = await api()
        .patch(`${s.base}/expenses/${id}`)
        .set(s.auth)
        .send({ items: [], amountMinor: 9000 })
        .expect(200);
      expect(cleared.body).toMatchObject({ amountMinor: 9000, itemCount: 0 });

      await api().post(`${s.base}/expenses`).set(s.auth).send({ date: '2026-11-06' }).expect(400);
    });

    it('records who created/edited an expense and from which client', async () => {
      const s = await setup();
      const created = await api()
        .post(`${s.base}/expenses`)
        .set(s.auth)
        .set('User-Agent', CHROME_UA)
        .send({ amountMinor: 100, date: '2026-11-06' })
        .expect(201);
      expect(created.body.createdBy.displayName).toBe('rita');
      expect(created.body.createdClient).toMatchObject({ type: 'web', browser: 'Chrome', os: 'Windows' });
      expect(created.body.updatedBy).toBeNull();

      const updated = await api()
        .patch(`${s.base}/expenses/${created.body.id}`)
        .set(s.auth)
        .set('X-Client-Type', 'mobile')
        .set('X-Client-Platform', 'android')
        .set('X-App-Version', '0.1.0')
        .send({ note: 'edited on phone' })
        .expect(200);
      expect(updated.body.updatedBy.displayName).toBe('rita');
      expect(updated.body.updatedClient).toMatchObject({ type: 'android', appVersion: '0.1.0' });
      expect(updated.body.createdClient.browser).toBe('Chrome');
    });

    describe('attachments', () => {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
      const pdf = Buffer.from('%PDF-1.4\n%fake test pdf\n%%EOF\n');

      async function withExpense(name?: string) {
        const s = await setup(name);
        const exp = await api().post(`${s.base}/expenses`).set(s.auth).send({ amountMinor: 100, date: '2026-11-06' }).expect(201);
        return { ...s, expenseId: exp.body.id as string, url: `${s.base}/expenses/${exp.body.id}/attachments` };
      }

      it('uploads, downloads and deletes files', async () => {
        const s = await withExpense();
        const up = await api().post(s.url).set(s.auth).attach('file', png, { filename: 'bill.png', contentType: 'image/png' }).expect(201);
        expect(up.body).toMatchObject({ fileName: 'bill.png', mimeType: 'image/png', sizeBytes: png.length });
        await api().post(s.url).set(s.auth).attach('file', pdf, { filename: 'invoice.pdf', contentType: 'application/pdf' }).expect(201);

        const detail = await api().get(`${s.base}/expenses/${s.expenseId}`).set(s.auth).expect(200);
        expect(detail.body.attachments).toHaveLength(2);
        expect(detail.body.attachmentCount).toBe(2);

        const dl = await api().get(`${s.url}/${up.body.id}`).set(s.auth).buffer(true).parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        }).expect(200);
        expect(dl.headers['content-type']).toBe('image/png');
        expect(Buffer.compare(dl.body as Buffer, png)).toBe(0);

        await api().delete(`${s.url}/${up.body.id}`).set(s.auth).expect(204);
        await api().get(`${s.url}/${up.body.id}`).set(s.auth).expect(404);
      });

      it('returns 404 when the record exists but the file is gone from disk', async () => {
        const s = await withExpense();
        const up = await api().post(s.url).set(s.auth).attach('file', png, { filename: 'bill.png', contentType: 'image/png' }).expect(201);
        const att = await prisma.attachment.findUniqueOrThrow({ where: { id: up.body.id } });
        rmSync(join(process.env.STORAGE_DIR!, att.storageKey));
        const res = await api().get(`${s.url}/${up.body.id}`).set(s.auth).expect(404);
        expect(res.body.message).toBe('Attachment file is missing');
      });

      it('rejects disallowed types (by content, not file name) and oversize files', async () => {
        const s = await withExpense();
        const html = Buffer.from('<html><script>alert(1)</script></html>');
        await api().post(s.url).set(s.auth).attach('file', html, { filename: 'bill.png', contentType: 'image/png' }).expect(415);
        const big = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024 + 1)]);
        await api().post(s.url).set(s.auth).attach('file', big, { filename: 'big.png', contentType: 'image/png' }).expect(413);
      });

      it("hides attachments from other users and removes files when the expense is deleted", async () => {
        const s = await withExpense('owner1');
        const other = await register('intruder');
        const up = await api().post(s.url).set(s.auth).attach('file', png, { filename: 'bill.png', contentType: 'image/png' }).expect(201);
        const asOther = { Authorization: `Bearer ${other.token}` };
        await api().get(`${s.url}/${up.body.id}`).set(asOther).expect(404);
        await api()
          .get(`/api/workspaces/${other.workspaceId}/expenses/${s.expenseId}/attachments/${up.body.id}`)
          .set(asOther)
          .expect(404);

        const { storageKey } = await prisma.attachment.findUniqueOrThrow({ where: { id: up.body.id } });
        const file = join(process.env.STORAGE_DIR!, storageKey);
        expect(existsSync(file)).toBe(true);
        await api().delete(`${s.base}/expenses/${s.expenseId}`).set(s.auth).expect(204);
        expect(existsSync(file)).toBe(false);
      });
    });
  });

  describe('category management', () => {
    it('enforces unique names per parent and one level of nesting', async () => {
      const u = await register('cara');
      const base = `/api/workspaces/${u.workspaceId}/categories`;
      const auth = { Authorization: `Bearer ${u.token}` };
      const cats = await categories(u);
      const food = cats.find((c) => c.name === 'Food & Dining')!;
      const travel = cats.find((c) => c.name === 'Travel')!;
      const restaurants = cats.find((c) => c.name === 'Restaurants')!;

      await api().post(base).set(auth).send({ name: 'Street food', parentId: food.id }).expect(201);
      await api().post(base).set(auth).send({ name: 'street food', parentId: food.id }).expect(409);
      await api().post(base).set(auth).send({ name: 'Street food', parentId: travel.id }).expect(201);
      await api().post(base).set(auth).send({ name: 'groceries' }).expect(409); // top-level duplicate
      await api().post(base).set(auth).send({ name: 'Too deep', parentId: restaurants.id }).expect(400);

      // Deleting a category deletes its subcategories.
      await api().delete(`${base}/${food.id}`).set(auth).expect(204);
      const after = await categories(u);
      expect(after.some((c) => c.parentId === food.id)).toBe(false);
    });
  });
});
