# Pending deployment actions

**Last updated:** 2026-11-14  
**Related docs:** [deployment-decisions.md](deployment-decisions.md), [setup-guide.md](setup-guide.md)

## Current state

| Piece | Status |
|---|---|
| Neon (`main` + `staging` branches) | ✅ Done |
| Render production API `https://myfinances-api-0km5.onrender.com` | ✅ Live, `/api/health` → `{"status":"ok","db":"up"}` (still running the first image, from the dashboard) |
| Render staging API `https://myfinances-api-staging.onrender.com` | ✅ Live, deployed by Actions |
| GitHub environments, secrets, branch-naming ruleset | ✅ Done |
| Vercel project, production domain `https://myfinances-gamma.vercel.app` | ✅ `/api/health` → `{"status":"ok","db":"up"}` (fixed 2026-11-14) |
| Staging pipeline (`feature/*` → staging) | ✅ Working (`feature/deploy-hardening` run 42673271143, attempt 2, green) |
| Production pipeline (`main` → production) | ✅ Fixed by splitting workflows (run 43551221790, after approval) |
| PR #1 (deployment setup), PR #2 (deploy hardening) | ✅ Merged into `main` |

## ✅ Resolved 2026-11-14: production runs failed with a GitHub "Internal server error"

Fixed by replacing `deploy.yml` with `deploy-production.yml` / `deploy-staging.yml`, which use fixed environment names. Run 43551221790 on `main` created the production jobs, they waited for approval, and production `/api/health` is OK. History is kept below for reference.

**Symptoms**
- Every run on `main` fails, e.g. run [42672871231](https://github.com/itsmekathi/myfinances/actions/runs/42672871231) (`837a8a4`) and run 42674135490 (`df883d5`).
- `checks` passes. Then the `api (production)` job is **never created**: the run shows `CI / Deploy: Internal server error. Correlation ID: …`. `web` is then skipped.
- Re-running failed jobs gives the same error.
- Feature-branch runs, which use the `staging` environment, succeed. So the workflow code works, and the problem is specific to the **`production` environment**.

**Impact**
- The production site's `/api` still forwards to `https://myfinances-api.onrender.com`. That's the URL from the first dashboard deploy, and it belongs to **someone else's** suspended Render service.
- **Don't sign up or log in on production until this is fixed**: credentials would go to a third-party server if it were reactivated.

**Progress (2026-11-14)**
- Step 1 checked via the API: the `production` environment has a single `main` branch rule, no reviewers and no wait timer. Its secrets can't be listed without auth, so confirm them in the dashboard.
- Step 3 done on `feature/fix-production-pipeline`, going further: `deploy.yml` is now two workflows, `deploy-production.yml` (`main`, `environment: production`) and `deploy-staging.yml` (other branches, `environment: staging`), plus a reusable `checks.yml`. There are no environment expressions left. Production can only be verified once it's merged into `main`.
- The staging alias step now calls the Vercel REST API: `vercel alias set` failed with "User not found" because the token is limited to the team. Staging run 43550368878 passed end to end.
- Manual approval on both environments: add **Required reviewers** to `production` and `staging` (task 10). `api` and `web` now run in parallel after `checks`, so one approval per run releases both. Note step 1 says to remove reviewers while debugging. If production still fails after the merge, remove them again to rule them out.

**Things to try, in order**
1. **Check the `production` environment settings** (GitHub → Settings → Environments → `production`):
   - Deployment branches and tags: one rule, ref type **Branch**, pattern exactly `main`. Not `refs/heads/main`, no tag rules.
   - Remove **Required reviewers** and **Wait timer** while debugging.
   - Secrets `RENDER_DEPLOY_HOOK` and `API_URL` exist.
2. **Delete and recreate the `production` environment.** The first workflow run auto-created it before it was configured. Then re-add the two secrets and the `main` branch rule, and re-run.
3. **Workflow change:** replace the dynamic `environment: ${{ ... && 'production' || 'staging' }}` with separate jobs that use fixed environment names, e.g. `api-production` (`if: github.ref == 'refs/heads/main'`, `environment: production`) and `api-staging`. Do the same for `web`. This rules out GitHub mishandling the expression.
4. If it still fails, check githubstatus.com, and contact GitHub Support with the correlation IDs.

**Stopgap if production must work before the fix:**
1. In Vercel, run a production deploy of `main` from the dashboard (**Deployments → Redeploy**, or the Vercel CLI). `apps/web/vercel.json` on `main` already has the correct API URL (`myfinances-api-0km5`).
2. In Render, deploy the production service manually (**Manual Deploy**) so it runs the latest image (`latest` tag).

**Unexplained:** run 42671087835 (`feature/deployment-setup`, `7df56c9`) also failed. Check it: it may be the same error or something unrelated.

## Your dashboard tasks

| # | Task | Where | Done |
|---|---|---|---|
| 1 | Fix the production pipeline (blocker above) | GitHub → Environments / Actions | ☑ |
| 2 | `WEB_ORIGIN` = `https://myfinances-gamma.vercel.app` | Render → `myfinances-api` → Environment | ☑ (CORS verified) |
| 3 | `STAGING_WEB_DOMAIN` = e.g. `myfinances-gamma-staging.vercel.app` (no `https://`) | GitHub → Environments → `staging` → **Variables** | ☑ (aliasing works since run 43550368878) |
| 4 | `WEB_ORIGIN` = `https://<STAGING_WEB_DOMAIN>` | Render → `myfinances-api-staging` → Environment | ☑ (CORS verified) |
| 5 | `VITE_GOOGLE_CLIENT_ID` set for Production and Preview (Web client `815704834526-gur0…`) | Google Cloud, Vercel | ☑ Google sign-in verified on production and staging |
| 6 | Keep the production API awake: `keep-awake.yml` pings `/api/health/live` every 5 minutes, 00:03 to 18:58 UTC (setup-guide 7) | GitHub Actions | ☑ live since PR #7; first run green |
| 7 | Google Web client origins (production, staging, localhost); `GOOGLE_CLIENT_IDS` on both Render services; Branding (home page, `/privacy`, authorized domains for both production and staging), then **Publish app** (setup-guide 6) | Google Cloud Console, Render | ☑ |
| 8 | Protect `main`: import `.github/rulesets/protect-main.json` (PR required, `checks / checks` required, no force push or delete). See setup-guide 5.3. | GitHub → Settings → Rules → Rulesets → Import | ☑ active |
| 9 | Mobile `EXPO_PUBLIC_API_URL`: staging or production URL per build | `apps/mobile` env / EAS | ☐ |
| 10 | Manual approval for deploys: **Required reviewers** → add yourself; leave "Prevent self-review" unticked (you're the only reviewer). Do this on **both** environments. | GitHub → Settings → Environments → `production` and `staging` | ☑ (production confirmed; check staging) |
| 12 | Staging is behind **Vercel Authentication** (302 to a Vercel login). Fine if only you test staging; otherwise turn it off for Preview. | Vercel → Settings → Deployment Protection | ☐ |
| 11 | ~~Task 8's required status check is named `checks / checks`~~ (built into the ruleset file) | | ☑ |
| 14 | R2: enable it, create buckets `myfinances-attachments-prod` / `-staging`, one Object Read & Write token per bucket, then set `STORAGE_DRIVER=s3` and the `S3_*` vars on both Render services (setup-guide section 10) | Cloudflare, Render | ☑ |
| 13 | Set **`TRUST_PROXY_HOPS=3`** on both Render services (measured on staging; setup-guide 5.6), then check that `GET /api/health/client-ip` returns your IP as `ip` | Render → Environment | ☑ set on both; verified on staging and production (real IP, forged headers ignored). Through Vercel, `ip` is Vercel's egress IP (expected); Vercel sends the client in `x-vercel-forwarded-for`, but it can only be trusted with a shared secret |

## Code tasks

| # | Task | Notes | Done |
|---|---|---|---|
| A | **Proxy fix for the rate limiter** (merged in PR #4; verified on staging) | Requests pass through Vercel and Render/Cloudflare, so the throttler currently sees proxy IPs and users share one rate-limit bucket. First inspect the real `X-Forwarded-For` chain on production, then set Express `trust proxy` (or a custom throttler tracker) so it can't be bypassed by clients sending fake headers directly to Render. | ☑ |
| B | **R2 storage for attachments** | Done: live on staging and production, verified that files survive a restart. | ☑ |
| C | Update GitHub Actions versions | Done: checkout v7, setup-node v7, setup-buildx v4, login v4, metadata v6, build-push v7; pnpm via `pnpm/setup@v3` (`install: false`). | ☑ |
| D | **Self-service account deletion** | Account page on web (`/account`) and mobile (`account` screen) → `DELETE /api/me`. Deletes sole-member workspaces (expenses, attachments, categories) and stored files; 409 if a workspace is shared. | ☑ |
| E | Deploy staging fails clearly when started on `main` (`branch-guard` job) | | ☑ |
| F | **Exact rate limits for web users** (`feature/trusted-proxy-ip`) | Vercel adds `x-proxy-secret` to `/api` requests; the API trusts Vercel's `X-Forwarded-For` client only when it matches. Needs `PROXY_SECRET` in Vercel (Preview/Production) and on both Render services. Verify on staging before merging. | ☐ |

## Checks after the blocker is fixed

- [x] `https://myfinances-gamma.vercel.app/api/health` returns `{"status":"ok","db":"up"}`
- [ ] Staging: sign up on the staging domain; the user appears only in Neon's `staging` branch
- [ ] Production: sign up on `https://myfinances-gamma.vercel.app`; the user appears in Neon's `main` branch
- [ ] A Render deploy appears in each service's **Events** tab after each pipeline run
