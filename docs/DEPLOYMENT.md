# Deployment

The app is **one Node process** serving the website, the JSON API and the WebSockets. It needs:
- Node.js **22.5 or newer** (for the built-in `node:sqlite`)
- A **persistent disk** for the SQLite file (`DATABASE_PATH`)
- A host that supports **WebSockets** (or long polling, used as a fallback)

**There are no API keys, passwords or service credentials to configure.** Sessions are random per-room tokens.

> Vercel/Netlify alone won't work, because they don't keep a WebSocket server running. Use a container/VM host such as the ones below. (You *can* put the static client on Vercel and point it at this server with `CLIENT_ORIGIN`, but one service is simpler.)

## Option 0 — Vercel (website) + Render (game server)  ← your chosen setup
Vercel serves the website. Render runs the live game server (WebSockets, SQLite, photos).

1. **Render** → New → **Blueprint** → pick `sadiqpats/unsorted_mafia`. `render.yaml` creates the `mafia-night` Docker service with a 1 GB disk.
   When asked for `CLIENT_ORIGIN`, enter your Vercel URL (e.g. `https://unsorted-mafia.vercel.app`; several can be comma-separated, and you can fill it in after step 2).
   Wait until `https://<service>.onrender.com/api/health` shows `{"ok":true}`.
2. **Vercel** → Add New → Project → import `sadiqpats/unsorted_mafia`. `vercel.json` already sets the build (`vite build` → `dist/client`) and SPA routing.
   Under **Environment Variables** add `VITE_SERVER_URL = https://<service>.onrender.com`, then **Deploy**.
3. Back in Render, set `CLIENT_ORIGIN` to the exact Vercel URL (including `https://`, no trailing slash) and redeploy.
4. Open the Vercel URL → Host a Game. QR codes and invite links use the Vercel address.

Notes: Render's free plan sleeps after inactivity and has no persistent disk (rooms and photos are lost on restart). Use **Starter** for real events. The live camera (*Take a selfie*) needs HTTPS, which both Vercel and Render provide.

## Option 1 — Render only (one service)
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
| `HTTP_RATE_BURST` / `HTTP_RATE_PER_SEC` | `150` / `3` | Per-IP limit for create/join requests |

## Scaling notes
A single instance comfortably handles many simultaneous party rooms. Don't run several instances behind a load balancer without sticky sessions **and** a shared store. Rooms live in one process. See ARCHITECTURE.md → trade-offs.

## Backups
The whole state is one SQLite file. `sqlite3 /data/mafia.db ".backup backup.db"` works while the server is running.
