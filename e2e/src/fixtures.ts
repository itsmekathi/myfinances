import { test as base, expect, type APIRequestContext, type Locator, type Page, type Response } from '@playwright/test';
import type { AuthResponse, CategoryDto } from '@myfinances/shared';
import {
  MOBILE,
  TOKEN_MAX_AGE_MS,
  registerAccount,
  rememberAccount,
  type AccountData,
} from './accounts';
import { ApiClient, METRICS_ATTACHMENT, endpointOf, expectJson, retryAfterMs, type RequestMetric } from './api-client';
import { resolveTarget } from './targets';

export const target = resolveTarget();

/** An account plus a client that is signed in as it. */
export interface Account extends AccountData {
  api: ApiClient;
  categories(): Promise<CategoryDto[]>;
}

async function freshTokens(api: ApiClient, account: AccountData): Promise<void> {
  if (Date.now() - account.issuedAt < TOKEN_MAX_AGE_MS) return;
  const res = await api.as(undefined, MOBILE).post('/api/auth/refresh', { refreshToken: account.refreshToken });
  const auth = await expectJson<AuthResponse>(res, 200);
  account.accessToken = auth.accessToken;
  account.refreshToken = auth.refreshToken!;
  account.issuedAt = Date.now();
  rememberAccount(account); // the old refresh token is now spent; teardown needs the new one
}

function withClient(data: AccountData, api: ApiClient): Account {
  const client = api.as(data.accessToken);
  return {
    ...data,
    api: client,
    categories: async () => expectJson<CategoryDto[]>(await client.get(`${data.base}/categories`), 200),
  };
}

type WorkerFixtures = {
  /** An APIRequestContext pointed at the API, shared by a worker. */
  apiRequest: APIRequestContext;
  /** One registered user per worker; global teardown deletes it. */
  workerAccount: AccountData;
};

type TestFixtures = {
  /** Timings of every request a test makes; attached for the summary reporter. */
  metrics: RequestMetric[];
  /** Anonymous API client (records metrics). */
  api: ApiClient;
  /** The worker's user with an authenticated client. Tests share its workspace, so use unique names. */
  account: Account;
  /** Registers a brand-new user for this test only; global teardown deletes it. */
  newAccount: (label?: string) => Promise<Account>;
  /** A page signed in as `account`. */
  loggedInPage: Page;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  apiRequest: [
    async ({ playwright }, use) => {
      const ctx = await playwright.request.newContext({ baseURL: target.apiURL });
      await use(ctx);
      await ctx.dispose();
    },
    { scope: 'worker' },
  ],

  workerAccount: [
    async ({ apiRequest }, use, workerInfo) => {
      const api = new ApiClient(apiRequest);
      await use(await registerAccount(api, `w${workerInfo.workerIndex}`));
    },
    // Registering may wait out a rate limit (429).
    { scope: 'worker', timeout: 180_000 },
  ],

  metrics: async ({}, use, testInfo) => {
    const metrics: RequestMetric[] = [];
    await use(metrics);
    if (metrics.length) {
      await testInfo.attach(METRICS_ATTACHMENT, {
        body: JSON.stringify(metrics),
        contentType: 'application/json',
      });
    }
  },

  api: async ({ apiRequest, metrics }, use) => {
    await use(new ApiClient(apiRequest, { metrics }));
  },

  account: async ({ api, workerAccount }, use) => {
    await freshTokens(api, workerAccount);
    await use(withClient(workerAccount, api));
  },

  newAccount: async ({ api }, use) => {
    await use(async (label = 'n') => withClient(await registerAccount(api, label), api));
  },

  loggedInPage: async ({ page, account, metrics }, use) => {
    await signIn(page, account, metrics);
    await use(page);
  },

  // Record the web app's own /api calls too, for the latency table.
  page: async ({ page, metrics }, use) => {
    page.on('requestfinished', (req) => {
      const url = req.url();
      if (!url.includes('/api/')) return;
      const timing = req.timing();
      if (timing.responseEnd < 0) return;
      void req.response().then((res) => {
        metrics.push({
          source: 'ui',
          method: req.method(),
          endpoint: endpointOf(url),
          status: res?.status() ?? 0,
          ms: timing.responseEnd,
        });
      });
    });
    // The app confirms deletes with window.confirm.
    page.on('dialog', (d) => void d.accept());
    await passVercelProtection(page);
    await use(page);
  },
});

/**
 * Staging is behind Vercel Authentication. Trades VERCEL_AUTOMATION_BYPASS_SECRET for
 * Vercel's bypass cookie, once per test: Vercel answers that request with a 307 that sets
 * the cookie, and after that every request to the web origin (pages, page.request, the
 * app's /api calls) passes. Sending the secret as a header on every request instead would
 * turn requests that don't follow redirects (signIn) into that 307, and would hand the
 * secret to third-party origins such as Google.
 */
async function passVercelProtection(page: Page): Promise<void> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret || !target.remote) return;
  const res = await page.request.get(`${target.webURL}/`, {
    headers: { 'x-vercel-protection-bypass': secret, 'x-vercel-set-bypass-cookie': 'true' },
    maxRedirects: 0,
  });
  if (res.ok()) return; // not protected (e.g. production)
  const redirected = res.status() >= 300 && res.status() < 400;
  const cookies = await page.context().cookies(target.webURL);
  if (!redirected || cookies.length === 0) {
    throw new Error(
      `Vercel bypass failed for ${target.webURL}: HTTP ${res.status()}, ${cookies.length} cookie(s). ` +
        'Check VERCEL_AUTOMATION_BYPASS_SECRET against Vercel → Settings → Deployment Protection.',
    );
  }
}

/**
 * Signs the browser in without the form: logs in through the web origin's /api proxy
 * with the page's own request context, so the httpOnly refresh cookie lands in the
 * browser, then loads the app, which restores the session from it.
 */
export async function signIn(
  page: Page,
  account: Pick<AccountData, 'email' | 'password'>,
  metrics?: RequestMetric[],
): Promise<void> {
  const api = new ApiClient(page.request, { metrics });
  const res = await api.post('/api/auth/login', { identifier: account.email, password: account.password });
  await expectJson(res, 200);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

/**
 * Clicks a button whose request the API rate-limits, and clicks again after Retry-After
 * if the app got a 429 (the browser doesn't retry the way ApiClient does).
 * Returns the response of the last attempt.
 */
export async function clickRateLimited(
  page: Page,
  button: Locator,
  isRequest: (res: Response) => boolean,
  maxAttempts = 4,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const [res] = await Promise.all([page.waitForResponse(isRequest), button.click()]);
    if (res.status() !== 429 || attempt >= maxAttempts) return res;
    const wait = retryAfterMs(res);
    console.warn(`[e2e] 429 on ${res.request().method()} ${endpointOf(res.url())} in the browser; clicking again in ${Math.round(wait / 1000)}s`);
    await page.waitForTimeout(wait);
  }
}

export { expect, rememberAccount, type AccountData };
