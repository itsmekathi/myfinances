import type { ExpenseDetailDto, ExpenseDto, Paginated } from '@myfinances/shared';
import { expectJson, expectStatus } from '../../src/api-client';
import { isoDate, uniqueTag } from '../../src/data';
import { expect, test, type Account } from '../../src/fixtures';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Creates expenses and deletes them afterwards, even when the test fails halfway. */
function tracker(account: Account) {
  const ids: string[] = [];
  return {
    async create(body: object, headers?: Record<string, string>) {
      const e = await expectJson<ExpenseDetailDto>(
        await account.api.post(`${account.base}/expenses`, { date: isoDate(), ...body }, { headers }),
        201,
      );
      ids.push(e.id);
      return e;
    },
    async cleanup() {
      for (const id of ids) await account.api.delete(`${account.base}/expenses/${id}`);
    },
  };
}

test.describe('expenses', () => {
  test('create, read, update and delete', async ({ account }) => {
    const t = tracker(account);
    try {
      const food = (await account.categories()).find((c) => c.name === 'Food & Dining')!;
      const created = await t.create({ amountMinor: 25_000, categoryId: food.id, note: 'Dinner', time: '19:45' });
      expect(created).toMatchObject({
        amountMinor: 25_000,
        currency: 'INR',
        categoryId: food.id,
        note: 'Dinner',
        time: '19:45',
      });

      const url = `${account.base}/expenses/${created.id}`;
      const detail = await expectJson<ExpenseDetailDto>(await account.api.get(url), 200);
      expect(detail).toMatchObject({ id: created.id, items: [], attachments: [] });

      const updated = await expectJson<ExpenseDto>(
        await account.api.patch(url, { amountMinor: 30_000, merchant: 'Truffles' }),
        200,
      );
      expect(updated).toMatchObject({ amountMinor: 30_000, merchant: 'Truffles' });

      await expectStatus(await account.api.delete(url), 204);
      await expectStatus(await account.api.get(url), 404);
    } finally {
      await t.cleanup();
    }
  });

  test('validates input', async ({ account }) => {
    const url = `${account.base}/expenses`;
    await expectStatus(await account.api.post(url, { amountMinor: -5, date: isoDate() }), 400);
    await expectStatus(await account.api.post(url, { date: isoDate() }), 400); // no amount and no items
    await expectStatus(await account.api.post(url, { amountMinor: 100, date: 'yesterday' }), 400);
    await expectStatus(await account.api.post(url, { amountMinor: 100, date: isoDate(), time: '25:00' }), 400);
  });

  test('stores details and tags, filters by tag and paginates', async ({ account }) => {
    const t = tracker(account);
    const tag = uniqueTag('tag');
    try {
      const first = await t.create({
        amountMinor: 45_000,
        merchant: 'Truffles',
        location: 'Koramangala, Bengaluru',
        description: 'Team dinner',
        paymentMethod: 'upi',
        tags: [tag.toUpperCase(), ` ${tag} `, 'reimbursable'],
      });
      expect(first.tags).toEqual([tag, 'reimbursable']);
      expect(first).toMatchObject({ merchant: 'Truffles', paymentMethod: 'upi', location: 'Koramangala, Bengaluru' });
      await t.create({ amountMinor: 100, tags: [tag] });
      await t.create({ amountMinor: 200, tags: [tag] });
      await t.create({ amountMinor: 300 }); // untagged: filtered out

      const list = (page: number) =>
        account.api.get(`${account.base}/expenses?tag=${encodeURIComponent(tag)}&pageSize=2&page=${page}`);
      const page1 = await expectJson<Paginated<ExpenseDto>>(await list(1), 200);
      expect(page1.total).toBe(3);
      expect(page1.items).toHaveLength(2);
      const page2 = await expectJson<Paginated<ExpenseDto>>(await list(2), 200);
      expect(page2.items).toHaveLength(1);
      expect(new Set([...page1.items, ...page2.items].map((e) => e.id)).size).toBe(3);
    } finally {
      await t.cleanup();
    }
  });

  test('checks that the subcategory belongs to the category', async ({ account }) => {
    const t = tracker(account);
    try {
      const cats = await account.categories();
      const food = cats.find((c) => c.name === 'Food & Dining')!;
      const transport = cats.find((c) => c.name === 'Transport')!;
      const restaurants = cats.find((c) => c.name === 'Restaurants' && c.parentId === food.id)!;
      const url = `${account.base}/expenses`;
      const body = { amountMinor: 100, date: isoDate() };

      await expectStatus(
        await account.api.post(url, { ...body, categoryId: transport.id, subcategoryId: restaurants.id }),
        400,
      );
      await expectStatus(await account.api.post(url, { ...body, subcategoryId: restaurants.id }), 400);
      await expectStatus(await account.api.post(url, { ...body, categoryId: restaurants.id }), 400);

      const created = await t.create({ ...body, categoryId: food.id, subcategoryId: restaurants.id });
      // Moving to another category clears the subcategory that no longer fits.
      const moved = await expectJson<ExpenseDto>(
        await account.api.patch(`${url}/${created.id}`, { categoryId: transport.id }),
        200,
      );
      expect(moved.subcategoryId).toBeNull();
    } finally {
      await t.cleanup();
    }
  });

  test('computes the total from items and locks the amount while items exist', async ({ account }) => {
    const t = tracker(account);
    try {
      const created = await t.create({
        amountMinor: 1, // ignored when items are sent
        items: [
          { name: 'Milk', quantity: 2, unitPriceMinor: 3000 },
          { name: 'Bread', unitPriceMinor: 4500 },
          { name: 'Rice (kg)', quantity: 1.5, unitPriceMinor: 6000 },
        ],
      });
      expect(created.amountMinor).toBe(6000 + 4500 + 9000);
      expect(created.itemCount).toBe(3);
      expect(created.items.map((i) => i.name)).toEqual(['Milk', 'Bread', 'Rice (kg)']);

      const url = `${account.base}/expenses/${created.id}`;
      await expectStatus(await account.api.patch(url, { amountMinor: 5 }), 400);

      const replaced = await expectJson<ExpenseDetailDto>(
        await account.api.patch(url, { items: [{ name: 'Eggs', quantity: 12, unitPriceMinor: 700 }] }),
        200,
      );
      expect(replaced.amountMinor).toBe(8400);
      expect(replaced.items).toHaveLength(1);

      await expectStatus(await account.api.patch(url, { items: [] }), 400); // needs an explicit amount
      const cleared = await expectJson<ExpenseDto>(await account.api.patch(url, { items: [], amountMinor: 9000 }), 200);
      expect(cleared).toMatchObject({ amountMinor: 9000, itemCount: 0 });
    } finally {
      await t.cleanup();
    }
  });

  test('records who created and edited an expense, and from which client', async ({ account }) => {
    const t = tracker(account);
    try {
      const created = await t.create({ amountMinor: 100 }, { 'User-Agent': CHROME_UA });
      expect(created.createdBy.displayName).toBeTruthy();
      expect(created.createdClient).toMatchObject({ type: 'web', browser: 'Chrome', os: 'Windows' });
      expect(created.updatedBy).toBeNull();

      const updated = await expectJson<ExpenseDto>(
        await account.api.patch(
          `${account.base}/expenses/${created.id}`,
          { note: 'edited on phone' },
          { headers: { 'X-Client-Type': 'mobile', 'X-Client-Platform': 'android', 'X-App-Version': '0.1.0' } },
        ),
        200,
      );
      expect(updated.updatedBy?.displayName).toBe(created.createdBy.displayName);
      expect(updated.updatedClient).toMatchObject({ type: 'android', appVersion: '0.1.0' });
    } finally {
      await t.cleanup();
    }
  });
});
