# Deployment status and pending actions

**Last updated:** 2026-11-14  
**Related docs:** [deployment-decisions.md](deployment-decisions.md), [setup-guide.md](setup-guide.md)

## Current state

| Piece | Status |
|---|---|
| Database: Neon (`main` and `staging` branches) | ✅ Live |
| Production API: `https://myfinances-api-0km5.onrender.com` | ✅ Live, deployed by Actions after approval |
| Staging API: `https://myfinances-api-staging.onrender.com` | ✅ Live, deployed by Actions after approval |
| Production web: `https://myfinances-gamma.vercel.app` | ✅ Live: public landing page, `/privacy`, app |
| Staging web: `https://myfinances-gamma-staging.vercel.app` | ✅ Live, behind Vercel Authentication |
| Pipelines | ✅ `deploy-production.yml` (`main`), `deploy-staging.yml` (`feature/*`), shared `checks.yml`. Every deploy needs a reviewer's approval. |
| `main` protection | ✅ `protect-main` ruleset: PR + `checks / checks` required, no force push or deletion |
| Attachments | ✅ Cloudflare R2 (`myfinances-attachments-prod` / `-staging`); files survive restarts |
| Google sign-in | ✅ Production, staging and local. Consent screen published. |
| Rate limiting | ✅ Real client IPs: `TRUST_PROXY_HOPS=3` for direct calls; `PROXY_SECRET` for web requests through Vercel |
| Keep-awake | ✅ `keep-awake.yml` pings production `/api/health/live` every 5 minutes, 00:03–18:58 UTC |
| Account deletion | ✅ Self-service on web (`/account`) and mobile (`account` screen) |

## Open

| # | Task | Where | Notes |
|---|---|---|---|
| 9 | **Mobile builds** | EAS, Google Cloud, `apps/mobile` | Set up EAS; set `EXPO_PUBLIC_API_URL` per build (staging or production API). Create an **Android** OAuth client (package `com.myfinances.app` + each signing key's SHA-1) and an **iOS** client (bundle ID `com.myfinances.app`); set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and add the iOS ID to `GOOGLE_CLIENT_IDS` on both Render services. Deferred. |
| 12 | Staging is behind **Vercel Authentication** | Vercel → Settings → Deployment Protection | Fine while only you use staging; turn it off for Preview if others need it. |
| — | End-to-end data check | Neon | Sign up on staging and production and confirm each user appears only in that environment's Neon branch (`staging` / `main`). |

## Ongoing checks

- **Render free hours** (Render → Billing): the 750 hours a month are shared by production and staging. Keep-awake uses about 600; running out suspends **both**, production included.
- **Keep-awake workflow:** GitHub pauses scheduled workflows after 60 days without repo activity. Re-enable under Actions → **Keep API awake**.
- **Secrets to rotate before they expire:** the Vercel token and any GitHub PAT; the R2 API tokens and `PROXY_SECRET` values if they're ever exposed. See setup-guide "Secrets checklist".
- **Test accounts** (credentials kept outside the repo): `stagingtester` on staging and `prodtester1`–`3` on production. Delete them via **Account → Delete account** when they're no longer needed.

## Done

### Dashboard and config
| Task | Notes |
|---|---|
| Production pipeline fixed | See "Resolved issues" below |
| `WEB_ORIGIN` on both Render services | CORS verified |
| `STAGING_WEB_DOMAIN` (GitHub `staging` environment variable) | Staging alias set via the Vercel REST API |
| Required reviewers on `production` and `staging` | One approval releases `api` and `web` together |
| `protect-main` ruleset imported | Required check is `checks / checks` |
| `TRUST_PROXY_HOPS=3` on both Render services | Measured: socket peer, Render LB and Cloudflare |
| `PROXY_SECRET` in Vercel (Preview / Production) and on both Render services | Verified: through Vercel `viaTrustedProxy: true` with the real client IP; forged headers ignored on both paths |
| R2 buckets and tokens; `STORAGE_DRIVER=s3` and `S3_*` on both Render services | Verified: files survive a restart |
| Google Cloud project, consent screen (published), Web client | Client `815704834526-gur0…`; `VITE_GOOGLE_CLIENT_ID` (Vercel Production + Preview), `GOOGLE_CLIENT_IDS` (both Render services) |

### Code
| PR | Change |
|---|---|
| #1, #2 | Initial deployment setup and hardening |
| #3 | Split `deploy.yml` into staging and production workflows (fixed environment names); alias the staging domain via the Vercel REST API |
| #4 | `TRUST_PROXY_HOPS`; GitHub Actions bumped to their latest majors; `protect-main` ruleset file |
| #5 | Attachments in S3-compatible storage (R2); 404 for missing files |
| #6 | Public landing page and privacy policy (Google OAuth requirements) |
| #7 | Keep-awake workflow and `/api/health/live` |
| #8 | Self-service account deletion; Deploy staging `branch-guard`; `pnpm/setup@v3` |
| #9 | Web users rate-limited by real IP: `vercel.json` routes add `x-proxy-secret`; `AppThrottlerGuard` |

## Resolved issues

**Production runs failed with a GitHub "Internal server error" (fixed 2026-11-14).** Runs on `main` failed before the `api (production)` job was created, while staging runs worked. The `production` environment's settings were correct. The fix was replacing the expression-based `environment: ${{ … && 'production' || 'staging' }}` with two workflows that use fixed environment names (PR #3). Until then, the production site's `/api` forwarded to a stale Render URL owned by someone else, so nobody signed up on production before the fix.

**Staging domain alias failed with "User not found".** `vercel alias set` looks up the token's user, which a team-scoped token can't do. The step now calls `POST /v2/deployments/{id}/aliases?teamId=…` directly.
