# Deployment

## Current (Phase C) — static web client on Vercel

The client is a static SPA. Production hosting is Vercel, team `builder-os`.

- Project: `barricade` (`prj_808mfFcHvj6xLJKuGBGG50U2bNfi`)
- Production URL: https://barricade-ruby.vercel.app
- Project alias: https://barricade-builder-os.vercel.app
- Build: Vite from the monorepo root (`npm run build -w @barricade/web` → `apps/web/dist`)
- GitHub: `shankarjun1997/barricade` (`main`), auto-deploy enabled
- Vercel Authentication (SSO protection) disabled so the game is publicly playable.

```bash
npm install
npm run verify        # typecheck + tests + build
npm run build         # outputs apps/web/dist
```

Automatic: pushing to `main` triggers a Vercel build from the repository.

Manual fallback (verified working):

```bash
cd apps/web/dist
vercel deploy --prod --yes --name barricade --scope builder-os
```

The `vercel.json` inside the deployed folder rewrites all routes to `index.html` so deep links such as
`/match` and `/settings` work. A root `vercel.json` is also present so the same project can later build
from the monorepo root (`buildCommand: npm run build -w @barricade/web`,
`outputDirectory: apps/web/dist`).

### Rollback

Vercel keeps immutable deployments. In the dashboard, open the project → Deployments → select the last
known-good deployment → **Promote to Production**. Alternatively redeploy a previous git commit with the
CLI. No database state is involved in Phase C, so rollback is stateless.

### Post-deploy checks (verified for Phase C)

1. `https://barricade-ruby.vercel.app/` returns 200.
2. Deep links (`/match`, `/result`, `/settings`) return the app shell (SPA rewrite).
3. Home → Quick match → move → barrier → undo → resign → result works in real Chrome.
4. No console errors; no horizontal scrolling at 390 px.
5. Security headers present (`CSP`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
6. Git-triggered production builds reach READY (verified on commits `12a0a9c`, `d9b4fa9`).

## Future (Phase B) — frontend + real-time backend

WebSockets cannot run on Vercel serverless. The planned split:

| Component | Host |
| --- | --- |
| Web client (`apps/web`) | Vercel, team builder-os |
| Game server (`apps/server`, Fastify + WS) | Railway (persistent container) |
| PostgreSQL | Railway Postgres (Prisma migrations) |
| Redis (matchmaking, rate limits, presence) | Railway Redis |
| Audio/cosmetic assets | Object storage + CDN (later) |

Staging should be a separate Railway environment and a separate Vercel preview project, using test
payment credentials only. Production payments stay disabled until webhook verification, cancellation,
refund and entitlement restoration are verified end-to-end on staging.

### Migration procedure (planned)

1. Run `prisma migrate deploy` against staging.
2. Run integration tests (match, clock, reconnect, billing webhooks).
3. Snapshot production database.
4. Apply migrations to production during a maintenance window.
5. Smoke test, then promote the frontend.

Do not run destructive database operations against production. No deployment is claimed before it
actually succeeds and is verified.
