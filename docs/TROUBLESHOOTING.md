# Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `npm install` fails on `node:sqlite` / `DatabaseSync` errors at start | Node is older than 22.5. Run `node -v` and upgrade to Node 22 LTS. |
| `ExperimentalWarning: SQLite is an experimental feature` | Harmless. `npm start` passes `--no-warnings`. |
| Phones can't open the site from the laptop | Use the laptop's LAN IP (not `localhost`), make sure the phones are on the same Wi-Fi, and allow Node through the macOS/Windows firewall. In dev, Vite listens on all interfaces at port 5173. |
| QR code points to `localhost` | The QR uses the address the host page was opened with. Open the host page via the LAN IP or public URL. |
| “Reconnecting…” banner never clears | The WebSocket is blocked. Behind Nginx, add the `Upgrade`/`Connection` headers (DEPLOYMENT.md). Socket.IO falls back to polling, so check the proxy timeout too. |
| “This device is not part of that room” | The browser's saved session is gone or the seat was moved. Tap **Join again**, or ask the host for a **Rejoin** code. |
| “This room is full” | The host must raise the player count in the lobby. |
| “This game is already in progress” | Joining is closed once a game starts. The host can enable **Allow late joining** for the *next* game (late joiners become Villagers). |
| The night isn't ending | It ends when everyone locks in, or when the timer expires (auto mode). In *manual* mode the host must press **Next phase**. |
| Wrong player eliminated | Host → **Restore** (announced publicly). |
| Rooms disappeared after redeploy | The SQLite file wasn't on a persistent volume. Mount one and set `DATABASE_PATH`. |
| “Too many requests” | Per-IP rate limit. Raise `HTTP_RATE_BURST` / `HTTP_RATE_PER_SEC` for very large venues on one NAT IP. |
| Playwright tests can't find a browser | Run `npx playwright install chromium`. |
| E2E port 4173 in use | Stop the other process, or change `PORT` in `playwright.config.ts`. |
| “Waking up the game server…” for a while | Render free plan cold start (30–60 s). Wait. Open the site a couple of minutes before guests arrive. |
| A game vanished mid-event | On the Render free plan, a restart or redeploy wipes rooms. Don't redeploy during events, or move to Starter with a disk. |
| Website loads but can't create a room (Vercel) | `VITE_SERVER_URL` in Vercel is missing/wrong (redeploy after changing it), or `CLIENT_ORIGIN` in Render doesn't exactly match the Vercel URL. |
| Timeouts / “Something went wrong” on the Vercel site (fixed 2026-10-16) | Cause: the Vercel build had no `VITE_SERVER_URL` and Render had no `CLIENT_ORIGIN`, so the site sent API and socket requests to Vercel itself (405 errors, sockets timing out). The site now falls back to the Render server automatically on `*.vercel.app`, and the server always allows `https://unsortedmafia.vercel.app`. |
| First connection after a quiet period is slow | The free Render server sleeps after 15 minutes and takes 20–60s to wake; the app now waits up to 45s for that first connection. To avoid sleeping entirely, add a free uptime monitor (e.g. UptimeRobot) that requests `https://mafia-night-1c5h.onrender.com/api/health` every 5 minutes. |
| Duplicate / repeated / mismatched announcements (fixed 2026-10-16) | Phase changes were posted as public announcements, the silenced line showed twice, runoffs were announced twice, Dawn notes reappeared at Day, and without a Dawn round the vote result never showed. Each phase now shows exactly the announcements since the previous phase began. |
