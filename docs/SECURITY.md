# Security model

## Phase C (current)

Phase C is a local, offline-capable prototype. There is no server, no authentication, no payments and
no telemetry.

- **Trust boundary:** everything runs in the player's browser. The engine is deterministic and pure;
  the UI only requests moves and renders the result. A player modifying `localStorage` can only cheat
  their own local profile — there is no competitive server to deceive.
- **No secrets in the client:** no API keys, payment secrets, database URLs or tokens are bundled. The
  Razorpay test credential in the repo's git-ignored `.env.local` is not referenced by the web build.
- **Injection:** React escapes rendered strings by default. Player names are validated (length and
  allowed characters) and never interpolated into HTML. There is no `dangerouslySetInnerHTML`.
- **Storage:** `localStorage` data is validated on load (config bounds, pawn positions); invalid saved
  matches are discarded instead of being trusted.
- **Audio:** WebAudio is created only after a user gesture; nothing autoplays.
- **Headers:** the Vercel deployment sends CSP (self-only scripts, inline styles allowed), HSTS via
  Vercel, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and a restrictive
  `Permissions-Policy`.
- **Dependencies:** production bundle has no server or payment SDK. `npm audit` reports 0
  vulnerabilities; Vitest was upgraded past the affected versions.

## Phase B/D (required before online launch)

The following are design requirements, not current claims:

1. **Server authority.** The server creates matches, validates every move with `@barricade/engine`,
   owns clocks, prevents duplicate submissions, records canonical events, decides results and rating
   changes. Clients are never trusted for legality, time, outcome or entitlement.
2. **Authentication.** Password hashing with Argon2/bcrypt, secure session cookies (HttpOnly, Secure,
   SameSite), CSRF protection, token rotation, logout-all, account linking with conflict checks,
   enumeration-resistant recovery flows, rate limiting and optional MFA for admins.
3. **Authorisation.** Role-based access control enforced server-side for admin analytics and
   moderation. Hiding navigation is never sufficient. Every sensitive action is audited.
4. **Input validation.** Schema validation at every boundary, parameterised SQL via the ORM, upload
   limits, bounded pagination and date ranges, and request size limits.
5. **Rate limiting & abuse.** Per-account and per-IP limits on auth, reactions, friend requests,
   matchmaking, reports and exports. Message cooldowns are server-enforced; premium tiers never bypass
   moderation limits.
6. **Payment integrity.** Razorpay checkout is untrusted UI. Entitlements change only after
   server-side signature verification and idempotent webhook processing. Raw card data never touches
   the server. Secrets stay server-side. Test mode until staging verification passes.
7. **Transport & headers.** HTTPS/HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`,
   `Permissions-Policy`, strict CORS. WebSocket origin checks and per-connection authentication.
8. **Data protection.** Minimal collection, documented retention, encrypted backups, account export
   and deletion, no precise location or device fingerprinting, and aggregate analytics by default.
9. **Operations.** Structured logs without secrets, error monitoring, alerting, dependency updates,
   secret rotation and a tested restore procedure.
10. **Fairness.** Ranked rulesets are fixed and validated. Purchases affect cosmetics only, never moves,
    barrier stock, clocks, matchmaking or rating.

## Reporting

This is a local prototype without a production endpoint. When deployed, add a security contact and a
responsible-disclosure policy before enabling accounts or payments.
