import type { EntryDto, Paginated, StatsSummary } from '@myfinances/shared';
import { expectJson, expectStatus } from '../../src/api-client';
import { expect, test } from '../../src/fixtures';

// Each test gets its own account (deleted by global teardown, entries included),
// so totals aren't affected by other tests.
test.describe('income and investments', () => {
  test('CRUD under /income and /investments, with kind-matched categories', async ({ newAccount }) => {
    const u = await newAccount('entries');
    const cats = await u.categories();
    const salary = cats.find((c) => c.kind === 'income' && c.name === 'Salary' && !c.parentId)!;
    const funds = cats.find((c) => c.kind === 'investment' && c.name === 'Mutual funds' && !c.parentId)!;
    const food = cats.find((c) => c.kind === 'expense' && c.name === 'Food & Dining')!;
    expect(salary && funds && food).toBeTruthy();

    const income = await expectJson<EntryDto>(
      await u.api.post(`${u.base}/income`, {
        amountMinor: 120_000_00,
        date: '2026-03-01',
        categoryId: salary.id,
        source: 'Acme Corp',
      }),
      201,
    );
    expect(income).toMatchObject({ kind: 'income', currency: 'INR', source: 'Acme Corp' });

    // Wrong-kind categories are rejected.
    await expectStatus(await u.api.post(`${u.base}/income`, { amountMinor: 1, date: '2026-03-01', categoryId: food.id }), 400);
    await expectStatus(await u.api.post(`${u.base}/investments`, { amountMinor: 1, date: '2026-03-01', categoryId: salary.id }), 400);

    // An income id doesn't resolve under /investments.
    await expectStatus(await u.api.get(`${u.base}/investments/${income.id}`), 404);

    const updated = await expectJson<EntryDto>(
      await u.api.patch(`${u.base}/income/${income.id}`, { amountMinor: 125_000_00, note: 'Raise' }),
      200,
    );
    expect(updated).toMatchObject({ amountMinor: 125_000_00, note: 'Raise' });

    const list = await expectJson<Paginated<EntryDto>>(
      await u.api.get(`${u.base}/income?from=2026-03-01&to=2026-03-31`),
      200,
    );
    expect(list.items.map((e) => e.id)).toEqual([income.id]);

    await expectStatus(await u.api.delete(`${u.base}/income/${income.id}`), 204);
    await expectStatus(await u.api.get(`${u.base}/income/${income.id}`), 404);
  });

  test('the summary includes income, investments and what is left over', async ({ newAccount }) => {
    const u = await newAccount('net');
    const post = async (path: string, body: object) => expectJson(await u.api.post(`${u.base}/${path}`, body), 201);
    await post('income', { amountMinor: 100_000, date: '2026-03-01' });
    await post('investments', { amountMinor: 20_000, date: '2026-03-05' });
    await post('expenses', { amountMinor: 30_000, date: '2026-03-03' });
    await post('income', { amountMinor: 999, date: '2026-04-01' }); // outside the range

    const s = await expectJson<StatsSummary>(
      await u.api.get(`${u.base}/stats/summary?from=2026-03-01&to=2026-03-31`),
      200,
    );
    expect(s).toMatchObject({
      expensesMinor: 30_000,
      totalMinor: 30_000,
      incomeMinor: 100_000,
      investedMinor: 20_000,
      netMinor: 50_000,
    });
  });
});
