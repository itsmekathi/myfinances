import { request, type APIRequestContext } from '@playwright/test';
import { resolveTarget } from './targets';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls `check` every few seconds until it returns a value, or throws after `timeoutMs`. */
async function poll<T>(what: string, timeoutMs: number, intervalMs: number, check: () => Promise<T | string>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let status: T | string;
    try {
      status = await check();
    } catch (e) {
      status = (e as Error).message.split('\n')[0];
    }
    if (typeof status !== 'string') return status;
    if (Date.now() > deadline) throw new Error(`[e2e] gave up waiting for ${what} after ${timeoutMs / 1000}s (last: ${status})`);
    console.log(`[e2e] waiting for ${what} (now: ${status})`);
    await sleep(intervalMs);
  }
}

/**
 * Checks that the web origin isn't behind Vercel Authentication, or that the bypass secret
 * gets past it. Only reports (in CI as an error annotation): the API suite doesn't need it.
 */
async function checkVercelProtection(webURL: string): Promise<void> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  const ctx = await request.newContext({
    extraHTTPHeaders: secret ? { 'x-vercel-protection-bypass': secret } : {},
  });
  try {
    // Through the web origin's /api proxy, like the UI suite's sign-in. When locked, Vercel
    // answers 401 "Protected deployment" here (pages get a 302 to its sign-in instead).
    const res = await ctx.get(`${webURL}/api/health/live`, { maxRedirects: 0, timeout: 60_000 });
    const location = res.headers()['location'] ?? '';
    const protectedByVercel =
      (res.status() === 401 && (await res.text()).includes('Protected deployment')) ||
      (res.status() >= 300 && res.status() < 400 && location.includes('vercel.com/sso'));
    if (!protectedByVercel) {
      console.log(`[e2e] web origin's /api proxy answers HTTP ${res.status()}${secret ? ' (with the bypass secret)' : ''}`);
      return;
    }
    const problem = secret
      ? `${webURL} rejected VERCEL_AUTOMATION_BYPASS_SECRET (${secret.length} characters). Copy the current value from Vercel → Settings → Deployment Protection → Protection Bypass for Automation.`
      : `${webURL} is behind Vercel Authentication and VERCEL_AUTOMATION_BYPASS_SECRET is not set. In GitHub it must be a repository secret (Settings → Secrets and variables → Actions → Repository secrets), not an environment secret.`;
    console.error(`[e2e] ${problem} The UI suite will fail.`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Vercel Authentication blocks the UI suite::${problem}`);
  } finally {
    await ctx.dispose();
  }
}

async function liveVersion(ctx: APIRequestContext): Promise<string> {
  const res = await ctx.get('/api/health/live', { timeout: 60_000 });
  if (!res.ok()) return `HTTP ${res.status()}`;
  return ((await res.json()) as { version?: string }).version ?? 'unknown';
}

/**
 * Before any test:
 * 1. With E2E_EXPECTED_SHA (post-deploy CI runs), waits until the API serves that commit.
 *    Render's deploy hook returns before the new image is live.
 * 2. Waits until the API and its database answer (Render free instances and Neon computes
 *    sleep when idle), then records the API version for the run summary.
 */
export default async function globalSetup() {
  const target = resolveTarget();
  const ctx = await request.newContext({ baseURL: target.apiURL });
  try {
    const expected = process.env.E2E_EXPECTED_SHA;
    if (expected) {
      const timeout = Number(process.env.E2E_DEPLOY_TIMEOUT_SECONDS ?? 900) * 1000;
      await poll(`${target.apiURL} to serve ${expected.slice(0, 12)}`, timeout, 10_000, async () => {
        const version = await liveVersion(ctx);
        return version === expected ? true : `version ${version.slice(0, 12)}`;
      });
    }

    await poll(`${target.apiURL}/api/health`, 3 * 60_000, 5_000, async () => {
      const res = await ctx.get('/api/health', { timeout: 60_000 });
      return res.ok() ? true : `HTTP ${res.status()}`;
    });
    process.env.E2E_API_VERSION = await liveVersion(ctx);
    if (target.remote) await checkVercelProtection(target.webURL);
    console.log(`[e2e] API is up (version ${process.env.E2E_API_VERSION})`);
  } finally {
    await ctx.dispose();
  }
}
