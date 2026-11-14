import { config as loadEnv } from 'dotenv';
import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { resolve } from 'node:path';
import { resolveTarget, runId } from './src/targets';

loadEnv({ path: resolve(__dirname, '.env'), quiet: true });

// resolveTarget() reads env lazily, so values from e2e/.env apply.

const target = resolveTarget();
const CI = Boolean(process.env.CI);
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

const reporters: ReporterDescription[] = [
  [CI ? 'dot' : 'list'],
  ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ['junit', { outputFile: 'results/junit.xml' }],
  ['json', { outputFile: 'results/results.json' }],
  ['./src/reporters/summary.ts', { outputDir: 'results' }],
];
if (CI) reporters.push(['github']);

// Workers load this config too; log once, from the main process.
if (!process.env.TEST_WORKER_INDEX) console.log(`[e2e] target=${target.name} web=${target.webURL} api=${target.apiURL} run=${runId}`);

export default defineConfig({
  testDir: './tests',
  globalSetup: './src/global-setup.ts',
  globalTeardown: './src/global-teardown.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // The API rate-limits per IP (login and register 10/min each, account deletion 5/min),
  // and every worker registers and finally deletes its own user, so keep it to 2 workers.
  workers: 2,
  // Generous enough to wait out one 429 (the client retries after Retry-After, up to ~60 s).
  // Render's cold start (~50 s) is absorbed by global setup before any test runs.
  timeout: target.remote ? 120_000 : 90_000,
  expect: { timeout: target.remote ? 15_000 : 7_500 },
  reporter: reporters,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: target.apiURL },
    },
    {
      name: 'ui',
      testDir: './tests/ui',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: target.webURL,
        locale: 'en-IN',
        timezoneId: 'Asia/Kolkata',
        actionTimeout: 15_000,
        navigationTimeout: target.remote ? 45_000 : 15_000,
        // Staging sits behind Vercel Authentication.
        extraHTTPHeaders: bypass
          ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' }
          : undefined,
      },
    },
  ],
  // Local runs reuse `pnpm dev` when it's up; otherwise (and in CI) start the built apps.
  webServer:
    target.name === 'local'
      ? [
          {
            name: 'api',
            command: 'pnpm --filter @myfinances/api exec prisma migrate deploy && pnpm --filter @myfinances/api start',
            cwd: '..',
            url: `${target.apiURL}/api/health`,
            reuseExistingServer: !CI,
            timeout: 120_000,
          },
          {
            name: 'web',
            // `vite preview` inherits server.proxy, so /api goes to :3000 like in dev.
            command: 'pnpm --filter @myfinances/web preview --port 5173 --strictPort',
            cwd: '..',
            url: target.webURL,
            reuseExistingServer: !CI,
            timeout: 120_000,
          },
        ]
      : undefined,
});
