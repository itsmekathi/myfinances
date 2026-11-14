import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/** One timed HTTP call, aggregated into the latency table of the run summary. */
export interface RequestMetric {
  /** `api` = called by a test directly; `ui` = made by the web app in the browser. */
  source: 'api' | 'ui';
  method: string;
  /** Path with ids replaced by `:id`, e.g. /api/workspaces/:id/expenses. */
  endpoint: string;
  status: number;
  ms: number;
}

export const METRICS_ATTACHMENT = 'request-metrics';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** /api/workspaces/1b2c…/expenses?x=1 → /api/workspaces/:id/expenses */
export function endpointOf(url: string): string {
  const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0];
  return path.replace(UUID, ':id');
}

type RequestOptions = NonNullable<Parameters<APIRequestContext['fetch']>[1]>;

export interface ClientOptions {
  token?: string;
  /** Extra headers on every request, e.g. X-Client-Type: mobile. */
  headers?: Record<string, string>;
  metrics?: RequestMetric[];
}

/** How long one call may spend waiting out 429s before the 429 is returned to the test. */
const MAX_THROTTLE_WAIT_MS = 150_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How long the throttler asks us to wait; Nest sends Retry-After or Retry-After-<name>. */
export function retryAfterMs(res: { headers(): Record<string, string> }): number {
  const headers = res.headers();
  const key = Object.keys(headers).find((k) => k.startsWith('retry-after'));
  const seconds = key ? Number(headers[key]) : NaN;
  return (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 65) : 15) * 1000 + 250;
}

/**
 * A thin wrapper over Playwright's APIRequestContext: adds the bearer token, records
 * per-request latency and waits out rate limits (429), which a shared CI IP can hit on
 * the auth routes (10/min) and account deletion (5/min).
 */
export class ApiClient {
  constructor(
    readonly request: APIRequestContext,
    private readonly opts: ClientOptions = {},
  ) {}

  /** The same client authenticated as someone else (or anonymous with `undefined`). */
  as(token: string | undefined, headers?: Record<string, string>): ApiClient {
    return new ApiClient(this.request, { ...this.opts, token, headers: { ...this.opts.headers, ...headers } });
  }

  get token() {
    return this.opts.token;
  }

  async fetch(method: string, url: string, options: RequestOptions = {}): Promise<APIResponse> {
    const headers: Record<string, string> = { ...this.opts.headers, ...(options.headers ?? {}) };
    if (this.opts.token && !('Authorization' in headers)) headers.Authorization = `Bearer ${this.opts.token}`;

    let waited = 0;
    for (;;) {
      const started = performance.now();
      const res = await this.request.fetch(url, { ...options, method, headers, maxRedirects: 0 });
      const ms = performance.now() - started;
      if (res.status() === 429 && waited < MAX_THROTTLE_WAIT_MS) {
        const wait = retryAfterMs(res);
        console.warn(`[e2e] 429 on ${method} ${endpointOf(url)}; retrying in ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        waited += wait;
        continue;
      }
      this.opts.metrics?.push({ source: 'api', method, endpoint: endpointOf(url), status: res.status(), ms });
      return res;
    }
  }

  get(url: string, options?: RequestOptions) {
    return this.fetch('GET', url, options);
  }
  post(url: string, data?: unknown, options?: RequestOptions) {
    return this.fetch('POST', url, { ...options, ...(data === undefined ? {} : { data }) });
  }
  patch(url: string, data?: unknown, options?: RequestOptions) {
    return this.fetch('PATCH', url, { ...options, ...(data === undefined ? {} : { data }) });
  }
  delete(url: string, data?: unknown, options?: RequestOptions) {
    return this.fetch('DELETE', url, { ...options, ...(data === undefined ? {} : { data }) });
  }
  upload(url: string, file: { name: string; mimeType: string; buffer: Buffer }) {
    return this.fetch('POST', url, { multipart: { file } });
  }
}

/** Parses JSON after checking the status, with the body in the error message on mismatch. */
export async function expectJson<T = any>(res: APIResponse, status: number): Promise<T> {
  await expectStatus(res, status);
  return (await res.json()) as T;
}

export async function expectStatus(res: APIResponse, status: number): Promise<void> {
  if (res.status() === status) return;
  const body = await res.text().catch(() => '');
  expect(res.status(), `${res.url()} returned: ${body.slice(0, 500)}`).toBe(status);
}
