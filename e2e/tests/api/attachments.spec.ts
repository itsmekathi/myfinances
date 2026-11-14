import { ATTACHMENT_LIMITS, type AttachmentDto, type ExpenseDetailDto } from '@myfinances/shared';
import { expectJson, expectStatus } from '../../src/api-client';
import { files, isoDate } from '../../src/data';
import { expect, test } from '../../src/fixtures';

test.describe('attachments', () => {
  let expenseUrl = '';

  test.beforeEach(async ({ account }) => {
    const e = await expectJson<{ id: string }>(
      await account.api.post(`${account.base}/expenses`, { amountMinor: 100, date: isoDate() }),
      201,
    );
    expenseUrl = `${account.base}/expenses/${e.id}`;
  });

  // Deleting the expense also deletes its stored files.
  test.afterEach(async ({ account }) => {
    if (expenseUrl) await account.api.delete(expenseUrl);
  });

  test('uploads, downloads and deletes files', async ({ account }) => {
    const png = files.png();
    const up = await expectJson<AttachmentDto>(await account.api.upload(`${expenseUrl}/attachments`, png), 201);
    expect(up).toMatchObject({ fileName: 'receipt.png', mimeType: 'image/png', sizeBytes: png.buffer.length });
    await expectJson(await account.api.upload(`${expenseUrl}/attachments`, files.pdf()), 201);

    const detail = await expectJson<ExpenseDetailDto>(await account.api.get(expenseUrl), 200);
    expect(detail.attachments).toHaveLength(2);
    expect(detail.attachmentCount).toBe(2);

    const dl = await account.api.get(`${expenseUrl}/attachments/${up.id}`);
    expect(dl.status()).toBe(200);
    expect(dl.headers()['content-type']).toBe('image/png');
    expect(Buffer.compare(await dl.body(), png.buffer)).toBe(0);

    await expectStatus(await account.api.delete(`${expenseUrl}/attachments/${up.id}`), 204);
    await expectStatus(await account.api.get(`${expenseUrl}/attachments/${up.id}`), 404);
  });

  test('downloads require authentication', async ({ account, api }) => {
    const up = await expectJson<AttachmentDto>(await account.api.upload(`${expenseUrl}/attachments`, files.png()), 201);
    await expectStatus(await api.get(`${expenseUrl}/attachments/${up.id}`), 401);
  });

  test('detects the type from the content, not the declared MIME type', async ({ account }) => {
    await expectStatus(await account.api.upload(`${expenseUrl}/attachments`, files.disguisedHtml()), 415);
  });

  test('rejects files over the size limit', async ({ account }) => {
    const png = files.png();
    const big = {
      ...png,
      name: 'big.png',
      buffer: Buffer.concat([png.buffer, Buffer.alloc(ATTACHMENT_LIMITS.maxBytes + 1)]),
    };
    await expectStatus(await account.api.upload(`${expenseUrl}/attachments`, big), 413);
  });
});
