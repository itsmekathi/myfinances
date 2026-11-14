import type { StatsSummary } from '@myfinances/shared';
import { expectJson } from '../../src/api-client';
import { expect, test } from '../../src/fixtures';

test.describe('stats', () => {
  test('summarises the period by day and category, counting only the base currency', async ({ newAccount }) => {
    // A fresh workspace, so other tests' expenses don't change the totals.
    const u = await newAccount('stats');
    const food = (await u.categories()).find((c) => c.name === 'Food & Dining')!;
    const url = `${u.base}/expenses`;
    await expectJson(await u.api.post(url, { amountMinor: 25_000, date: '2026-03-01', categoryId: food.id }), 201);
    await expectJson(await u.api.post(url, { amountMinor: 5_000, date: '2026-03-15', categoryId: food.id }), 201);
    await expectJson(await u.api.post(url, { amountMinor: 1_000, date: '2026-03-15' }), 201);
    // Other currencies are stored but not summed yet.
    await expectJson(await u.api.post(url, { amountMinor: 99_999, date: '2026-03-15', currency: 'USD' }), 201);
    // Outside the range.
    await expectJson(await u.api.post(url, { amountMinor: 7_777, date: '2026-04-01' }), 201);

    const s = await expectJson<StatsSummary>(
      await u.api.get(`${u.base}/stats/summary?from=2026-03-01&to=2026-03-31`),
      200,
    );
    expect(s.currency).toBe('INR');
    expect(s.totalMinor).toBe(31_000);
    expect(s.byDay).toHaveLength(31);
    expect(s.byDay.find((d) => d.date === '2026-03-15')?.totalMinor).toBe(6_000);
    expect(s.byCategory[0]).toMatchObject({ name: 'Food & Dining', totalMinor: 30_000 });
  });
});
