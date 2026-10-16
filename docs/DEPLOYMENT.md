# Deployment

The app is **one Node process** serving the website, the JSON API and the WebSockets. It needs:
- Node.js **22.5 or newer** (for the built-in `node:sqlite`)
- A **persistent disk** for the SQLite file (`DATABASE_PATH`)
- A host that supports **WebSockets** (or long polling, used as a fallback)

**There are no API keys, passwords or service credentials to configure.** Sessions are random per-room tokens.

> Vercel/Netlify alone won't work, because they don't keep a WebSocket server running. Use a container/VM host such as the ones below. (You *can* put the static client on Vercel and point it at this server with `CLIENT_ORIGIN`, but one service is simpler.)

## Option 0 — Vercel (website) + Render FREE plan (game server)  ← your chosen setup

Live: website `https://unsortedmafia.vercel.app` → game server `https://mafia-night-1c5h.onrender.com`. Both are also built into the code as defaults (`src/client/lib/server.ts`, `src/server/config.ts`), so the steps below still work if an environment variable is missing.

Vercel serves the website. Render runs the live game server (WebSockets, rooms, photos). Both are free.

1. **Push the code** to `https://github.com/sadiqpats/unsorted_mafia` (`git push -u origin main`).
2. **Render** (render.com, sign in with GitHub) → **New → Blueprint** → pick `unsorted_mafia`.
   `render.yaml` creates a **free** Node web service called `mafia-night`. When it asks for `CLIENT_ORIGIN`, leave it empty for now.
   When the deploy finishes, open `https://<your-service>.onrender.com/api/health`. It should show `{"ok":true,...}`.
3. **Vercel** (vercel.com, sign in with GitHub) → **Add New → Project** → import `unsorted_mafia`.
   The build settings come from `vercel.json`. Under **Environment Variables** add
   `VITE_SERVER_URL` = `https://<your-service>.onrender.com` (no trailing slash) → **Deploy**.
4. **Render** → your service → **Environment** → set `CLIENT_ORIGIN` = your Vercel URL, e.g. `https://unsorted-mafia.vercel.app`
   (exact, with `https://`, no trailing slash; add more separated by commas) → **Save** (it redeploys).
5. *(Optional)* **Render** → your service → **Environment** → add `HOST_CODE` = your secret host code → **Save**. While it is **not** set, anyone can host and the Host page shows no code box. Once set, hosting requires it. Never put the code in the repository: it is public.
6. Open the Vercel URL → **Host a Game**.

### What the free plan means for your events
| Free-plan limit | What happens | What the app does about it |
|---|---|---|
| Sleeps after 15 min with no visitors | The first visit takes **30–60 s** to wake it | The site pings the server the moment it opens and shows *“Waking up the game server…”*. **Open the site ~2 minutes before guests arrive.** |
| Sleep during a game | Would drop the game | Every open room pings the server every 4 minutes, so it stays awake while anyone is in a room |
| No permanent disk | Rooms and photos are **wiped whenever the service restarts or redeploys** | Don't redeploy during an event. A refresh or reconnect is fine; only a server restart loses the game |
| 750 free hours/month | Enough to run one service all month | — |

If you later want games to survive restarts, switch the service to **Starter** and add a disk mounted at `/data` with `DATABASE_PATH=/data/mafia.db` (see Option 1).

## Option 1 — Render only, paid Starter with a disk (one service)
Use the `render.yaml` above but change `plan: free` to `plan: starter`, add a disk (`mountPath: /data`, 1 GB) and set `DATABASE_PATH=/data/mafia.db`.
1. Push this repository to GitHub.
2. In Render: **New → Blueprint** → pick the repo. `render.yaml` creates a Docker web service with a 1 GB disk at `/data`.
3. Wait for the health check (`/api/health`) to pass, then open the URL.

## Option 2 — Fly.io
```bash
fly launch --no-deploy            # accept the Dockerfile
fly volumes create mafia_data --size 1
```
Add to `fly.toml`:
```toml
[mounts]
  source = "mafia_data"
  destination = "/data"
[env]
  DATABASE_PATH = "/data/mafia.db"
  TRUST_PROXY = "true"
```
Then run `fly deploy`. Keep **one** machine: `fly scale count 1`.

## Option 3 — Any VPS / Docker
```bash
docker build -t mafia-night .
docker run -d --name mafia -p 80:3001 -v mafia-data:/data --restart unless-stopped mafia-night
```
Put Caddy or Nginx in front for HTTPS. For Nginx, forward the upgrade headers:
```nginx
location / {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
Set `TRUST_PROXY=true` behind a proxy.

## Option 4 — A laptop at the venue (no internet needed)
```bash
npm ci && npm run build
PORT=3001 npm start
```
Phones on the **same Wi-Fi** open `http://<laptop-LAN-IP>:3001` (find the IP with `ipconfig getifaddr en0` on macOS). The QR code uses whatever address the host opened, so open the host page via the LAN IP, not `localhost`.

## Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_PATH` | `./data/mafia.db` | SQLite file (put it on a persistent volume) |
| `ROOM_TTL_HOURS` | `12` | Delete rooms idle this long |
| `TRUST_PROXY` | `false` | Set `true` behind a proxy/load balancer |
| `CLIENT_ORIGIN` | — | Only if the client is hosted on another origin (CORS) |
| `HOST_CODE` | — (optional; unset = anyone can host) | Secret code needed to **host** a game; players never need it. 5 wrong tries lock that address out for 10 minutes |
| `HTTP_RATE_BURST` / `HTTP_RATE_PER_SEC` | `150` / `3` | Per-IP limit for create/join requests |

## Scaling notes
A single instance comfortably handles many simultaneous party rooms. Don't run several instances behind a load balancer without sticky sessions **and** a shared store. Rooms live in one process. See ARCHITECTURE.md → trade-offs.

## Backups
The whole state is one SQLite file. `sqlite3 /data/mafia.db ".backup backup.db"` works while the server is running.
