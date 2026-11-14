# Deployment setup guide

One-time setup for the free-tier hosting and the GitHub Actions deployment pipeline.

- For why these services were chosen, see [deployment-decisions.md](deployment-decisions.md).
- Do the steps **in order**: later steps need values from earlier ones. For example, Render needs the Neon connection strings.

## How the pipeline works

| Event | Checks | Frontend (Vercel) | Backend (Render) | Database (Neon) |
|---|---|---|---|---|
| Push to `feature/<name>` | branch name, typecheck, build, e2e | **Preview** deploy, unique URL per branch | **Staging** API service | `staging` branch |
| Push or merge to `main` | same | **Production** deploy | **Production** API service | `main` branch |

There are two workflows: `.github/workflows/deploy-staging.yml` (every branch except `main`) and `.github/workflows/deploy-production.yml` (`main`). Each runs three jobs: `checks`, then `api` and `web` in parallel:

1. **`checks`** (the reusable `.github/workflows/checks.yml`, shown as `checks / checks`)
   - Checks the branch name.
   - Runs `pnpm typecheck`, `pnpm build` and `pnpm test:e2e`.
   - The tests use a throwaway Postgres 16 service container.
2. **`api`** (runs only if `checks` passed)
   - Builds a Docker image of the API, tagged with the commit SHA.
   - Pushes it to GitHub Container Registry (GHCR).
   - Production also tags it `latest`.
   - Calls the Render deploy hook for that workflow's environment with the image.
   - If the GitHub environment has required reviewers, the job waits here for approval.
   - The container runs `prisma migrate deploy` on start.
3. **`web`** (runs alongside `api` after `checks`, so one approval releases both)
   - Points the `/api` forwarding in `vercel.json` at the matching API (staging or production).
   - Runs `vercel build` and `vercel deploy --prebuilt`, adding `--prod` in the production workflow.

On staging, a newer push to the same branch cancels the older run. Production runs queue instead, so a deploy is never cancelled halfway.

### Repo files the pipeline needs

- [x] `apps/api/Dockerfile` and `.dockerignore` (repo root)
- [x] `apps/api/prisma.config.ts` reads `DIRECT_DATABASE_URL` for migrations
- [x] `apps/web/vercel.json` (build settings, `/api` forwarding, SPA fallback, `"git": { "deploymentEnabled": false }`)
- [x] `.vercel/` added to `.gitignore`
- [x] `.github/workflows/checks.yml`, `deploy-staging.yml`, `deploy-production.yml`
- [x] S3/R2 storage driver for attachments (`STORAGE_DRIVER=s3`, see section 10)

---

## 1. Neon (database)

1. Sign up at **neon.com** with GitHub. No credit card needed.
2. **Create a project:**
   - Name: `myfinances`
   - Postgres version: **16**, to match local development
   - Region: **AWS Asia Pacific (Singapore)**, or whichever is closest to your users. Use the **same region for Render** (step 3): API-to-database latency matters a lot.
3. Neon creates a `main` branch with a `neondb` database. Optionally rename the database to `myfinances` under **Databases**.
4. **Create the staging branch:**
   - Go to **Branches → New branch**.
   - Name it `staging`, parent `main`, include data from "current point in time".
5. **Collect four connection strings.** On the project dashboard, open **Connect**. For each of the `main` and `staging` branches, copy:

   | Copy | How | Used as |
   |---|---|---|
   | **Pooled** | Connection pooling **on** (host contains `-pooler`) | `DATABASE_URL`, used by the app |
   | **Direct** | Connection pooling **off** | `DIRECT_DATABASE_URL`, used by migrations |

   Store all four in a password manager. They contain the database password.

> **Why two URLs:** Prisma migrations need a direct connection. The running app should go through the pooler.

**Resetting staging:** feature branches share the staging database. If migrations from different branches conflict, go to **Branches → `staging` → Reset from parent**. This makes staging a fresh copy of `main`.

---

## 2. Push the first API image to GHCR

Render can only create an image-based service from an image that already exists, so this comes before Render.

1. Merge the pipeline files listed above and push to `main`.
2. The workflow builds and pushes `ghcr.io/itsmekathi/myfinances-api:<sha>` and `:latest`.
   - The Render and Vercel deploy steps are **skipped with a warning** until their secrets exist, so this first run is still green.
3. On GitHub, go to your profile → **Packages** → `myfinances-api`:
   - Check that it's **linked to the `myfinances` repo**. The Dockerfile label `org.opencontainers.image.source` does this.
   - **Public repo:** set the package to **Public** (Package settings → Change visibility). The image holds only compiled code; secrets are Render env vars. Render can then pull it without credentials.
   - **Private repo:** keep the package private and do step 3.2.

---

## 3. Render (API, production and staging)

### 3.1 Account

1. Sign up at **render.com** with GitHub. The free plan needs no card.

### 3.2 Registry credential (private image only)

1. On GitHub, go to **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**.
   - Scope: **`read:packages`** only.
   - Set an expiry and a reminder to rotate it.
2. In Render, go to **Workspace Settings → Registry Credentials → Add**:
   - Registry: **GitHub**
   - Username: `itsmekathi`
   - Token: the token from step 1

### 3.3 Production service

1. Click **New → Web Service → Existing Image**.
2. Image URL: `ghcr.io/itsmekathi/myfinances-api:latest`. Pick the credential from 3.2 if the image is private.
3. Settings:

   | Field | Value |
   |---|---|
   | Name | `myfinances-api`, giving the URL `https://myfinances-api.onrender.com`. If the name is taken, Render adds a suffix; note the real URL. |
   | Region | **Singapore** (same as Neon) |
   | Instance type | **Free** |
   | Health check path (Advanced) | `/api/health` |

4. **Environment variables:**

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Neon **main** pooled string |
   | `DIRECT_DATABASE_URL` | Neon **main** direct string |
   | `JWT_ACCESS_SECRET` | New secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `WEB_ORIGIN` | `https://myfinances-gamma.vercel.app` |
   | `GOOGLE_CLIENT_IDS` | Web, Android and iOS client IDs, comma-separated |
   | `DEFAULT_CURRENCY` | `INR` |
   | R2 variables | Added once the R2 storage driver exists |

   Don't set `PORT`. Render provides it and the env schema reads it.

5. Click **Create**. The first deploy should go green, and `https://<service>.onrender.com/api/health` should respond.
6. **Turn off auto-deploy:** Settings → **Auto-Deploy → No**. GitHub Actions decides when to deploy.
7. **Copy the deploy hook:** Settings → **Deploy Hook**. Treat it like a password: anyone with it can trigger deploys.

### 3.4 Staging service

Repeat 3.3 with these differences:

| Field | Value |
|---|---|
| Name | `myfinances-api-staging` |
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | Neon **staging** strings |
| `JWT_ACCESS_SECRET` | A **different** new secret, so staging tokens never work in production |
| `WEB_ORIGIN` | `https://<STAGING_WEB_DOMAIN>` (the fixed staging domain, see 5.1). Previews call the API through Vercel's `/api` forwarding, so the browser makes no cross-origin requests and this value barely matters. |

Copy its deploy hook separately.

---

## 4. Vercel (frontend)

### 4.1 Project

1. Sign up at **vercel.com** with GitHub (Hobby plan).
2. Click **Add New → Project → Import** the `myfinances` repo.
3. Settings:

   | Field | Value |
   |---|---|
   | Project name | `myfinances`, giving the URL `myfinances.vercel.app`. If taken, note what you get. |
   | Framework preset | **Vite** |
   | Root Directory | **`apps/web`** |
   | Build, install, output settings | Leave the defaults. `apps/web/vercel.json` sets them and overrides the dashboard: a filtered pnpm install, `turbo run build --filter=@myfinances/web...` (so `shared` and `api-client` build first), output `dist`. |

4. **Environment variables:**
   - Add `VITE_GOOGLE_CLIENT_ID` for both **Production** and **Preview**.
   - **Don't** add `VITE_API_URL`. The web app must call `/api` on its own domain.
5. Click **Deploy** once to create the project. API calls won't work until `vercel.json` exists.

### 4.2 Turn off Vercel's own Git deploys

`apps/web/vercel.json` contains `"git": { "deploymentEnabled": false }`, so pushes only deploy through Actions, not twice. Keep the Git connection: Vercel uses it to show deployment status on commits and PRs.

### 4.3 Get the IDs and token for Actions

1. **Token:** Account Settings → **Tokens → Create**. Name it `github-actions`, scope your personal account, and set an expiry.
2. **Org and project IDs:**

   ```sh
   npx vercel login
   cd apps/web && npx vercel link     # pick the myfinances project
   cat .vercel/project.json           # {"orgId": "...", "projectId": "..."}
   ```

   `.vercel/` is local only and git-ignored.

### 4.4 Preview protection (recommended)

By default, Vercel protects preview URLs with **Vercel Authentication**: only you, logged in to Vercel, can open them. Keep it on. Previews talk to the staging API, and this keeps strangers out.

---

## 5. GitHub repository settings

### 5.1 Environments (`Settings → Environments`)

Create `production` and `staging`. Each gets the same secret names with different values:

| Secret | `production` | `staging` |
|---|---|---|
| `RENDER_DEPLOY_HOOK` | Production deploy hook URL | Staging deploy hook URL |
| `API_URL` | `https://myfinances-api-0km5.onrender.com` | `https://myfinances-api-staging.onrender.com` |

For `staging`, also add an **environment variable** (not a secret; under **Environment variables** on the same page):

| Variable | Value |
|---|---|
| `STAGING_WEB_DOMAIN` | A free `*.vercel.app` name, e.g. `myfinances-gamma-staging.vercel.app` |

After each feature-branch preview deploy, the workflow points this domain at the new preview. Staging then has one fixed web URL:
- use it as the staging API's `WEB_ORIGIN`
- add it as a Google OAuth origin

If the name is already taken on Vercel, the step fails; pick another name. Leave the variable unset to skip this step.

For `production`:
- **Deployment branches:** choose **Selected branches → `main`**. A feature branch then can't deploy to production, even if the workflow is edited by mistake.
- **Required reviewers:** add yourself (on `staging` too). Every deploy then waits for your approval; one approval releases both the `api` and `web` jobs.

### 5.2 Repository secrets (`Settings → Secrets and variables → Actions`)

Shared by both environments:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

GHCR needs no secret: the workflow uses the built-in `GITHUB_TOKEN` with `packages: write` permission.

### 5.3 Protect `main`

Defined in `.github/rulesets/protect-main.json`. Import it once:

1. Go to **Settings → Rules → Rulesets → New ruleset → Import a ruleset** and choose `.github/rulesets/protect-main.json`.
2. Check that it shows:
   - **Enforcement status:** Active
   - **Target:** default branch (`main`)
   - **Rules:** restrict deletions, block force pushes, require a pull request (0 approvals, since you can't approve your own PR), require status check **`checks / checks`** (GitHub Actions)
   - **Bypass list:** empty
3. Click **Create**.

Changes then reach `main` only through a PR whose feature-branch run passed `checks`. A direct `git push origin main` is rejected.

If you ever need an emergency bypass, add **Repository admin** to the bypass list with mode **For pull requests only**. Admins can then merge a PR with failing checks, but still can't push to `main` directly.

### 5.4 Enforce branch naming

Branches must be `main` or `feature/<name-or-issue-number>`:

- lowercase letters, digits and hyphens only
- for example `feature/42`, `feature/add-budgets` or `feature/42-add-budgets`

This is enforced twice:

| Layer | What it does |
|---|---|
| **GitHub ruleset** (blocks the push) | Rejects pushing a new branch that isn't `main` or `feature/*`. Defined in `.github/rulesets/branch-naming.json`. |
| **Workflow check** (fails the run) | The first step of `checks` validates the full format (e.g. rejects `feature/Add_Thing`) and fails with a rename hint. |

Import the ruleset once:

1. In the repo, go to **Settings → Rules → Rulesets**.
2. Click **New ruleset → Import a ruleset** and choose `.github/rulesets/branch-naming.json` from your local checkout.
3. Check that it shows:
   - **Enforcement status:** Active
   - **Target:** all branches, excluding `main` and `feature/*`
   - **Rule:** Restrict creations
4. Click **Create**.

To test it, run `git push origin HEAD:test-branch`. GitHub should reject it with a ruleset violation.

To fix a misnamed local branch:

```sh
git branch -m feature/<name>
git push -u origin feature/<name>
```

The `staging` environment can stay at **No restriction**: only `feature/*` branches can exist and pass checks.

### 5.5 Actions usage

- Public repos: unlimited free minutes.
- Private repos: 2,000 free minutes a month. A run takes a few minutes, so that's plenty for this project.

### 5.6 Rate limiting behind proxies (`TRUST_PROXY_HOPS`)

The API rate-limits by client IP (`req.ip`). On Render, every request passes through proxies, and web requests also pass through Vercel's `/api` forwarding. Without configuration, every user looks like the proxy and shares one rate-limit bucket.

`TRUST_PROXY_HOPS` (Render env var, default `0`) is the number of proxies that append to `X-Forwarded-For`. Express then reads the client IP that many entries from the right, and ignores anything further left, which a client could forge. To choose the value:

1. Call `GET /api/health/client-ip` **directly** on the Render URL (the path the mobile app uses), e.g. `curl https://myfinances-api-0km5.onrender.com/api/health/client-ip`. Then call it **through Vercel**: `https://myfinances-gamma.vercel.app/api/health/client-ip`.
2. Compare `forwardedFor` with your real public IP. Set `TRUST_PROXY_HOPS` to the number of entries to the **right** of your IP on the direct call, **plus one** for the socket peer (`socket`). On Render this is **`3`** (measured 2026-11-14): `forwardedFor` is `<you>, <Cloudflare>, <Render LB>` and `socket` is `127.0.0.1`, a proxy inside the container.
3. Redeploy, call the endpoint again, and check that `ip` is your real IP on direct calls.
4. Test spoofing: `curl -H "X-Forwarded-For: 1.2.3.4" <url>` must **not** return `"ip": "1.2.3.4"`.

Web requests add one more hop (Vercel), so with the direct-call value they're tracked by Vercel's egress IP. That's still a per-region bucket rather than one global bucket, but it's coarser. Trusting one more hop to fix that would let direct callers forge their IP. Telling the two paths apart reliably needs Vercel to add a secret header, which is a possible follow-up.

---

## 6. Google OAuth

One Google Cloud project with one **Web** OAuth client serves local dev, staging and production.

1. **Project:** console.cloud.google.com → project picker → **New project** → `MyFinances` (no organization). Billing isn't needed.
2. **Google Auth Platform → Get started:** app name `MyFinances`, your support email, audience **External**, contact email.
3. **Branding:**
   - Application home page: `https://myfinances-gamma.vercel.app`. Signed-out visitors see the public landing page (`HomePage.tsx`).
   - Privacy policy: `https://myfinances-gamma.vercel.app/privacy` (`PrivacyPage.tsx`).
   - Authorized domains: `myfinances-gamma.vercel.app` **and** `myfinances-gamma-staging.vercel.app`. Every JavaScript origin's domain must be listed. Each `*.vercel.app` site is its own domain, because `vercel.app` is a public suffix and can't be added itself. `localhost` is exempt.
   - **No logo:** a logo triggers Google's verification review.
4. **Data access:** add nothing. The default `openid`, `email` and `profile` scopes are enough and need no review.
5. **Clients → Create client → Web application** (`MyFinances Web`):
   - Authorized JavaScript origins: `https://myfinances-gamma.vercel.app`, `https://myfinances-gamma-staging.vercel.app` and `http://localhost:5173`.
   - No redirect URIs.
   - Copy the client ID. The client secret isn't used.
6. **Audience:** **Publish app** once the home page and privacy page are live. While the app is in **Testing**, only listed **Test users** can sign in.
7. **Put the client ID in:**
   - Vercel `VITE_GOOGLE_CLIENT_ID` (Production and Preview, not Sensitive)
   - `GOOGLE_CLIENT_IDS` on both Render services
   - local `apps/web/.env`, `apps/api/.env`, and `apps/mobile/.env` (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`)
8. **Rebuild:** run **Deploy production** (and **Deploy staging** on a `feature/*` branch) from the Actions tab. Vite bakes `VITE_*` values into the build.

Mobile, later:
- **Android client:** package `com.myfinances.app` plus each signing key's SHA-1.
- **iOS client:** bundle ID `com.myfinances.app`. Set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and add it to `GOOGLE_CLIENT_IDS`.

---

## 7. Keep the production API awake

Render's free services sleep after 15 minutes without traffic and take about a minute to wake up.

`.github/workflows/keep-awake.yml` pings `https://myfinances-api-0km5.onrender.com/api/health/live` every 5 minutes from **00:03 to 18:58 UTC** (about 05:33 to 00:28 IST). It needs no setup: it runs from `main` once merged.

- **Why not 24/7:** Render's 750 free hours a month are shared by production and staging. Running out suspends **all** free services, production included, until the next month. The window uses about 597 hours, leaving about 150 for staging. Overnight, the first visit takes about a minute.
- **Why `/api/health/live`:** unlike `/api/health`, it doesn't query the database, so Neon's compute can still suspend when idle.
- **Why every 5 minutes:** GitHub can delay scheduled runs, and Render sleeps after 15.
- **To change the window:** edit the `cron` line (UTC). Keep the total under about 600 hours a month.
- **Don't ping staging.**
- **GitHub pauses scheduled workflows after 60 days with no repo activity.** Re-enable it under Actions → **Keep API awake**.
- **Test it:** Actions → **Keep API awake** → **Run workflow** (`main`).

---

## 8. Mobile app

Set `EXPO_PUBLIC_API_URL` per build profile:

| Build | Value |
|---|---|
| Development / internal | `https://myfinances-api-staging.onrender.com/api` |
| Production | `https://myfinances-api-0km5.onrender.com/api` |

Mobile gets its refresh token in the response body, so it calls Render directly. It doesn't need the Vercel `/api` forwarding.

---

## 9. First end-to-end test

1. Push a small change to a feature branch.
2. In the **Actions** tab, check that `checks` → `api` (staging) → `web` (preview) all pass.
3. Open the preview URL from the job summary and sign up. The account is stored in the Neon `staging` branch.
4. Merge to `main`. Check the production run, then open `https://myfinances-gamma.vercel.app`.
5. If something fails, look here:

   | Where | What you'll find |
   |---|---|
   | **Render → service → Logs** | Migration and env-validation errors show up here first. A `[deploy check]` line means `DIRECT_DATABASE_URL` is missing, invalid, or points at the pooler (`apps/api/scripts/check-deploy-env.js`). |
   | **Vercel → Deployments** | Frontend build output |
   | **Neon → Monitoring** | Database connections and compute usage |
   | **GitHub → Actions** | Which job failed and why |

---

## 10. Attachment storage (Cloudflare R2)

Render's free-tier disk is wiped on every deploy, restart and wake-up, so attachments must live in a bucket. The API's `s3` storage driver works with Cloudflare R2 (free tier: about 10 GB, no egress fees) or any S3-compatible store. Downloads still stream through the API with auth, so the buckets stay private and clients need no changes.

### 10.1 Cloudflare

1. Sign up or log in at https://dash.cloudflare.com, open **R2 Object Storage** and enable it. A card is required; you're only charged above the free tier.
2. **Create bucket** twice: `myfinances-attachments-prod` and `myfinances-attachments-staging`. Location **Automatic**, storage class **Standard**. Don't enable public access or the `r2.dev` URL.
3. **Manage R2 API Tokens → Create API token**, once per bucket:
   - Permissions **Object Read & Write**, **Apply to specific buckets only** (that environment's bucket), TTL **Forever**.
   - Copy the **Access Key ID** and **Secret Access Key**; the secret is shown only once.
   - Note the S3 endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

### 10.2 Render (each service)

| Variable | `myfinances-api` | `myfinances-api-staging` |
|---|---|---|
| `STORAGE_DRIVER` | `s3` | `s3` |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | same |
| `S3_REGION` | `auto` | `auto` |
| `S3_BUCKET` | `myfinances-attachments-prod` | `myfinances-attachments-staging` |
| `S3_ACCESS_KEY_ID` | prod token's key ID | staging token's key ID |
| `S3_SECRET_ACCESS_KEY` | prod token's secret | staging token's secret |

With `STORAGE_DRIVER=s3`, the API refuses to start if any of endpoint, bucket or keys is missing, and the Render deploy fails visibly instead of the first upload failing. Changing env vars needs a redeploy (approve a pipeline run).

### 10.3 Check it

1. Upload a photo to an expense.
2. In Cloudflare, the bucket shows a new object named with a UUID.
3. Redeploy, and check that the photo still loads.

Attachments uploaded before the switch were on the old disk and are gone. Opening one returns 404 "Attachment file is missing".

---

## Secrets checklist

| Secret | Where it lives |
|---|---|
| Neon connection strings (×4) | Render env vars (`DATABASE_URL`, `DIRECT_DATABASE_URL` on each service) |
| `JWT_ACCESS_SECRET` (×2, different) | Render env vars |
| Render deploy hooks (×2) | GitHub environment secrets `RENDER_DEPLOY_HOOK` |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub repository secrets |
| GitHub PAT `read:packages` (private image only) | Render registry credential |
| Google client IDs | Render `GOOGLE_CLIENT_IDS`, Vercel `VITE_GOOGLE_CLIENT_ID`, mobile `.env` |
| R2 API tokens (×2, one per bucket) | Render `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |

Never commit any of these. Rotate the Vercel token and the GitHub PAT before they expire.
