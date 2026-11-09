# Deployment decisions

**Status:** Accepted, interim setup  
**Date:** 2026-11-09  
**Scope:** Free-tier hosting for the web app, API, database and attachments until we have our own domain and paid hosting.  
**Setup steps and CI/CD pipeline:** see [setup-guide.md](setup-guide.md).

## Goal

Host all of MyFinances (web, API, PostgreSQL, file attachments) at no cost:

- no services that expire or delete data after a trial period
- no code changes needed again when we later move to our own domain

## Decision

| Part | Service | Plan |
|---|---|---|
| Web frontend (`apps/web`) | **Vercel** | Hobby (free) |
| API (`apps/api`) | **Render** | Free web service |
| Database | **Neon** | Free |
| Attachments | **Cloudflare R2** | Free tier |
| Mobile (`apps/mobile`) | Calls the Render URL directly | — |

```
Browser ──► Vercel (myfinances-gamma.vercel.app)
              ├── /*      → static React build
              └── /api/*  → forwarded to Render ──► Neon (Postgres)
                                                └─► R2 (attachments)

Mobile app ──► Render (https://<service>.onrender.com/api)
```

## Why these services

### Vercel for the frontend
- Free static hosting with automatic deploys from GitHub.
- Supports **rewrites to an external URL**. This lets `/api/*` on the web domain be forwarded to the API, which keeps the refresh cookie working (see [Same-origin `/api`](#same-origin-api-why-the-frontend-forwards-to-the-api) below).
- Caveat: the Hobby plan is for non-commercial use only. That's fine for this interim setup.

### Render for the API
- Free web service, no credit card needed, runs Node or Docker.
- 750 free instance hours a month per workspace. That's enough to keep **one** service running all month (744 hours).
- Specs: 512 MB RAM, 0.1 CPU.
- **Sleeps after 15 minutes without traffic** and takes about a minute to wake up.
- **No persistent disk.** Any local file is lost on redeploy, restart or sleep.

### Neon for PostgreSQL
- The free plan has no time limit:
  - 1 GB storage per project
  - 100 compute-hours per project per month
  - 5 GB data transfer per month
- Scales to zero after 5 minutes idle, then wakes in well under a second.
- If the compute-hours run out, the database is suspended until the next month. No surprise charges.

### Cloudflare R2 for attachments
- Free tier each month:
  - 10 GB of Standard storage
  - 1M write operations and 10M read operations
  - **free downloads (egress)**
- S3-compatible, so it's the planned replacement for the local-disk `StorageService`.
- Note: only Standard storage is free; Infrequent Access is billed from the first GB.

## Alternatives considered and rejected

| Option | Why not |
|---|---|
| Render free Postgres | Deleted 30 days after creation. |
| Supabase free Postgres | Projects pause after about a week without activity. |
| Koyeb | New accounts need a credit card (since Feb 2026); unclear whether a free web service still exists. Its free Postgres allows only 5 compute-hours a month. |
| Railway / Fly.io | Trial credits only; no ongoing free plan. |
| API on its own domain, called directly from the web app | Breaks web login. See below. |
| Storing attachments on the API's disk | Render's disk is wiped on every restart or redeploy. |

## Same-origin `/api`: why the frontend forwards to the API

The web app keeps its refresh token in an httpOnly cookie `mf_rt` (`path: /api/auth`, `sameSite: 'lax'`). See `apps/api/src/auth/auth.controller.ts`.

If the web app (`*.vercel.app`) called the API on its own domain (`*.onrender.com`):

- the browser would treat the cookie as cross-site and not send it on `fetch` requests
- sessions would end when the 15-minute access token expires
- `sameSite: 'none'` doesn't fix it reliably: Safari and other browsers block third-party cookies

Forwarding `/api/*` through Vercel keeps everything on one origin, just like the Vite dev proxy does locally:

- the web app keeps using `baseUrl: '/api'` (the default in `apps/web/src/lib/api.ts`)
- **don't set `VITE_API_URL`** in production
- when we move to our own domain, the same setup carries over unchanged

Mobile isn't affected. It sends `X-Client-Type: mobile` and gets the refresh token in the response body.

## Changes needed before deploying

1. **S3/R2 storage driver.** Add an S3-compatible implementation of `StorageService` (`apps/api/src/storage/`), selected by env vars, e.g.:
   - `STORAGE_DRIVER=s3`
   - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

   Keep the local-disk driver for development and e2e tests.
2. **Trust the proxy.** Requests arrive through Vercel and Render's load balancer. The API should trust `X-Forwarded-For` so the throttler sees real client IPs, not one shared proxy IP.
3. **`apps/web/vercel.json`.**
   - Forward `/api/(.*)` to `https://<service>.onrender.com/api/$1`.
   - Send every other path to `index.html` so React Router's deep links work.
4. **`render.yaml`.** Blueprint for the API: pnpm install, build `packages/shared` and the API, then run `prisma migrate deploy` before starting the server.
5. **Neon connection strings.**
   - The app uses the **pooled** connection string as `DATABASE_URL`.
   - Migrations use the **direct** (non-pooled) connection string.

## Production environment variables

**API (Render)**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (also turns on the `secure` cookie flag) |
| `DATABASE_URL` | Neon pooled connection string |
| `JWT_ACCESS_SECRET` | New random string, at least 32 chars, **not** the local one |
| `WEB_ORIGIN` | `https://<project>.vercel.app` |
| `GOOGLE_CLIENT_IDS` | Web, Android and iOS client IDs |
| `DEFAULT_CURRENCY` | `INR` |
| R2 settings | See change 1 above |

**Web (Vercel)**

| Variable | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Add the Vercel URL to its Authorized JavaScript origins |
| `VITE_API_URL` | Leave unset |

**Mobile (EAS / `.env`)**

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://<service>.onrender.com/api` |

## Known limitations and how we handle them

| Limitation | Mitigation |
|---|---|
| Render cold start (about 1 minute after 15 idle minutes) | Free pinger (e.g. cron-job.org) hits the health endpoint every 10 minutes. This stays within the 750 hours. |
| Neon 1 GB storage cap | Plenty for expense data; attachments live in R2, not Postgres. |
| Render 512 MB RAM | Fine for this API; watch memory if usage grows. |
| Vercel Hobby is non-commercial only | Move to paid hosting or our own server before any commercial use. |
| Free-tier terms change often | Re-check each provider's pricing page before relying on these numbers. |

## When we get our own domain

- Point the domain at the frontend host. `/api` forwarding still works.
- Update `WEB_ORIGIN`, the Google OAuth origins, and the mobile `EXPO_PUBLIC_API_URL`.
- Neon and R2 can stay as they are, or move to paid tiers on the same providers. No data migration needed.
- Replace Render's free tier with an always-on instance (Render paid, a VPS, etc.) to get rid of cold starts.

## Sources

Checked 2026-11-09:

- [Render: Your First Deploy (free services spin down)](https://render.com/docs/your-first-deploy)
- [Is Render Free? Limits, sleep, 30-day DB](https://justinmckelvey.com/blog/is-render-free)
- [Render Free Tier 2026: Limits & Pricing](https://agentdeals.dev/vendor/render)
- [Neon: Free plan limits and quotas](https://neon.com/faqs/free-plan-limits-and-quotas)
- [Koyeb Pro requirement since Feb 2026 (GitHub issue)](https://github.com/robhunter/agentdeals/issues/2218)
- [Koyeb Free Tier 2026](https://www.srvrlss.io/provider/koyeb/)
- [Koyeb: Databases docs](https://www.koyeb.com/docs/databases)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/index.md)
- [State of Free Hosting 2026](https://snapdeploy.dev/state-of-free-hosting)
