# Playwright end-to-end tests

This package has two suites that run against a real API and web app:

| Suite | What it does | Folder |
|---|---|---|
| `api` | Calls the API over HTTP: auth and token rotation, workspace isolation, categories, expenses and items, income and investments, attachments, stats, account deletion. No browser. | `tests/api` |
| `ui` | Drives the web app in Chromium: public pages, sign-up and sign-in, the expense editor, item breakdowns, receipts, income and investments, categories, account deletion. | `tests/ui` |

## Running

Run these from the repo root:

```sh
pnpm --filter @myfinances/e2e install-browsers   # once: downloads Chromium

pnpm pw            # both suites
pnpm pw:api        # API suite only
pnpm pw:ui         # UI suite only
pnpm pw:report     # open the last HTML report
```

To pass extra Playwright flags, e.g. a single file or a title filter:

```sh
pnpm --filter @myfinances/e2e exec playwright test tests/ui/expenses.spec.ts --headed
pnpm --filter @myfinances/e2e exec playwright test -g "token"
```

## Targets

`E2E_TARGET` picks the environment. You can set it inline or in `e2e/.env` (see `.env.example`).

| `E2E_TARGET` | Web | API |
|---|---|---|
| `local` (default) | http://localhost:5173 | http://localhost:3000 |
| `staging` | https://myfinances-gamma-staging.vercel.app | https://myfinances-api-staging.onrender.com |
| `production` | https://myfinances-gamma.vercel.app | https://myfinances-api-0km5.onrender.com |

```sh
E2E_TARGET=staging VERCEL_AUTOMATION_BYPASS_SECRET=… pnpm pw
E2E_TARGET=production pnpm pw:api
E2E_TARGET=staging E2E_WEB_URL=https://<some-preview>.vercel.app pnpm pw:ui
```

- **Local:** if `pnpm dev` is running, the tests use it. Otherwise Playwright starts the built apps itself: `prisma migrate deploy`, then `node dist/main.js`, plus `vite preview`. Run `pnpm build` first in that case.
- **Staging:** the web app sits behind Vercel Authentication, so the UI suite needs `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel → Deployment Protection → Protection Bypass for Automation).
- **Remote targets in general:** global setup waits up to 3 minutes for a sleeping Render or Neon instance to wake up.

## Test data and cleanup

- Each worker registers its own user (`e2e-<run>-w<n>-…@example.test`). Tests share that workspace, so they use unique names and tags, and filter by them.
- Sign-up creates no workspace, so `registerAccount` also creates a household with a unique name (every household is searchable, and production runs the suite). `newAccount(label, { workspace: false })` skips it, for users who will join someone else's household.
- Tests that need an isolated account call the `newAccount()` fixture. These are stats totals, workspace isolation, account deletion, households and role permissions.
- Tests that add members to a household remove them again in a `finally`. Teardown deletes accounts one at a time, and an owner can't delete their account while others are members.
- Every account goes into `e2e/.accounts/<target>/` (gitignored), with its latest tokens. Global teardown deletes them all with `DELETE /api/me`, one at a time. That includes accounts an interrupted earlier run left behind; anything that still fails is retried by the next run.
- Accounts that a test already deleted are only checked (`GET /api/me` returns 404), so they don't use up a delete.
- Rate limits are per IP: login and register allow 10 requests a minute each, and `DELETE /api/me` allows 5. That's why the workers don't delete their own accounts: two workers doing so at once ran into 429s.
- `ApiClient` waits out a `429` by honouring `Retry-After`, for up to 150s per call. The browser doesn't retry, so tests that click a rate-limited button use `clickRateLimited()`. Runs include a minute or two of waiting. Keep `workers` at 2.

## Results and metrics

Each run writes:
- `playwright-report/`: the HTML report, with traces, screenshots and videos of failures
- `results/summary.md`: the same markdown that goes to the GitHub job summary. It includes pass, fail, flaky and skipped counts per suite, the failures, the slowest tests, and request latency per endpoint (p50, p95, max). Latency is reported separately for calls made by the API suite (`api`) and by the web app in the browser (`ui`).
- `results/metrics.json`: the same data as JSON, for comparing runs
- `results/junit.xml` and `results/results.json`

In GitHub Actions, the summary is appended to `$GITHUB_STEP_SUMMARY`, failures appear as annotations, and everything above is uploaded as the `playwright-<target>-<suite>-<attempt>` artifact. The workflows are described in `deployment/setup-guide.md` section 11.

## Writing tests

- Import `test` and `expect` from `src/fixtures.ts`. These fixtures are available:
  - `api`: an anonymous client
  - `account`: the worker's user, with `account.api` and `account.base` = `/api/workspaces/<id>`
  - `newAccount(label)`: a fresh user for one test
  - `loggedInPage`: a page signed in as `account`
  - `apiRequest`: the raw Playwright request context
- Use `expectJson(res, status)` and `expectStatus(res, status)` from `src/api-client.ts`. On a mismatch they include the response body in the failure.
- Prefer role and label locators, which is how the app is labelled. `window.confirm` dialogs are accepted automatically.
- Clean up what you create, using `try/finally` or `afterEach`. Production runs the same tests.

### Roles

- `tests/api/roles.spec.ts` checks every endpoint as owner, admin, editor, viewer, outsider and removed member, expecting 2xx, 403 or 404 for each. When you add an endpoint under `workspaces/:id`, add it there.
- `tests/ui/roles.spec.ts` checks that viewers see no add, edit or delete controls, and that editors can write but not manage members.
- **Site admins are not covered here.** The role can only be granted through a verified Google sign-in (`SITE_ADMIN_EMAILS`) or the database, so the suites can't create one on staging or production. The site admin flow (seeing every pending request, approving for any household) is tested by the Jest suite in `apps/api/test/app.e2e-spec.ts`. Playwright only checks that `/api/admin/*` returns 404 for everyone else.
