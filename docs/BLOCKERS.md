# Open integrations and blockers

Nothing below is faked in the product. Items are listed with the exact prerequisite.

## External configuration required

1. **Railway project (Phase B).**
   Prerequisite for the authoritative Fastify + WebSocket server, Postgres and Redis. The user selected
   Railway. No project/service has been created yet. Need: project name, region, and environment
   variables (`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `CORS_ORIGIN`).
2. **Razorpay production configuration.**
   Test key id/secret exist in the local git-ignored `.env.local`. Live activation needs: plan ids for
   Plus/Pro/Elite, webhook endpoint with secret, verified cancellation/refund/restore flows, and a
   staging test run. Billing remains **off** until then.
3. **Email / password recovery (Phase B).**
   Needs a transactional email provider (e.g. Resend) and a verified sending domain before accounts can
   verify addresses or reset passwords.
4. **Object storage/CDN (Phase B).**
   Needed for production audio/cosmetic packs. Phase C synthesizes audio locally, so no assets are
   required yet.
5. **Analytics provider (optional).**
   The pipeline will be internal and PostgreSQL-first; an external provider is optional and must remain
   behind an interface so gameplay never depends on it.
6. **Native app packaging.**
   Not started. Requires signing certificates, store listings and Apple/Google billing rules for digital
   subscriptions. Web Phase C stays installable via PWA manifest meanwhile.
7. **Custom domain.**
   Not chosen. The Vercel deployment uses a `*.vercel.app` URL for now.

## Product decisions to confirm later

- Final subscription pricing (hypotheses: ₹99 / ₹199 / ₹399 per month).
- Whether Correspondence matches are ranked.
- Survival wave definitions and Chaos modifier set.
- Tournament formats for community events.
- Data retention periods for match/chat/security logs.

## Known Phase C limitations

- Matches are local to one browser; there is no cross-device sync.
- Local clock is client-side; closing the tab mid-match and returning later deducts real elapsed time
  (honest but not server-authoritative).
- Local profile can be edited by anyone with device access — expected until accounts exist.
- Opening the same local match in two tabs is not coordinated. Duplicate-session protection arrives
  with the server.
- Survival/Chaos use core rules while their modifiers are pending; the UI says so.
