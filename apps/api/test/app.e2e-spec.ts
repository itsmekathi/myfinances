import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CATEGORY_KINDS, DEFAULT_CATEGORIES_BY_KIND, savingsRate, type CategoryKind } from '@myfinances/shared';
import { AppModule } from '../src/app.module';
import { seedDefaultCategories } from '../src/workspaces/default-categories';
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
    // Sign-up creates no workspace; the user creates a household (or asks to join one).
    const ws = await api()
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .send({ name: `${name} home` })
      .expect(201);
    return {
      token: res.body.accessToken as string,
      refreshToken: res.body.refreshToken as string,
      userId: res.body.user.id as string,
      workspaceId: ws.body.id as string,
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
      'TRUNCATE "JoinRequest", "Attachment", "ExpenseItem", "Expense", "Entry", "Category", "WorkspaceMember", "Workspace", "RefreshToken", "AuthIdentity", "User" CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the liveness check without auth or a database query', async () => {
    const res = await api().get('/api/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok', version: 'dev' });
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

    describe('through the Vercel proxy (x-proxy-secret)', () => {
      const SECRET = 'test-proxy-secret-0123456789abcdefghij';
      const probe = (headers: Record<string, string>) =>
        api().get('/api/health/client-ip').set(headers).expect(200).then((r) => r.body as { tracker: string; viaTrustedProxy: boolean });

      it('tracks the first X-Forwarded-For entry when the secret matches', async () => {
        const body = await probe({ 'x-proxy-secret': SECRET, 'X-Forwarded-For': '203.0.113.9, 13.235.50.233, 172.71.0.1' });
        expect(body).toMatchObject({ tracker: '203.0.113.9', viaTrustedProxy: true });
      });

      it('ignores X-Forwarded-For without the right secret', async () => {
        for (const headers of <Record<string, string>[]>[
          { 'X-Forwarded-For': '203.0.113.9' },
          { 'x-proxy-secret': 'wrong', 'X-Forwarded-For': '203.0.113.9' },
          { 'x-proxy-secret': SECRET.slice(0, -1) + 'X', 'X-Forwarded-For': '203.0.113.9' },
        ]) {
          const body = await probe(headers);
          expect(body.viaTrustedProxy).toBe(false);
          expect(body.tracker).not.toBe('203.0.113.9');
        }
      });

      it('falls back when the first entry is not an IP', async () => {
        const body = await probe({ 'x-proxy-secret': SECRET, 'X-Forwarded-For': 'not-an-ip, 203.0.113.9' });
        expect(body.viaTrustedProxy).toBe(false);
      });
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

  describe('account deletion', () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 3)]);

    /** Registers a user with one expense and one attachment. */
    async function userWithData(name: string) {
      const u = await register(name);
      const auth = { Authorization: `Bearer ${u.token}` };
      const base = `/api/workspaces/${u.workspaceId}`;
      const exp = await api().post(`${base}/expenses`).set(auth).send({ amountMinor: 500, date: '2026-11-14' }).expect(201);
      const up = await api()
        .post(`${base}/expenses/${exp.body.id}/attachments`)
        .set(auth)
        .attach('file', png, { filename: 'r.png', contentType: 'image/png' })
        .expect(201);
      const att = await prisma.attachment.findUniqueOrThrow({ where: { id: up.body.id } });
      await api().post(`${base}/income`).set(auth).send({ amountMinor: 9000, date: '2026-11-14' }).expect(201);
      return { ...u, auth, email: `${name}@example.com`, storageKey: att.storageKey };
    }
    const userExists = async (email: string) => (await prisma.user.count({ where: { email } })) > 0;
    const del = (auth: Record<string, string>, body: object) => api().delete('/api/me').set(auth).send(body);

    it('deletes the account, its workspace, expenses and files after checking email and password', async () => {
      const u = await userWithData('olga');
      const filePath = join(process.env.STORAGE_DIR!, u.storageKey);
      expect(existsSync(filePath)).toBe(true);

      await del(u.auth, { confirmEmail: u.email, password: 'wrong-password' }).expect(401);
      await del(u.auth, { confirmEmail: 'someone@example.com', password: 'correct-horse-1' }).expect(400);
      await del(u.auth, { confirmEmail: u.email }).expect(401);
      expect(await userExists(u.email)).toBe(true);
      expect(existsSync(filePath)).toBe(true);

      await del(u.auth, { confirmEmail: 'OLGA@example.com ', password: 'correct-horse-1' }).expect(204);
      expect(await userExists(u.email)).toBe(false);
      expect(await prisma.workspace.count({ where: { id: u.workspaceId } })).toBe(0);
      expect(await prisma.expense.count({ where: { workspaceId: u.workspaceId } })).toBe(0);
      expect(await prisma.entry.count({ where: { workspaceId: u.workspaceId } })).toBe(0);
      expect(await prisma.attachment.count({ where: { storageKey: u.storageKey } })).toBe(0);
      expect(existsSync(filePath)).toBe(false);

      // The access token is still signed, but the account is gone.
      await api().get('/api/me').set(u.auth).expect(404);
      await mobile(api().post('/api/auth/refresh')).send({ refreshToken: u.refreshToken }).expect(401);
    });

    it('clears the web refresh cookie', async () => {
      const reg = await api()
        .post('/api/auth/register')
        .send({ email: 'wendy@example.com', username: 'wendy', password: 'correct-horse-1' })
        .expect(201);
      const res = await del({ Authorization: `Bearer ${reg.body.accessToken}` }, {
        confirmEmail: 'wendy@example.com',
        password: 'correct-horse-1',
      }).expect(204);
      const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
      expect(cookie).toMatch(/mf_rt=;/);
      expect(cookie).toMatch(/Path=\/api\/auth/);
    });

    it('lets a Google-only account delete itself with just the email', async () => {
      const g = await mobile(api().post('/api/auth/google'))
        .send({ idToken: JSON.stringify({ sub: 'g-del', email: 'gus@example.com', emailVerified: true, name: 'Gus' }) })
        .expect(200);
      await del({ Authorization: `Bearer ${g.body.accessToken}` }, { confirmEmail: 'gus@example.com' }).expect(204);
      expect(await userExists('gus@example.com')).toBe(false);
      expect(await prisma.authIdentity.count({ where: { providerUserId: 'g-del' } })).toBe(0);
    });

    it('refuses while the user owns a workspace shared with someone else', async () => {
      const owner = await userWithData('pam');
      const other = await register('quinn');
      await prisma.workspaceMember.create({ data: { workspaceId: owner.workspaceId, userId: other.userId, role: 'editor' } });

      const res = await del(owner.auth, { confirmEmail: owner.email, password: 'correct-horse-1' }).expect(409);
      expect(res.body.message).toMatch(/pam home/);
      expect(await userExists(owner.email)).toBe(true);
      expect(await prisma.workspace.count({ where: { id: owner.workspaceId } })).toBe(1);
    });

    it('lets a member of a shared workspace leave by deleting; what they added stays', async () => {
      const owner = await userWithData('rita');
      const member = await userWithData('sid');
      await prisma.workspaceMember.create({ data: { workspaceId: owner.workspaceId, userId: member.userId, role: 'editor' } });
      const base = `/api/workspaces/${owner.workspaceId}`;
      const exp = await api().post(`${base}/expenses`).set(member.auth).send({ amountMinor: 70, date: '2026-11-14' }).expect(201);

      await del(member.auth, { confirmEmail: member.email, password: 'correct-horse-1' }).expect(204);
      expect(await userExists(member.email)).toBe(false);
      expect(await prisma.workspace.count({ where: { id: member.workspaceId } })).toBe(0); // their own, unshared
      const kept = await api().get(`${base}/expenses/${exp.body.id}`).set(owner.auth).expect(200);
      expect(kept.body.createdBy).toBeNull();
    });
  });

  describe('google sign-in', () => {
    const googleToken = (p: Partial<GoogleProfile> = {}) =>
      JSON.stringify({ sub: 'g-123', email: 'gina@example.com', emailVerified: true, name: 'Gina', ...p });

    it('creates a user with no workspace yet, then signs the same user in again', async () => {
      const first = await api().post('/api/auth/google').send({ idToken: googleToken() }).expect(200);
      expect(first.body.user.providers).toEqual(['google']);
      const second = await api().post('/api/auth/google').send({ idToken: googleToken() }).expect(200);
      expect(second.body.user.id).toEqual(first.body.user.id);

      const me = await api().get('/api/me').set('Authorization', `Bearer ${first.body.accessToken}`).expect(200);
      expect(me.body.workspaces).toEqual([]);
      expect(me.body.user.siteRole).toBe('user');
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

  describe('households, roles and join requests', () => {
    const as = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` });
    const search = (u: { token: string }, q: string) =>
      api().get(`/api/workspaces/search?q=${encodeURIComponent(q)}`).set(as(u));
    const ask = (u: { token: string }, workspaceId: string, message?: string) =>
      api().post(`/api/workspaces/${workspaceId}/join-requests`).set(as(u)).send(message ? { message } : {});
    const approve = (u: { token: string }, id: string, role?: string) =>
      api().post(`/api/join-requests/${id}/approve`).set(as(u)).send(role ? { role } : {});
    const join = async (owner: { token: string; workspaceId: string }, joiner: { token: string }, role = 'viewer') => {
      const req = await ask(joiner, owner.workspaceId).expect(201);
      await approve(owner, req.body.id, role).expect(200);
    };

    it('creates a household with the caller as owner and default categories', async () => {
      const reg = await mobile(api().post('/api/auth/register'))
        .send({ email: 'hana@example.com', username: 'hana', password: 'correct-horse-1' })
        .expect(201);
      const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
      expect((await api().get('/api/me').set(auth).expect(200)).body.workspaces).toEqual([]);

      await api().post('/api/workspaces').set(auth).send({ name: ' ' }).expect(400);
      const ws = await api().post('/api/workspaces').set(auth).send({ name: 'Hana House', baseCurrency: 'usd' }).expect(201);
      expect(ws.body).toMatchObject({ name: 'Hana House', baseCurrency: 'USD', role: 'owner' });
      const me = await api().get('/api/me').set(auth).expect(200);
      expect(me.body.workspaces).toEqual([ws.body]);
      const cats = await api().get(`/api/workspaces/${ws.body.id}/categories`).set(auth).expect(200);
      expect(cats.body.length).toBeGreaterThan(0);
    });

    it('searches every workspace by name, showing the owner and admins', async () => {
      const owner = await register('ivan');
      const admin = await register('jane');
      const outsider = await register('kofi');
      await prisma.workspace.update({ where: { id: owner.workspaceId }, data: { name: 'The Sharma Family' } });
      await join(owner, admin, 'admin');

      await search(outsider, 's').expect(400);
      const res = await search(outsider, 'sharma').expect(200);
      expect(res.body).toEqual([
        {
          id: owner.workspaceId,
          name: 'The Sharma Family',
          baseCurrency: 'INR',
          admins: [
            { displayName: 'ivan', role: 'owner' },
            { displayName: 'jane', role: 'admin' },
          ],
          memberCount: 2,
          myRole: null,
          myRequestStatus: null,
        },
      ]);
      const mine = await search(owner, 'SHARMA').expect(200);
      expect(mine.body[0]).toMatchObject({ myRole: 'owner' });
    });

    it('lets the owner approve a request with a role; the new member can then use the workspace', async () => {
      const owner = await register('lena');
      const joiner = await register('marc');
      const editor = await register('nina');
      await join(owner, editor, 'editor');

      const req = await ask(joiner, owner.workspaceId, 'Hi, it is Marc').expect(201);
      expect(req.body).toMatchObject({ status: 'pending', message: 'Hi, it is Marc', user: { displayName: 'marc' } });
      await ask(joiner, owner.workspaceId).expect(409);
      expect((await search(joiner, 'lena')).body[0].myRequestStatus).toBe('pending');

      // Only owners and admins see and decide requests; to anyone else the request doesn't exist.
      await api().get(`/api/workspaces/${owner.workspaceId}/join-requests`).set(as(editor)).expect(403);
      await approve(editor, req.body.id).expect(404);
      await approve(joiner, req.body.id).expect(404);
      const pending = await api().get(`/api/workspaces/${owner.workspaceId}/join-requests`).set(as(owner)).expect(200);
      expect(pending.body.map((r: { id: string }) => r.id)).toEqual([req.body.id]);

      await approve(owner, req.body.id, 'owner').expect(400);
      const done = await approve(owner, req.body.id, 'editor').expect(200);
      expect(done.body).toMatchObject({ status: 'approved', grantedRole: 'editor', decidedBy: { displayName: 'lena' } });
      await approve(owner, req.body.id).expect(409);

      const me = await api().get('/api/me').set(as(joiner)).expect(200);
      expect(me.body.workspaces.map((w: { id: string; role: string }) => [w.id, w.role])).toContainEqual([
        owner.workspaceId,
        'editor',
      ]);
      await api()
        .post(`/api/workspaces/${owner.workspaceId}/expenses`)
        .set(as(joiner))
        .send({ amountMinor: 10, date: '2026-11-15' })
        .expect(201);
      await ask(joiner, owner.workspaceId).expect(409); // already a member
    });

    it('reopens a rejected request, and lets the requester cancel their own', async () => {
      const owner = await register('omar');
      const joiner = await register('pia');
      const req = await ask(joiner, owner.workspaceId).expect(201);

      const rejected = await api().post(`/api/join-requests/${req.body.id}/reject`).set(as(owner)).expect(200);
      expect(rejected.body.status).toBe('rejected');
      await api().post(`/api/join-requests/${req.body.id}/cancel`).set(as(joiner)).expect(409);

      const again = await ask(joiner, owner.workspaceId).expect(201);
      expect(again.body).toMatchObject({ id: req.body.id, status: 'pending', decidedBy: null });
      await api().post(`/api/join-requests/${req.body.id}/cancel`).set(as(owner)).expect(404); // not theirs
      await api().post(`/api/join-requests/${req.body.id}/cancel`).set(as(joiner)).expect(200);

      const mine = await api().get('/api/join-requests/mine').set(as(joiner)).expect(200);
      expect(mine.body).toEqual([
        expect.objectContaining({ status: 'cancelled', workspace: { id: owner.workspaceId, name: 'omar home' } }),
      ]);
      await api().get('/api/join-requests/mine').set(as(owner)).expect(200, []);
    });

    it('lets workspace admins grant editor or viewer, but not admin', async () => {
      const owner = await register('quin');
      const admin = await register('rosa');
      const joiner = await register('saul');
      await join(owner, admin, 'admin');

      const req = await ask(joiner, owner.workspaceId).expect(201);
      await approve(admin, req.body.id, 'admin').expect(403);
      await approve(admin, req.body.id).expect(200); // defaults to viewer
      const members = await api().get(`/api/workspaces/${owner.workspaceId}/members`).set(as(joiner)).expect(200);
      expect(members.body.map((m: { displayName: string; role: string }) => [m.displayName, m.role])).toEqual([
        ['quin', 'owner'],
        ['rosa', 'admin'],
        ['saul', 'viewer'],
      ]);
    });

    it('lets a site admin see every pending request and approve for any workspace', async () => {
      const owner = await register('tara');
      const joiner = await register('umar');
      const site = await register('vera');
      const req = await ask(joiner, owner.workspaceId).expect(201);

      await api().get('/api/admin/join-requests').set(as(site)).expect(404);
      await approve(site, req.body.id).expect(404);

      await prisma.user.update({ where: { id: site.userId }, data: { role: 'admin' } });
      expect((await api().get('/api/me').set(as(site))).body.user.siteRole).toBe('admin');
      const queue = await api().get('/api/admin/join-requests').set(as(site)).expect(200);
      expect(queue.body).toEqual([
        expect.objectContaining({ id: req.body.id, workspace: { id: owner.workspaceId, name: 'tara home' } }),
      ]);
      await approve(site, req.body.id, 'admin').expect(200);
      expect(
        await prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: owner.workspaceId, userId: joiner.userId } },
        }),
      ).toMatchObject({ role: 'admin' });
      // Approving doesn't make the site admin a member.
      await api().get(`/api/workspaces/${owner.workspaceId}/expenses`).set(as(site)).expect(404);
    });

    it('manages members by rank: owners over everyone, admins over editors and viewers', async () => {
      const owner = await register('wade');
      const admin = await register('xena');
      const admin2 = await register('yuri');
      const viewer = await register('zara');
      for (const [u, role] of [
        [admin, 'admin'],
        [admin2, 'admin'],
        [viewer, 'viewer'],
      ] as const) {
        await join(owner, u, role);
      }
      const member = (u: { userId: string }) => `/api/workspaces/${owner.workspaceId}/members/${u.userId}`;

      await api().patch(member(viewer)).set(as(viewer)).send({ role: 'editor' }).expect(400); // own role
      await api().patch(member(admin2)).set(as(admin)).send({ role: 'viewer' }).expect(403); // a peer
      await api().patch(member(owner)).set(as(admin)).send({ role: 'viewer' }).expect(403);
      await api().patch(member(viewer)).set(as(admin)).send({ role: 'admin' }).expect(403);
      const updated = await api().patch(member(viewer)).set(as(admin)).send({ role: 'editor' }).expect(200);
      expect(updated.body.find((m: { userId: string }) => m.userId === viewer.userId).role).toBe('editor');
      await api().patch(member(admin2)).set(as(owner)).send({ role: 'viewer' }).expect(200);

      await api().delete(member(owner)).set(as(owner)).expect(400); // the owner can't just leave
      await api().delete(member(admin2)).set(as(admin2)).expect(204); // a viewer may leave
      await api().get(`/api/workspaces/${owner.workspaceId}/members`).set(as(admin2)).expect(404);

      // Transfer: the new owner takes over; the old owner becomes an admin.
      await api().patch(member(admin)).set(as(admin)).send({ role: 'owner' }).expect(400);
      await api().patch(member(viewer)).set(as(admin)).send({ role: 'owner' }).expect(403);
      await api().patch(member(admin)).set(as(owner)).send({ role: 'owner' }).expect(200);
      const roles = await prisma.workspaceMember.findMany({ where: { workspaceId: owner.workspaceId } });
      expect(Object.fromEntries(roles.map((r) => [r.userId, r.role]))).toEqual({
        [owner.userId]: 'admin',
        [admin.userId]: 'owner',
        [viewer.userId]: 'editor',
      });
      await api().delete(member(viewer)).set(as(owner)).expect(204); // admins can remove editors
    });

    it('hides members and requests from non-members', async () => {
      const owner = await register('abel');
      const other = await register('beth');
      await api().get(`/api/workspaces/${owner.workspaceId}/members`).set(as(other)).expect(404);
      await api().get(`/api/workspaces/${owner.workspaceId}/join-requests`).set(as(other)).expect(404);
      await ask(other, '00000000-0000-4000-8000-000000000000').expect(404);
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

  type Cat = { id: string; name: string; parentId: string | null; kind: 'expense' | 'income' | 'investment' };
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

  describe('income and investments', () => {
    async function setup(name: string) {
      const u = await register(name);
      const cats = await categories(u);
      const find = (kind: Cat['kind'], catName: string, parentId: string | null = null) =>
        cats.find((c) => c.kind === kind && c.name === catName && c.parentId === parentId)!;
      const salary = find('income', 'Salary');
      const funds = find('investment', 'Mutual funds');
      return {
        ...u,
        base: `/api/workspaces/${u.workspaceId}`,
        auth: { Authorization: `Bearer ${u.token}` },
        salary,
        bonus: find('income', 'Bonus', salary.id),
        funds,
        sip: find('investment', 'SIP', funds.id),
        food: find('expense', 'Food & Dining'),
      };
    }

    it('seeds default income and investment categories, filterable by kind', async () => {
      const s = await setup('ivan');
      expect(s.salary && s.bonus && s.funds && s.sip).toBeTruthy();
      const income = await api().get(`${s.base}/categories?kind=income`).set(s.auth).expect(200);
      expect(income.body.length).toBeGreaterThan(3);
      expect(income.body.every((c: Cat) => c.kind === 'income')).toBe(true);
      await api().get(`${s.base}/categories?kind=bogus`).set(s.auth).expect(400);
    });

    it('supports CRUD for income and investments, each under its own path', async () => {
      const s = await setup('jane');
      const created = await api()
        .post(`${s.base}/income`)
        .set(s.auth)
        .send({ amountMinor: 150000_00, date: '2026-11-01', categoryId: s.salary.id, source: 'Acme Corp', tags: ['Work'] })
        .expect(201);
      expect(created.body).toMatchObject({
        kind: 'income',
        amountMinor: 150000_00,
        currency: 'INR',
        source: 'Acme Corp',
        tags: ['work'],
        categoryId: s.salary.id,
      });
      const id = created.body.id as string;

      const sip = await api()
        .post(`${s.base}/investments`)
        .set(s.auth)
        .send({ amountMinor: 10000_00, date: '2026-11-05', categoryId: s.funds.id, subcategoryId: s.sip.id })
        .expect(201);
      expect(sip.body.kind).toBe('investment');

      // Each path only sees its own kind.
      await api().get(`${s.base}/investments/${id}`).set(s.auth).expect(404);
      await api().patch(`${s.base}/investments/${id}`).set(s.auth).send({ note: 'x' }).expect(404);
      await api().delete(`${s.base}/investments/${id}`).set(s.auth).expect(404);
      const incomeList = await api().get(`${s.base}/income?from=2026-11-01&to=2026-11-30`).set(s.auth).expect(200);
      expect(incomeList.body.items.map((e: { id: string }) => e.id)).toEqual([id]);
      const outside = await api().get(`${s.base}/income?from=2026-12-01&to=2026-12-31`).set(s.auth).expect(200);
      expect(outside.body.total).toBe(0);
      const byTag = await api().get(`${s.base}/income?tag=work`).set(s.auth).expect(200);
      expect(byTag.body.total).toBe(1);

      // Update, and clear optional text with an empty string.
      const updated = await api()
        .patch(`${s.base}/income/${id}`)
        .set(s.auth)
        .send({ amountMinor: 160000_00, subcategoryId: s.bonus.id, source: '' })
        .expect(200);
      expect(updated.body).toMatchObject({ amountMinor: 160000_00, subcategoryId: s.bonus.id, source: null });
      expect(updated.body.updatedBy).not.toBeNull();

      // Changing the category clears a subcategory that no longer fits.
      const interest = (await categories(s)).find((c) => c.kind === 'income' && c.name === 'Interest')!;
      const moved = await api().patch(`${s.base}/income/${id}`).set(s.auth).send({ categoryId: interest.id }).expect(200);
      expect(moved.body.subcategoryId).toBeNull();

      await api().post(`${s.base}/income`).set(s.auth).send({ amountMinor: 0, date: '2026-11-01' }).expect(400);
      await api().post(`${s.base}/income`).set(s.auth).send({ date: '2026-11-01' }).expect(400);

      await api().delete(`${s.base}/income/${id}`).set(s.auth).expect(204);
      await api().get(`${s.base}/income/${id}`).set(s.auth).expect(404);
    });

    it('only accepts categories of the matching kind', async () => {
      const s = await setup('kate');
      const post = (path: string, body: object) =>
        api().post(`${s.base}/${path}`).set(s.auth).send({ amountMinor: 100, date: '2026-11-01', ...body });
      await post('income', { categoryId: s.funds.id }).expect(400);
      await post('investments', { categoryId: s.food.id }).expect(400);
      await post('expenses', { categoryId: s.salary.id }).expect(400);
      await post('income', { categoryId: s.salary.id, subcategoryId: s.sip.id }).expect(400);
      await post('income', { subcategoryId: s.bonus.id }).expect(400);
      await post('income', { categoryId: s.bonus.id }).expect(400); // a subcategory as the category
    });

    it('keeps entries private to the workspace and read-only for viewers', async () => {
      const a = await setup('liam');
      const b = await register('mona');
      const asB = { Authorization: `Bearer ${b.token}` };
      const entry = await api().post(`${a.base}/income`).set(a.auth).send({ amountMinor: 500, date: '2026-11-02' }).expect(201);

      await api().get(`${a.base}/income`).set(asB).expect(404);
      await api().get(`/api/workspaces/${b.workspaceId}/income/${entry.body.id}`).set(asB).expect(404);
      await api()
        .post(`/api/workspaces/${b.workspaceId}/income`)
        .set(asB)
        .send({ amountMinor: 500, date: '2026-11-02', categoryId: a.salary.id })
        .expect(400);

      await prisma.workspaceMember.create({ data: { workspaceId: a.workspaceId, userId: b.userId, role: 'viewer' } });
      await api().get(`${a.base}/income/${entry.body.id}`).set(asB).expect(200);
      await api().post(`${a.base}/income`).set(asB).send({ amountMinor: 1, date: '2026-11-02' }).expect(403);
      await api().delete(`${a.base}/income/${entry.body.id}`).set(asB).expect(403);
    });

    it('adds income, investments and the amount left over to the dashboard summary', async () => {
      const s = await setup('nina');
      const post = (path: string, body: object) => api().post(`${s.base}/${path}`).set(s.auth).send(body).expect(201);
      await post('income', { amountMinor: 100000, date: '2026-11-01', categoryId: s.salary.id });
      await post('income', { amountMinor: 5000, date: '2026-11-20' });
      await post('income', { amountMinor: 999, date: '2026-11-21', currency: 'USD' }); // not the base currency
      await post('income', { amountMinor: 7777, date: '2026-10-31' }); // outside the range
      await post('investments', { amountMinor: 20000, date: '2026-11-05', categoryId: s.funds.id });
      await post('expenses', { amountMinor: 30000, date: '2026-11-03', categoryId: s.food.id });

      const stats = await api().get(`${s.base}/stats/summary?from=2026-11-01&to=2026-11-30`).set(s.auth).expect(200);
      expect(stats.body).toMatchObject({
        totalMinor: 30000,
        expensesMinor: 30000,
        incomeMinor: 105000,
        investedMinor: 20000,
        netMinor: 55000,
        count: 1,
      });
      expect(stats.body.incomeByCategory).toEqual([
        expect.objectContaining({ name: 'Salary', totalMinor: 100000 }),
        expect.objectContaining({ categoryId: null, name: 'Uncategorized', totalMinor: 5000 }),
      ]);
      expect(stats.body.investmentsByCategory).toEqual([expect.objectContaining({ name: 'Mutual funds', totalMinor: 20000 })]);
      expect(stats.body.byCategory).toEqual([expect.objectContaining({ name: 'Food & Dining', totalMinor: 30000 })]);
    });

    it('lists newest first, paginates, and rejects a reversed date range', async () => {
      const s = await setup('olive');
      for (const date of ['2026-11-03', '2026-11-10', '2026-11-01']) {
        await api().post(`${s.base}/investments`).set(s.auth).send({ amountMinor: 100, date }).expect(201);
      }
      const page1 = await api().get(`${s.base}/investments?pageSize=2`).set(s.auth).expect(200);
      expect(page1.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(page1.body.items.map((e: { date: string }) => e.date)).toEqual(['2026-11-10', '2026-11-03']);
      const page2 = await api().get(`${s.base}/investments?pageSize=2&page=2`).set(s.auth).expect(200);
      expect(page2.body.items.map((e: { date: string }) => e.date)).toEqual(['2026-11-01']);

      const byCategory = await api().get(`${s.base}/investments?categoryId=${s.funds.id}`).set(s.auth).expect(200);
      expect(byCategory.body.total).toBe(0);
      await api().get(`${s.base}/investments?from=2026-11-30&to=2026-11-01`).set(s.auth).expect(400);
      await api().get(`${s.base}/investments?pageSize=500`).set(s.auth).expect(400);
    });

    it('validates updates and normalises currency codes', async () => {
      const s = await setup('pete');
      const entry = await api()
        .post(`${s.base}/income`)
        .set(s.auth)
        .send({ amountMinor: 100, date: '2026-11-01', currency: 'usd', categoryId: s.salary.id })
        .expect(201);
      expect(entry.body.currency).toBe('USD');
      const url = `${s.base}/income/${entry.body.id}`;

      await api().patch(url).set(s.auth).send({ categoryId: s.funds.id }).expect(400);
      await api().patch(url).set(s.auth).send({ subcategoryId: s.sip.id }).expect(400);
      await api().patch(url).set(s.auth).send({ amountMinor: -1 }).expect(400);
      await api().patch(url).set(s.auth).send({ date: '01/11/2026' }).expect(400);
      await api().patch(url).set(s.auth).send({ source: 'x'.repeat(121) }).expect(400);

      // Clearing the category also clears the subcategory.
      await api().patch(url).set(s.auth).send({ subcategoryId: s.bonus.id }).expect(200);
      const cleared = await api().patch(url).set(s.auth).send({ categoryId: null }).expect(200);
      expect(cleared.body).toMatchObject({ categoryId: null, subcategoryId: null });
    });

    it('records who created/edited an entry and from which client', async () => {
      const s = await setup('quentin');
      const created = await api()
        .post(`${s.base}/income`)
        .set(s.auth)
        .set(
          'User-Agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        )
        .send({ amountMinor: 100, date: '2026-11-06' })
        .expect(201);
      expect(created.body.createdBy.displayName).toBe('quentin');
      expect(created.body.createdClient).toMatchObject({ type: 'web', browser: 'Chrome', os: 'Windows' });
      expect(created.body.updatedBy).toBeNull();

      const updated = await api()
        .patch(`${s.base}/income/${created.body.id}`)
        .set(s.auth)
        .set('X-Client-Type', 'mobile')
        .set('X-Client-Platform', 'android')
        .set('X-App-Version', '0.2.0')
        .send({ note: 'edited on phone' })
        .expect(200);
      expect(updated.body.updatedBy.displayName).toBe('quentin');
      expect(updated.body.updatedClient).toMatchObject({ type: 'android', appVersion: '0.2.0' });
    });

    it('keeps entries, uncategorized, when their category is deleted', async () => {
      const s = await setup('rosa');
      const entry = await api()
        .post(`${s.base}/income`)
        .set(s.auth)
        .send({ amountMinor: 4200, date: '2026-11-02', categoryId: s.salary.id, subcategoryId: s.bonus.id })
        .expect(201);

      await api().delete(`${s.base}/categories/${s.salary.id}`).set(s.auth).expect(204);
      const after = await api().get(`${s.base}/income/${entry.body.id}`).set(s.auth).expect(200);
      expect(after.body).toMatchObject({ amountMinor: 4200, categoryId: null, subcategoryId: null });

      const stats = await api().get(`${s.base}/stats/summary?from=2026-11-01&to=2026-11-30`).set(s.auth).expect(200);
      expect(stats.body.incomeByCategory).toEqual([expect.objectContaining({ categoryId: null, name: 'Uncategorized', totalMinor: 4200 })]);
    });

    it('reports a negative amount left over when spending exceeds income', async () => {
      const s = await setup('sam');
      await api().post(`${s.base}/income`).set(s.auth).send({ amountMinor: 1000, date: '2026-11-01' }).expect(201);
      await api().post(`${s.base}/expenses`).set(s.auth).send({ amountMinor: 1500, date: '2026-11-02' }).expect(201);
      await api().post(`${s.base}/investments`).set(s.auth).send({ amountMinor: 200, date: '2026-11-03' }).expect(201);
      const stats = await api().get(`${s.base}/stats/summary?from=2026-11-01&to=2026-11-30`).set(s.auth).expect(200);
      expect(stats.body).toMatchObject({ incomeMinor: 1000, expensesMinor: 1500, investedMinor: 200, netMinor: -700 });
      expect(savingsRate(stats.body)).toBeCloseTo(-0.5);

      const empty = await api().get(`${s.base}/stats/summary?from=2026-10-01&to=2026-10-31`).set(s.auth).expect(200);
      expect(empty.body).toMatchObject({ incomeMinor: 0, investedMinor: 0, netMinor: 0, incomeByCategory: [], investmentsByCategory: [] });
      expect(savingsRate(empty.body)).toBeNull();
    });

    it('documents both paths in Swagger with distinct operation ids', () => {
      const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build());
      const path = (suffix: string) => doc.paths[Object.keys(doc.paths).find((k) => k.endsWith(suffix))!];
      const income = path('/workspaces/{workspaceId}/income');
      const investments = path('/workspaces/{workspaceId}/investments');
      expect(income?.get && income.post).toBeTruthy();
      expect(investments?.get && investments.post).toBeTruthy();
      expect(path('/workspaces/{workspaceId}/income/{id}')?.patch).toBeTruthy();
      expect(path('/workspaces/{workspaceId}/investments/{id}')?.delete).toBeTruthy();
      expect(income.get!.operationId).not.toBe(investments.get!.operationId);
    });
  });

  describe('category kinds and default seeding', () => {
    /** "Parent" and "Parent > Child" names of one kind, sorted. */
    async function namesOf(workspaceId: string, kind: CategoryKind) {
      const rows = await prisma.category.findMany({ where: { workspaceId, kind } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return rows.map((r) => (r.parentId ? `${byId.get(r.parentId)!.name} > ${r.name}` : r.name)).sort();
    }
    const expectedNames = (kind: CategoryKind) =>
      DEFAULT_CATEGORIES_BY_KIND[kind].flatMap((d) => [d.name, ...d.children.map((c) => `${d.name} > ${c}`)]).sort();

    it('seeds every kind for new workspaces, and re-seeding adds nothing', async () => {
      const u = await register('tess');
      for (const kind of CATEGORY_KINDS) {
        expect(await namesOf(u.workspaceId, kind)).toEqual(expectedNames(kind));
      }
      const added = await prisma.$transaction((tx) => seedDefaultCategories(tx, u.workspaceId));
      expect(added).toBe(0);
    });

    it('keeps a category kind fixed after creation', async () => {
      const u = await register('uma');
      const food = (await categories(u)).find((c) => c.kind === 'expense' && c.name === 'Food & Dining')!;
      await api()
        .patch(`/api/workspaces/${u.workspaceId}/categories/${food.id}`)
        .set('Authorization', `Bearer ${u.token}`)
        .send({ kind: 'income', name: 'Eating out' })
        .expect(200);
      const after = await prisma.category.findUniqueOrThrow({ where: { id: food.id } });
      expect(after).toMatchObject({ kind: 'expense', name: 'Eating out' });
    });

    it('the migration backfill gives existing workspaces the income/investment defaults, once', async () => {
      const u = await register('vera');
      // Simulate a workspace created before this release.
      await prisma.category.deleteMany({ where: { workspaceId: u.workspaceId, kind: { not: 'expense' } } });
      const expenseBefore = await namesOf(u.workspaceId, 'expense');

      const sql = readFileSync(
        join(__dirname, '../prisma/migrations/20261115090000_income_investments/migration.sql'),
        'utf8',
      );
      const backfill = sql.slice(sql.indexOf('-- Backfill'));
      const statements = backfill
        .split(/;\s*\n/)
        .map((st) => st.replace(/^\s*--.*$/gm, '').trim())
        .filter(Boolean);
      expect(statements.length).toBeGreaterThanOrEqual(4);
      for (let run = 0; run < 2; run++) {
        for (const st of statements) await prisma.$executeRawUnsafe(st);
      }

      expect(await namesOf(u.workspaceId, 'income')).toEqual(expectedNames('income'));
      expect(await namesOf(u.workspaceId, 'investment')).toEqual(expectedNames('investment'));
      expect(await namesOf(u.workspaceId, 'expense')).toEqual(expenseBefore);
      // Subcategories share their parent's colour.
      const funds = await prisma.category.findFirstOrThrow({
        where: { workspaceId: u.workspaceId, kind: 'investment', name: 'Mutual funds', parentId: null },
        include: { children: true },
      });
      expect(funds.children.every((c) => c.color === funds.color)).toBe(true);
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

      // Names only clash within a kind; subcategories take their parent's kind.
      const incomeGroceries = await api().post(base).set(auth).send({ name: 'Groceries', kind: 'income' }).expect(201);
      expect(incomeGroceries.body.kind).toBe('income');
      const sub = await api().post(base).set(auth).send({ name: 'Cashback', parentId: incomeGroceries.body.id }).expect(201);
      expect(sub.body.kind).toBe('income');
      await api().post(base).set(auth).send({ name: 'Mixed', parentId: food.id, kind: 'income' }).expect(400);
      await api().post(base).set(auth).send({ name: 'groceries', kind: 'income' }).expect(409);

      // Deleting a category deletes its subcategories.
      await api().delete(`${base}/${food.id}`).set(auth).expect(204);
      const after = await categories(u);
      expect(after.some((c) => c.parentId === food.id)).toBe(false);
    });
  });
});
