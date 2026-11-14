import { request } from '@playwright/test';
import { deleteAccount, rememberedAccounts } from './accounts';
import { ApiClient } from './api-client';
import { resolveTarget } from './targets';

/**
 * Deletes every test account in the ledger (e2e/.accounts/<target>/): this run's, plus any
 * a crashed or interrupted earlier run left behind. One at a time, because DELETE /api/me
 * allows 5 requests a minute per IP; ApiClient waits out the 429s. Accounts a test already
 * deleted are only checked (GET /api/me → 404), which doesn't count against that limit.
 */
export default async function globalTeardown() {
  const leftovers = rememberedAccounts();
  if (!leftovers.length) return;
  const target = resolveTarget();
  console.log(`[e2e] deleting ${leftovers.length} test account(s) on ${target.apiURL}`);
  const ctx = await request.newContext({ baseURL: target.apiURL });
  const api = new ApiClient(ctx);
  let failed = 0;
  try {
    for (const account of leftovers) {
      try {
        if (!(await deleteAccount(api, account))) failed++;
      } catch (e) {
        failed++;
        console.warn(`[e2e] could not delete ${account.email}: ${(e as Error).message.split('\n')[0]}`);
      }
    }
  } finally {
    await ctx.dispose();
  }
  if (failed) console.warn(`[e2e] ${failed} test account(s) remain in e2e/.accounts; the next run retries them.`);
}
