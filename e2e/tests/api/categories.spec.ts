import type { CategoryDto } from '@myfinances/shared';
import { expectJson, expectStatus } from '../../src/api-client';
import { uniqueTag } from '../../src/data';
import { expect, test } from '../../src/fixtures';

test.describe('categories', () => {
  test('new workspaces get the default categories and subcategories', async ({ account }) => {
    const cats = await account.categories();
    const food = cats.find((c) => c.name === 'Food & Dining' && !c.parentId);
    expect(food).toBeDefined();
    expect(cats.find((c) => c.name === 'Transport' && !c.parentId)).toBeDefined();
    expect(cats.filter((c) => c.parentId === food!.id).length).toBeGreaterThanOrEqual(3);
  });

  test('new workspaces get income and investment defaults too, filterable by kind', async ({ account }) => {
    const income = await expectJson<CategoryDto[]>(await account.api.get(`${account.base}/categories?kind=income`), 200);
    expect(income.every((c) => c.kind === 'income')).toBe(true);
    const salary = income.find((c) => c.name === 'Salary' && !c.parentId);
    expect(salary).toBeDefined();
    expect(income.some((c) => c.parentId === salary!.id && c.name === 'Bonus')).toBe(true);

    const investment = await expectJson<CategoryDto[]>(
      await account.api.get(`${account.base}/categories?kind=investment`),
      200,
    );
    expect(investment.find((c) => c.name === 'Mutual funds' && !c.parentId)).toBeDefined();
    expect(investment.every((c) => c.kind === 'investment')).toBe(true);

    // Without a filter, every kind comes back.
    const all = await account.categories();
    expect(new Set(all.map((c) => c.kind))).toEqual(new Set(['expense', 'income', 'investment']));
  });

  test('names are unique per kind, and subcategories take their parent\'s kind', async ({ account }) => {
    const url = `${account.base}/categories`;
    const food = (await account.categories()).find((c) => c.kind === 'expense' && c.name === 'Food & Dining')!;
    const name = uniqueTag('kind');

    const expense = await expectJson<CategoryDto>(await account.api.post(url, { name }), 201);
    const income = await expectJson<CategoryDto>(await account.api.post(url, { name, kind: 'income' }), 201);
    try {
      expect(expense.kind).toBe('expense');
      expect(income.kind).toBe('income');
      await expectStatus(await account.api.post(url, { name: name.toUpperCase(), kind: 'income' }), 409);

      const child = await expectJson<CategoryDto>(await account.api.post(url, { name: 'Child', parentId: income.id }), 201);
      expect(child.kind).toBe('income');
      await expectStatus(await account.api.post(url, { name: 'Mixed', parentId: food.id, kind: 'investment' }), 400);
    } finally {
      await account.api.delete(`${url}/${expense.id}`);
      await account.api.delete(`${url}/${income.id}`);
    }
  });

  test('creates, renames and deletes categories; deleting a parent removes its children', async ({ account }) => {
    const url = `${account.base}/categories`;
    const name = uniqueTag('cat');

    const parent = await expectJson<CategoryDto>(await account.api.post(url, { name, color: '#22C55E', icon: 'circle' }), 201);
    expect(parent).toMatchObject({ name, parentId: null });
    const child = await expectJson<CategoryDto>(await account.api.post(url, { name: 'Child', parentId: parent.id }), 201);
    expect(child.parentId).toBe(parent.id);

    const renamed = await expectJson<CategoryDto>(await account.api.patch(`${url}/${parent.id}`, { name: `${name}-x` }), 200);
    expect(renamed.name).toBe(`${name}-x`);

    await expectStatus(await account.api.delete(`${url}/${parent.id}`), 204);
    const after = await account.categories();
    expect(after.some((c) => c.id === parent.id || c.id === child.id)).toBe(false);
  });

  test('enforces unique names per parent and one level of nesting', async ({ account }) => {
    const url = `${account.base}/categories`;
    const cats = await account.categories();
    const food = cats.find((c) => c.name === 'Food & Dining')!;
    const restaurants = cats.find((c) => c.name === 'Restaurants' && c.parentId === food.id)!;
    const name = uniqueTag('sub');

    const sub = await expectJson<CategoryDto>(await account.api.post(url, { name, parentId: food.id }), 201);
    try {
      // Case-insensitive duplicate under the same parent.
      await expectStatus(await account.api.post(url, { name: name.toUpperCase(), parentId: food.id }), 409);
      // Top-level duplicates are checked by the controller (NULL parentIds don't collide in the index).
      await expectStatus(await account.api.post(url, { name: 'groceries' }), 409);
      // Subcategories can't have children.
      await expectStatus(await account.api.post(url, { name: 'Too deep', parentId: restaurants.id }), 400);
    } finally {
      await account.api.delete(`${url}/${sub.id}`);
    }
  });
});
