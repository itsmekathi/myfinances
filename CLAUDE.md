# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MyFinances is an expense tracker in a pnpm + Turborepo monorepo:

- `apps/api`: NestJS 12 REST API with Prisma 7 and PostgreSQL. Every route is under `/api`; Swagger docs are at `/api/docs`.
- `apps/web`: React 19, Vite, Tailwind 4, TanStack Query and React Router 8.
- `apps/mobile`: Expo SDK 58 (React Native) with Expo Router.
- `packages/shared`: Zod schemas, DTO types and money/date helpers. **This is the single source of truth for request validation and API types.**
- `packages/api-client`: a typed `fetch` client used by web and mobile. It handles access/refresh tokens and retries once on a 401.

The web and mobile apps consume the shared packages from their compiled `dist/`. **After editing `packages/shared` or `packages/api-client`, run `pnpm --filter <pkg> build`.** Otherwise the apps keep seeing the old code. The API's `nest --watch` only restarts after a successful compile, so if a shared rebuild races with it, touch a file in `apps/api/src`.

## Branches and deployment

- Branch names must be `main` or `feature/<name-or-issue-number>`: lowercase letters, digits and hyphens (e.g. `feature/42-add-budgets`).
- This is enforced by a GitHub ruleset (`.github/rulesets/branch-naming.json`) and by the first step of CI.
- `main` is protected by `.github/rulesets/protect-main.json`: changes go through a PR, and the PR needs a passing `checks / checks`. No direct pushes or force pushes.
- `.github/workflows/deploy-production.yml` deploys `main` to production; `deploy-staging.yml` deploys `feature/*` branches to staging (Render API and Vercel). Both run the reusable `checks.yml` first. Deploy jobs use the `production`/`staging` GitHub environments, so environment protection rules (e.g. required reviewers) gate them.
- See `deployment/` for the hosting decisions and the setup guide.

## Commands

Run from the repo root unless noted.

```sh
pnpm dev                 # API (:3000) + web (:5173); Vite proxies /api to the API
pnpm dev:api | dev:web | dev:mobile
pnpm typecheck           # turbo, all packages
pnpm build
pnpm test:e2e            # API end-to-end tests (Jest + Supertest) against the myfinances_test DB
pnpm --filter @myfinances/api test:e2e -t "attachments"      # run tests matching a name (no `--`: pnpm forwards it literally)
pnpm db:migrate          # prisma migrate dev (interactive)
pnpm --filter @myfinances/api seed:subcategories            # idempotent default-category backfill
```

Mobile (inside `apps/mobile`):
- Install native-capable packages with `npx expo install <pkg>`, not `pnpm add`.
- Typecheck with `npx tsc --noEmit`.
- Verify bundling with `CI=1 npx expo export --platform android --no-bytecode`. Hermes bytecode compilation fails in this Windows environment.

## Local environment

- **PostgreSQL 16 runs on port 5433** (user/password `postgres`/`postgres`). A separate PostgreSQL 18 owns 5432 with an unknown password; don't use it.
- `apps/api/.env` holds `DATABASE_URL`, `JWT_ACCESS_SECRET`, `GOOGLE_CLIENT_IDS` (comma-separated) and `STORAGE_DIR`. See `.env.example`. The env is validated by a Zod schema in `apps/api/src/config/env.ts`.
- The e2e setup (`apps/api/test/setup-env.ts`):
  - points at `<db>_test`
  - sets `NODE_ENV=test`, which disables the throttler
  - uses a temp `STORAGE_DIR`
  - creates the DB and runs `migrate deploy` before the tests, and truncates tables before each one
- **Migrations:** `prisma migrate dev` refuses to run non-interactively whenever it prints a warning. Instead, generate the SQL with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<ts>_<name>/migration.sql`, then run `npx prisma migrate deploy`.
- **Version pins:** Prisma is pinned to **7.10.1**; the `latest` tag pointed at an 8.0 pre-release. TypeScript is pinned to **5.9**.
- **pnpm 12 blocks dependency build scripts.** Approve them with `pnpm approve-builds <pkg> -y`, which writes `allowBuilds` in `pnpm-workspace.yaml`.

## Architecture notes

**Validation.** NestJS 12 validates directly against the shared Zod schemas: `@Body({ schema })` and `@Query({ schema })` with the global `StandardSchemaValidationPipe`. There are no DTO classes or class-validator. Shared types come in two forms:
- `*Input` (`z.input`) is what clients send.
- `*Data` (`z.output`) is the parsed form the API receives.

**NestJS / CommonJS.** Nest packages are ESM-only. The API compiles to CommonJS and loads them via Node 24's `require(esm)`. The e2e tests need `--experimental-vm-modules`, which the script already passes.

**Prisma.**
- The client is generated into `apps/api/src/generated/prisma` (gitignored), with `moduleFormat = "cjs"`.
- It uses the `@prisma/adapter-pg` driver adapter.
- `PrismaService` builds the client from `ConfigService`.
- The config lives in `apps/api/prisma.config.ts`.

**Auth** (`apps/api/src/auth`):
- A global `JwtAuthGuard` requires a Bearer access token unless the route is marked `@Public()`.
- Access tokens are 15-minute JWTs with `typ: 'access'`.
- Refresh tokens are random values stored hashed in `RefreshToken`. They are rotated on every use, and reusing one revokes its whole `familyId`.
- Web gets the refresh token as an httpOnly cookie `mf_rt` (path `/api/auth`). Mobile sends `X-Client-Type: mobile` and gets it in the response body; the app stores it in SecureStore.
- Google sign-in verifies the ID token against `GOOGLE_CLIENT_IDS`. If a Google login matches an unverified password account, the password is removed (prevents account pre-hijacking).

**Multi-tenancy.**
- All data lives in a `Workspace`; each user gets a personal one at signup (`WorkspacesService.createPersonal`).
- Routes look like `workspaces/:workspaceId/...` and are protected by `WorkspaceGuard`, which:
  - checks `WorkspaceMember`
  - returns 404 rather than 403 for non-members
  - blocks viewers from non-GET requests
  - attaches the result for `@CurrentWorkspace()`
- **Every query must also filter by `workspaceId`**, and by the parent id for nested resources.

**Money.** Amounts are integer minor units (`amountMinor`), stored as `BigInt` in the DB and returned as `number`. Use `toMinor`, `fromMinor` and `formatMoney` from shared; never use floats for stored values. Stats only sum expenses in the workspace's `baseCurrency` (default INR).

**Expenses** (`expenses/expenses.service.ts`, `expense.mapper.ts`):
- **Items:** when `items` is sent, the total is computed from them (`itemAmountMinor` = round(qty × unit price)). An update with `items` replaces all items. While items exist, `amountMinor` can't be edited directly.
- **Subcategories:** `subcategoryId` must be a child of `categoryId`, and changing the category clears a mismatched subcategory.
- **Audit:** `createdBy`, `createdClient`, `updatedBy` and `updatedClient` are recorded via the `@ClientInfo()` decorator (`common/client-info.ts`). It combines the User-Agent (parsed with `bowser`) with the mobile headers `X-Client-Platform` and `X-App-Version`.
- **Responses:** list endpoints return `ExpenseDto` with counts. `GET :id` returns `ExpenseDetailDto` with items and attachments.

**Categories.**
- Categories are two levels deep: `parentId` set means a subcategory.
- The API returns a flat list; clients nest it with `buildCategoryTree`.
- Postgres treats NULL `parentId` values as distinct, so the unique index `[workspaceId, parentId, name]` doesn't catch duplicate top-level names. The controller checks those itself.
- Deleting a parent also deletes its children.
- Default categories live in `DEFAULT_CATEGORIES` (shared) and are seeded by `workspaces/default-categories.ts`.

**Attachments.**
- `StorageService` writes files to local disk under random UUID keys, so user file names never become paths. It's meant to be swapped for S3/R2 when deploying.
- Uploads are multipart field `file`, limited by `ATTACHMENT_LIMITS` in shared.
- The type is detected from the file's leading bytes (`attachments/file-type.ts`), not the client's MIME type.
- Downloads require auth. Web fetches them as blobs; mobile uses `api.authHeaders()` for `<Image>` and `File.downloadFileAsync`.

**Clients.**
- **Web:** `AuthProvider` restores the session on load via `api.auth.restore()`, which de-duplicates concurrent refreshes and is StrictMode-safe. Query keys follow the pattern `['expenses' | 'expense' | 'stats' | 'categories', workspaceId, ...]`, and mutations invalidate by that prefix. The expense editor is a full page at `/expenses/new` and `/expenses/:id`.
- **Mobile:** `Stack.Protected` guards routes based on auth status. The Google Sign-In native module is `require`d only when `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set, so password login still works in Expo Go. Its config plugin is only added when an iOS client ID exists, because the plugin throws without `iosUrlScheme`.

## Mobile app rules (from `apps/mobile/AGENTS.md`)

- Expo changes every SDK release. Check the versioned docs (`https://docs.expo.dev/versions/v58.0.0/`) rather than relying on memory.
- Routes live in `src/app/`; keep non-route code outside it.
- Never edit `ios/` or `android/` by hand (they are generated). Configure native behaviour in `app.config.ts` and config plugins.
- Libraries with native code require a development build, not Expo Go.
- Since SDK 58, `expo-file-system`'s main API is `File`, `Directory` and `Paths`. The old functions live in `expo-file-system/legacy`.

## Environment quirks

- **Windows + Git Bash:** `python3` is the Microsoft Store stub and hangs, so use `node` for scripting. Windows `curl` can't read `/tmp/...` paths; use `cygpath -w`.
