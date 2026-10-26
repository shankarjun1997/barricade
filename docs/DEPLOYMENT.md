# Deployment

## Current status

| Component | Host | Status |
| --- | --- | --- |
| Web client | Vercel, team `builder-os`, project `barricade` | Live: https://barricade-ruby.vercel.app |
| Game server | Render Free Blueprint (`render.yaml`) | Deploy-ready; user's Render account/API key pending |
| Online production | `VITE_WS_URL` + `VITE_SERVER_NOTICE` on Vercel | Pending server deployment |

The deployed web app currently shows an honest "online server not configured" screen. Local matches,
bots and puzzles work in production. Once the game server is deployed, set `VITE_WS_URL` and redeploy.

## Web client (Vercel)

- Project id `prj_808mfFcHvj6xLJKuGBGG50U2bNfi`
- Production alias `https://barricade-ruby.vercel.app` (project alias
  `https://barricade-builder-os.vercel.app`)
- Git auto-deploy from `shankarjun1997/barricade` `main` is enabled and verified.
- Build: `npm install` → `npm run build -w @barricade/web`, output `apps/web/dist`, Node 22.x.
- SPA rewrite and security headers live in the root `vercel.json`.
- Deployment Protection is disabled so the game is publicly playable.

Manual deploy fallback:

```bash
npm run verify
cd apps/web/dist
vercel deploy --prod --yes --name barricade --scope builder-os
```

## Game server (Render Free — selected)

The repository includes a Render Blueprint (`render.yaml`) and a root `Dockerfile`.

### Option A — Dashboard Blueprint (no API key)

1. Sign in at https://render.com with GitHub.
2. **New +** → **Blueprint** → connect `shankarjun1997/barricade` → apply the detected `render.yaml`.
3. Render creates one Docker web service (`barricade-online`, Singapore, free plan) with the env vars:
   `NODE_ENV`, `DATA_FILE=/tmp/barricade-state.json`, `ALLOWED_ORIGINS`, `RECONNECT_GRACE_MS`, `LOG_LEVEL`.
4. Wait for the deploy and confirm `https://<service>.onrender.com/health` returns `{ ok: true }`.
5. In Vercel → project `barricade` → Environment Variables (Production):

   ```bash
   VITE_WS_URL=wss://<service>.onrender.com/ws
   VITE_SERVER_NOTICE=Demo server on Render Free: it sleeps when idle and ratings may reset after a restart.
   ```

   Redeploy the web project.
6. Open the production site in two browsers, create a room in one and join via the invite link in the
   other; play, resign, rematch, and reload to confirm reconnect.

### Option B — Render API key

Paste a Render API key and the service can be created/configured via
`POST https://api.render.com/v1/services` with `type=web_service`, `env=docker`, `plan=free`,
`region=singapore`, `healthCheckPath=/health`, `dockerfilePath=./Dockerfile`, `dockerContext=.`, and the
env vars above. Then set the Vercel variables and redeploy.

### Render Free caveats (important)

- The free instance **sleeps after inactivity**; the first connection can take 30–60 seconds. The client
  retries automatically and shows a reconnecting state.
- Free services have **no persistent disk**. `DATA_FILE=/tmp/barricade-state.json` is ephemeral: ratings,
  W/L/D and the leaderboard reset whenever the instance sleeps or redeploys; active matches are lost on
  spin-down. Restart recovery works only for processes restarted while the filesystem survives.
- This is a demo deployment. For durable ratings use a paid Render instance + disk (`/data`) or move the
  store to PostgreSQL. Do not advertise competitive rankings as durable on the free tier.
- WebSockets are supported on Render. Do not run more than one instance with the JSON store.

## Game server (Railway alternative)

The repository includes a root `Dockerfile` and `railway.json`.

1. Create a Railway project from `shankarjun1997/barricade`. Railway should detect `railway.json` and
   build the root Dockerfile. The image bundles the engine/protocol workspaces; runtime listens on
   `$PORT` (Docker default 8080).
2. Add a **volume** mounted at `/data`.
3. Set service variables:

   ```bash
   NODE_ENV=production
   DATA_FILE=/data/state.json
   ALLOWED_ORIGINS=https://barricade-ruby.vercel.app,https://barricade-builder-os.vercel.app
   RECONNECT_GRACE_MS=60000
   LOG_LEVEL=info
   ```

   `PORT` is provided by Railway. Do not run more than one replica: the JSON store is single-writer.
4. Generate a public domain. Verify:
   - `GET https://<server>/health` returns `{ ok: true, ... }`
   - `GET https://<server>/api/lobby` returns counts and an empty leaderboard
   - WebSocket upgrade works from the Vercel origin (the origin allow-list is enforced).
5. In Vercel → project `barricade` → Settings → Environment Variables (Production), add:

   ```bash
   VITE_WS_URL=wss://<server-domain>/ws
   ```

   Redeploy the web project (env changes are baked at build time).
6. Verify with two browsers: create a room in one, open the invite link in the other, play moves, resign,
   rematch, and reload one tab to confirm reconnection.

### Railpack/Nixpacks alternative

If Railway builds without Docker, set the build command to `npm run server:build`, start command to
`node apps/server/dist/index.js`, and keep the same environment variables and `/data` volume. The Docker
path is the verified reference.

## Game server (Fly.io alternative)

The Fly CLI is installed on this machine but not authenticated.

```bash
fly launch --no-deploy --name barricade-online --region sin
fly volumes create barricade_data --size 1 --region sin
# mount barricade_data at /data in fly.toml; set the same env vars
fly deploy
```

Use `wss://<app>.fly.dev/ws` as `VITE_WS_URL`.

## Staging

Use a separate Railway service/environment and a Vercel preview build:

- Staging server: separate `DATA_FILE`, `ALLOWED_ORIGINS` including the preview URL.
- Staging web: preview deployment with `VITE_WS_URL` pointing at the staging server.
- Run the online smoke flow against staging before promoting.
- Payments remain disabled and no real Razorpay keys are used.

## Rollback

- **Web:** Vercel → Deployments → select the last known-good deployment → Promote to Production. The
  client is stateless; no data migration is involved.
- **Server:** Railway → Deployments → redeploy the previous image. Before a deploy, copy
  `/data/state.json` (volume snapshot/backup). If the JSON file is corrupt, the server starts with an
  empty store rather than crashing; restore the backup to retain ratings.
- Active matches survive a normal restart; clocks pause during downtime and a fresh reconnect window is
  granted.

## Post-deploy checks

1. Web home and deep links return 200; no console errors; 390 px has no horizontal scrolling.
2. `GET /health` and `/api/lobby` on the server return 200.
3. WebSocket connects from the production origin only (evil origin rejected with close code 1008).
4. Two real browsers complete a room match and a global matchmaking match.
5. Resignation updates both ratings exactly once; rematch swaps colours.
6. Reload during a match reconnects within 60 seconds; expiry produces a forfeit.
7. Restart the server mid-match; both clients reconnect and clocks resume without draining downtime.

No deployment is claimed as complete until these checks pass against the real URL.
