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
