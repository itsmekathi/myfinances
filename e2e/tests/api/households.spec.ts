import type { JoinRequestDto, MemberDto, WorkspaceSearchResultDto } from '@myfinances/shared';
import { expectJson, expectStatus } from '../../src/api-client';
import { isoDate, uniqueTag } from '../../src/data';
import { expect, test, type Account } from '../../src/fixtures';

/**
 * Global teardown deletes accounts one by one, and an owner can't delete their account while
 * others are members. So every test removes the members it added.
 */
async function removeMembers(owner: Account, ...members: Account[]) {
  for (const m of members) {
    const res = await owner.api.delete(`${owner.base}/members/${m.user.id}`);
    expect([204, 404]).toContain(res.status());
  }
}

async function askToJoin(joiner: Account, owner: Account, message?: string) {
  return expectJson<JoinRequestDto>(
    await joiner.api.post(`/api/workspaces/${owner.workspaceId}/join-requests`, message ? { message } : {}),
    201,
  );
}

test.describe('households and join requests', () => {
  test('sign-up creates no workspace; creating one makes you its owner with default categories', async ({ newAccount }) => {
    const u = await newAccount('bare', { workspace: false });
    const me = await expectJson(await u.api.get('/api/me'), 200);
    expect(me.workspaces).toEqual([]);
    expect(me.user.siteRole).toBe('user');

    const name = uniqueTag('fresh-home');
    const ws = await expectJson(await u.api.post('/api/workspaces', { name, baseCurrency: 'usd' }), 201);
    expect(ws).toMatchObject({ name, baseCurrency: 'USD', role: 'owner' });
    const cats = await expectJson<unknown[]>(await u.api.get(`/api/workspaces/${ws.id}/categories`), 200);
    expect(cats.length).toBeGreaterThan(0);
  });

  test('search shows each household with its owner and admins', async ({ newAccount }) => {
    const owner = await newAccount('owner');
    const seeker = await newAccount('seeker', { workspace: false });

    await expectStatus(await seeker.api.get('/api/workspaces/search?q=x'), 400);
    const results = await expectJson<WorkspaceSearchResultDto[]>(
      await seeker.api.get(`/api/workspaces/search?q=${encodeURIComponent(owner.workspaceName.toUpperCase())}`),
      200,
    );
    expect(results).toEqual([
      {
        id: owner.workspaceId,
        name: owner.workspaceName,
        baseCurrency: expect.any(String),
        admins: [{ displayName: owner.user.displayName, role: 'owner' }],
        memberCount: 1,
        myRole: null,
        myRequestStatus: null,
      },
    ]);
  });

  test('the owner approves a request with a role; the member can then add records', async ({ newAccount }) => {
    const owner = await newAccount('owner');
    const joiner = await newAccount('joiner', { workspace: false });
    try {
      const req = await askToJoin(joiner, owner, 'it is me');
      expect(req).toMatchObject({ status: 'pending', message: 'it is me', workspace: { id: owner.workspaceId } });
      await expectStatus(await joiner.api.post(`/api/workspaces/${owner.workspaceId}/join-requests`, {}), 409);
      // Not the joiner's to approve; to them it doesn't exist.
      await expectStatus(await joiner.api.post(`/api/join-requests/${req.id}/approve`, {}), 404);

      const pending = await expectJson<JoinRequestDto[]>(await owner.api.get(`${owner.base}/join-requests`), 200);
      expect(pending.map((r) => r.id)).toEqual([req.id]);
      const done = await expectJson<JoinRequestDto>(
        await owner.api.post(`/api/join-requests/${req.id}/approve`, { role: 'editor' }),
        200,
      );
      expect(done).toMatchObject({ status: 'approved', grantedRole: 'editor' });

      const me = await expectJson(await joiner.api.get('/api/me'), 200);
      expect(me.workspaces).toEqual([expect.objectContaining({ id: owner.workspaceId, role: 'editor' })]);
      const exp = await expectJson(
        await joiner.api.post(`${owner.base}/expenses`, { amountMinor: 120, date: isoDate(), note: 'joined' }),
        201,
      );
      expect(exp.createdBy.id).toBe(joiner.user.id);
      await owner.api.delete(`${owner.base}/expenses/${exp.id}`);
    } finally {
      await removeMembers(owner, joiner);
    }
  });

  test('a rejected request can be asked again, and the requester can cancel it', async ({ newAccount }) => {
    const owner = await newAccount('owner');
    const joiner = await newAccount('joiner', { workspace: false });
    const req = await askToJoin(joiner, owner);
    expect((await expectJson<JoinRequestDto>(await owner.api.post(`/api/join-requests/${req.id}/reject`, {}), 200)).status).toBe(
      'rejected',
    );
    const again = await askToJoin(joiner, owner);
    expect(again).toMatchObject({ id: req.id, status: 'pending' });
    await expectJson(await joiner.api.post(`/api/join-requests/${req.id}/cancel`, {}), 200);
    const mine = await expectJson<JoinRequestDto[]>(await joiner.api.get('/api/join-requests/mine'), 200);
    expect(mine).toEqual([expect.objectContaining({ id: req.id, status: 'cancelled' })]);
  });

  test('roles limit who can manage whom', async ({ newAccount }) => {
    const owner = await newAccount('owner');
    const admin = await newAccount('admin', { workspace: false });
    const viewer = await newAccount('viewer', { workspace: false });
    try {
      for (const [u, role] of [
        [admin, 'admin'],
        [viewer, 'viewer'],
      ] as const) {
        const req = await askToJoin(u, owner);
        await expectJson(await owner.api.post(`/api/join-requests/${req.id}/approve`, { role }), 200);
      }
      const member = (u: Account) => `${owner.base}/members/${u.user.id}`;

      // Viewers can read but not write, and can't manage members.
      await expectStatus(await viewer.api.post(`${owner.base}/expenses`, { amountMinor: 1, date: isoDate() }), 403);
      await expectStatus(await viewer.api.patch(member(admin), { role: 'viewer' }), 403);
      // Admins manage viewers and editors, but not the owner, and can't grant admin.
      await expectStatus(await admin.api.patch(member(owner), { role: 'viewer' }), 403);
      await expectStatus(await admin.api.patch(member(viewer), { role: 'admin' }), 403);
      const members = await expectJson<MemberDto[]>(await admin.api.patch(member(viewer), { role: 'editor' }), 200);
      expect(members.map((m) => [m.userId, m.role])).toEqual([
        [owner.user.id, 'owner'],
        [admin.user.id, 'admin'],
        [viewer.user.id, 'editor'],
      ]);
      // The owner can't leave without transferring ownership; others can.
      await expectStatus(await owner.api.delete(member(owner)), 400);
      await expectStatus(await viewer.api.delete(member(viewer)), 204);
      await expectStatus(await viewer.api.get(`${owner.base}/members`), 404);
    } finally {
      await removeMembers(owner, admin, viewer);
    }
  });

  test('site admin routes are hidden from regular users', async ({ account }) => {
    await expectStatus(await account.api.get('/api/admin/join-requests'), 404);
  });
});
