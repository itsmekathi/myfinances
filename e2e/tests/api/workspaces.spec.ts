import { expectJson, expectStatus } from '../../src/api-client';
import { files, isoDate } from '../../src/data';
import { expect, test } from '../../src/fixtures';

test.describe('workspace isolation', () => {
  test("another user's workspace looks like it doesn't exist (404, not 403)", async ({ account, newAccount }) => {
    const owner = account;
    const intruder = await newAccount('intruder');

    const expense = await expectJson(
      await owner.api.post(`${owner.base}/expenses`, { amountMinor: 500, date: isoDate(), note: 'private' }),
      201,
    );
    const att = await expectJson(
      await owner.api.upload(`${owner.base}/expenses/${expense.id}/attachments`, files.png()),
      201,
    );
    const ownCategory = (await owner.categories()).find((c) => !c.parentId)!;

    const as = intruder.api;
    for (const path of [
      `${owner.base}/expenses`,
      `${owner.base}/expenses/${expense.id}`,
      `${owner.base}/expenses/${expense.id}/attachments/${att.id}`,
      `${owner.base}/categories`,
      `${owner.base}/stats/summary?from=${isoDate()}&to=${isoDate()}`,
    ]) {
      await expectStatus(await as.get(path), 404);
    }
    await expectStatus(await as.patch(`${owner.base}/expenses/${expense.id}`, { note: 'hacked' }), 404);
    await expectStatus(await as.delete(`${owner.base}/expenses/${expense.id}`), 404);
    await expectStatus(await as.post(`${owner.base}/categories`, { name: 'hacked' }), 404);

    // Ids from another workspace don't resolve through the intruder's own workspace either.
    await expectStatus(await as.get(`${intruder.base}/expenses/${expense.id}`), 404);
    await expectStatus(await as.get(`${intruder.base}/expenses/${expense.id}/attachments/${att.id}`), 404);
    await expectStatus(
      await as.post(`${intruder.base}/expenses`, { amountMinor: 100, date: isoDate(), categoryId: ownCategory.id }),
      400,
    );

    // Untouched.
    const still = await expectJson(await owner.api.get(`${owner.base}/expenses/${expense.id}`), 200);
    expect(still.note).toBe('private');
    await owner.api.delete(`${owner.base}/expenses/${expense.id}`);
  });
});
