# MyFinances

Expense tracker: a separate backend API, web app and mobile app in one monorepo.

| Part | Path | Stack |
|---|---|---|
| API | `apps/api` | NestJS 12, Prisma 7, PostgreSQL |
| Web | `apps/web` | React 19, Vite, Tailwind 4, TanStack Query, Recharts |
| Mobile | `apps/mobile` | Expo SDK 58 (React Native), Expo Router |
| Shared | `packages/shared` | Zod schemas, types, money helpers (used by all three) |
| API client | `packages/api-client` | Typed fetch client with automatic token refresh (web + mobile) |

## First-time setup

1. **PostgreSQL.** If PostgreSQL is already installed (any version 14+), put its `postgres` password and port into
   `DATABASE_URL` in `apps/api/.env` and skip to the `createdb` step. Otherwise, in an **admin** PowerShell:
   ```powershell
   winget install --id PostgreSQL.PostgreSQL.16 -e --override "--mode unattended --unattendedmodeui minimal --superpassword postgres --serverport 5433 --disable-components stackbuilder"
   ```
   Then create the database:
   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres -p 5433 myfinances
   ```
2. **Install and migrate:**
   ```sh
   pnpm install
   pnpm db:migrate        # creates tables (first run: name the migration "init")
   ```
   `apps/api/.env` already exists with a generated JWT secret (see `.env.example`).
3. **Run:**
   ```sh
   pnpm dev               # API on :3000 (docs at http://localhost:3000/api/docs) + web on http://localhost:5173
   pnpm dev:mobile        # Expo dev server
   ```

## Tests

```sh
pnpm test:e2e            # API end-to-end tests against a separate "myfinances_test" database
```

## Google sign-in (optional)

Create OAuth client IDs in Google Cloud Console → APIs & Services → Credentials:

- **Web** client: add `http://localhost:5173` to Authorized JavaScript origins.
  Put it in `apps/web/.env` as `VITE_GOOGLE_CLIENT_ID`, and in `apps/mobile/.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
- **Android** client: package `com.myfinances.app` plus your debug keystore SHA-1.
- **iOS** client: bundle ID `com.myfinances.app` → `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

List **all** of these client IDs, comma-separated, in `apps/api/.env` → `GOOGLE_CLIENT_IDS`.
Without them the Google buttons are hidden and password login still works.

Native Google sign-in needs an Expo **development build** (`pnpm --filter @myfinances/mobile android`), not Expo Go.
Password login works in Expo Go.

## Mobile → API

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`:
- Android emulator: `http://10.0.2.2:3000/api`
- Phone on the same Wi-Fi: `http://<your PC's LAN IP>:3000/api` (allow port 3000 through Windows Firewall)

## How auth works

- Passwords are hashed with argon2id. Google ID tokens are verified on the server.
- Access token: a 15-minute JWT, kept in memory.
- Refresh token: random, stored only as a hash, rotated on every use. Reusing an old token revokes the whole session.
  - Web: httpOnly cookie. Mobile: SecureStore.
- If someone signs in with Google using an email that matches an unverified password account, the password is removed. This stops account pre-hijacking.

## Data model (ready for multi-user)

Every user gets a personal **workspace**. Expenses and categories belong to workspaces, and `WorkspaceMember` holds the roles (owner / editor / viewer).
Shared family workspaces, invites, budgets and planning can be added without a schema rewrite.
Money is stored as integer minor units (paise/cents).

## Expense details

Each expense can have:
- date and time
- category and subcategory
- merchant, note, location, description and tags
- an item breakdown: the total is calculated from the items
- attached bills: images or PDFs, up to 10 MB each and 10 per expense

Every expense also records who added and last edited it, from which browser or app, and when.

- **Attachments** are stored on disk in `apps/api/storage/` (`STORAGE_DIR`). The server checks each file's real content type, not its name.
- **Default subcategories** are created for new accounts. For accounts created earlier, run `pnpm --filter @myfinances/api seed:subcategories` once.
- **Managing categories:** use the web app's **Categories** page.
