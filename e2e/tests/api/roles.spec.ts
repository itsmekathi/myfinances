import type { APIResponse } from '@playwright/test';
import type { CategoryDto, JoinRequestDto, WorkspaceRole } from '@myfinances/shared';
import { expectJson, expectStatus } from '../../src/api-client';
import { files, isoDate, uniqueTag } from '../../src/data';
import { expect, test, type Account } from '../../src/fixtures';

/**
 * What each role may do in a household, checked endpoint by endpoint:
 * - owner, admin, editor: read and write records
 * - viewer: read only (writes get 403)
 * - owner, admin: see and decide join requests, manage members ranked below them
 * - non-members and removed members: every route answers 404, so ids can't be probed
 */

type Actor = 'owner' | 'admin' | 'editor' | 'viewer' | 'outsider';

/** Expected status per actor; a role missing from the map isn't checked for that action. */
type Expect = Partial<Record<Actor, number>>;

const READ: Expect = { owner: 200, admin: 200, editor: 200, viewer: 200, outsider: 404 };
const CREATE: Expect = { owner: 201, admin: 201, editor: 201, viewer: 403, outsider: 404 };
const UPDATE: Expect = { owner: 200, admin: 200, editor: 200, viewer: 403, outsider: 404 };
const MANAGERS_ONLY: Expect = { owner: 200, admin: 200, editor: 403, viewer: 403, outsider: 404 };

async function check(actor: Actor, res: APIResponse, expected: number, label: string) {
  await test.step(`${actor}: ${label} → ${expected}`, async () => {
    if (res.status() !== expected) {
      const body = await res.text().catch(() => '');
      expect(res.status(), `${actor} ${label}: ${body.slice(0, 300)}`).toBe(expected);
    }
  });
}

/** Creates a member with the given role through a real request and approval. */
async function addMember(owner: Account, member: Account, role: Exclude<WorkspaceRole, 'owner'>) {
  const req = await expectJson<JoinRequestDto>(await member.api.post(`${owner.base}/join-requests`, {}), 201);
  await expectJson(await owner.api.post(`/api/join-requests/${req.id}/approve`, { role }), 200);
}

test.describe('role permissions', () => {
  test.describe.configure({ timeout: 240_000 }); // registers several users; may wait out rate limits

  test('each role can do exactly what it should in a household', async ({ account, newAccount }) => {
    const owner = await newAccount('r-owner');
    const admin = await newAccount('r-admin', { workspace: false });
    const editor = await newAccount('r-editor', { workspace: false });
    const viewer = await newAccount('r-viewer', { workspace: false });
    const requester = await newAccount('r-requester', { workspace: false });
    const actors: Record<Actor, Account> = { owner, admin, editor, viewer, outsider: account };
    const base = owner.base;

    try {
      await addMember(owner, admin, 'admin');
      await addMember(owner, editor, 'editor');
      await addMember(owner, viewer, 'viewer');

      // Records owned by the owner, for the others to read and change.
      const expense = await expectJson(
        await owner.api.post(`${base}/expenses`, { amountMinor: 1000, date: isoDate(), note: uniqueTag('roles') }),
        201,
      );
      const income = await expectJson(await owner.api.post(`${base}/income`, { amountMinor: 5000, date: isoDate() }), 201);
      const category = (await owner.categories()).find((c: CategoryDto) => !c.parentId && c.kind === 'expense')!;
      const today = isoDate();

      for (const [actor, u] of Object.entries(actors) as [Actor, Account][]) {
        await test.step(actor, async () => {
          const as = u.api;
          // Reading
          for (const path of [
            `${base}/expenses`,
            `${base}/expenses/${expense.id}`,
            `${base}/income`,
            `${base}/income/${income.id}`,
            `${base}/investments`,
            `${base}/categories`,
            `${base}/stats/summary?from=${today}&to=${today}`,
            `${base}/members`,
          ]) {
            await check(actor, await as.get(path), READ[actor]!, `GET ${path.replace(base, '')}`);
          }

          // Creating, then cleaning up what was created
          const created = await as.post(`${base}/expenses`, { amountMinor: 10, date: today, note: `by ${actor}` });
          await check(actor, created, CREATE[actor]!, 'POST /expenses');
          if (created.ok()) {
            const { id } = await created.json();
            await check(actor, await as.delete(`${base}/expenses/${id}`), 204, 'DELETE own expense');
          }
          const inc = await as.post(`${base}/income`, { amountMinor: 10, date: today });
          await check(actor, inc, CREATE[actor]!, 'POST /income');
          if (inc.ok()) await expectStatus(await as.delete(`${base}/income/${(await inc.json()).id}`), 204);
          const inv = await as.post(`${base}/investments`, { amountMinor: 10, date: today });
          await check(actor, inv, CREATE[actor]!, 'POST /investments');
          if (inv.ok()) await expectStatus(await as.delete(`${base}/investments/${(await inv.json()).id}`), 204);
          const cat = await as.post(`${base}/categories`, { name: uniqueTag(`cat-${actor}`) });
          await check(actor, cat, CREATE[actor]!, 'POST /categories');
          if (cat.ok()) await expectStatus(await as.delete(`${base}/categories/${(await cat.json()).id}`), 204);
          await check(
            actor,
            await as.upload(`${base}/expenses/${expense.id}/attachments`, files.png()),
            CREATE[actor]!,
            'POST attachment',
          );

          // Changing the owner's records
          await check(actor, await as.patch(`${base}/expenses/${expense.id}`, { note: `edited by ${actor}` }), UPDATE[actor]!, 'PATCH expense');
          await check(actor, await as.patch(`${base}/income/${income.id}`, { source: actor }), UPDATE[actor]!, 'PATCH income');
          await check(actor, await as.patch(`${base}/categories/${category.id}`, { color: '#123456' }), UPDATE[actor]!, 'PATCH category');
          // Deleting someone else's: forbidden for viewers, hidden from outsiders. (Writers' deletes are covered above.)
          if (actor === 'viewer' || actor === 'outsider') {
            await check(actor, await as.delete(`${base}/expenses/${expense.id}`), actor === 'viewer' ? 403 : 404, 'DELETE expense');
            await check(actor, await as.delete(`${base}/income/${income.id}`), actor === 'viewer' ? 403 : 404, 'DELETE income');
            await check(actor, await as.delete(`${base}/categories/${category.id}`), actor === 'viewer' ? 403 : 404, 'DELETE category');
          }

          // Join requests are for owners and admins
          await check(actor, await as.get(`${base}/join-requests`), MANAGERS_ONLY[actor]!, 'GET /join-requests');
          // Site admin routes exist only for site admins
          await check(actor, await as.get('/api/admin/join-requests'), 404, 'GET /api/admin/join-requests');
        });
      }

      // Attachments added by writers along the way are still there for everyone to read.
      const detail = await expectJson(await viewer.api.get(`${base}/expenses/${expense.id}`), 200);
      expect(detail.attachments).toHaveLength(3); // one each from owner, admin and editor
      await expectStatus(await viewer.api.get(`${base}/expenses/${expense.id}/attachments/${detail.attachments[0].id}`), 200);

      // Deciding a request: editors, viewers and outsiders can't see it; admins can't grant admin.
      const req = await expectJson<JoinRequestDto>(await requester.api.post(`${base}/join-requests`, {}), 201);
      for (const actor of ['editor', 'viewer', 'outsider'] as const) {
        await check(actor, await actors[actor].api.post(`/api/join-requests/${req.id}/approve`, {}), 404, 'approve request');
        await check(actor, await actors[actor].api.post(`/api/join-requests/${req.id}/reject`, {}), 404, 'reject request');
      }
      await check('admin', await admin.api.post(`/api/join-requests/${req.id}/approve`, { role: 'admin' }), 403, 'approve as admin role');
      await check('admin', await admin.api.post(`/api/join-requests/${req.id}/reject`, {}), 200, 'reject request');

      // Managing members: only downwards; editors and viewers can't manage anyone.
      const member = (u: Account) => `${base}/members/${u.user.id}`;
      await check('editor', await editor.api.patch(member(viewer), { role: 'editor' }), 403, 'PATCH viewer role');
      await check('editor', await editor.api.delete(member(viewer)), 403, 'remove viewer');
      await check('viewer', await viewer.api.patch(member(editor), { role: 'viewer' }), 403, 'PATCH editor role');
      await check('viewer', await viewer.api.delete(member(editor)), 403, 'remove editor');
      await check('outsider', await account.api.patch(member(viewer), { role: 'editor' }), 404, 'PATCH viewer role');
      await check('admin', await admin.api.patch(member(owner), { role: 'viewer' }), 403, 'PATCH owner role');
      await check('admin', await admin.api.patch(member(viewer), { role: 'owner' }), 403, 'transfer ownership');
      await check('admin', await admin.api.delete(member(owner)), 403, 'remove owner');
      await check('admin', await admin.api.patch(member(viewer), { role: 'editor' }), 200, 'promote viewer');
      await check('admin', await admin.api.patch(member(viewer), { role: 'viewer' }), 200, 'demote back to viewer');
      await check('owner', await owner.api.patch(member(owner), { role: 'admin' }), 400, 'change own role');
      await check('owner', await owner.api.delete(member(owner)), 400, 'leave without transferring');

      // A removed member is an outsider again: everything 404s and the household leaves /me.
      await check('owner', await owner.api.delete(member(viewer)), 204, 'remove viewer');
      for (const path of [`${base}/expenses`, `${base}/expenses/${expense.id}`, `${base}/members`, `${base}/categories`]) {
        await check('viewer', await viewer.api.get(path), 404, `after removal GET ${path.replace(base, '')}`);
      }
      await check('viewer', await viewer.api.post(`${base}/expenses`, { amountMinor: 1, date: today }), 404, 'after removal POST /expenses');
      const me = await expectJson(await viewer.api.get('/api/me'), 200);
      expect(me.workspaces).toEqual([]);
    } finally {
      for (const u of [admin, editor, viewer]) {
        const res = await owner.api.delete(`${base}/members/${u.user.id}`);
        expect([204, 404]).toContain(res.status());
      }
    }
  });
});
