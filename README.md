# Unsorted
*Plans worth showing up for.*

Party games for people in the same room, played on their own phones. The front page (`/`) lets you pick a game:

- **Mafia Night** (`/mafia`): secret roles, Dawn → Night → Day, a TV photo wall. Details below.
- **Bollywood Dumb Charades** (`/charades`): two teams, two captains' phones, 972 famous Hindi films, a TV scoreboard. See [docs/CHARADES.md](docs/CHARADES.md).

## Mafia Night

A real-time, multiplayer Mafia party game played on everyone's own phone. The server deals secret roles, runs the night and day phases, resolves every ability, counts the (weighted) votes and decides who wins. Nobody has to sit out as narrator.

- **5–26 players**, any number, with balanced role suggestions and a full role editor
- **9 characters:** Mafia, Godfather, Detective, Doctor, Judge, Villager (+ optional powers), Thief, Imposter, Joker, all built on a data-driven engine you can extend
- **Built for players sitting together:** everyone acts every night, identical privacy shields, hold-to-reveal cards, secrets never sent to other phones (see [docs/GUIDE.md](docs/GUIDE.md#7-how-the-app-stops-people-sitting-together-from-cheating))
- **Player photos** (selfie or gallery) on a **TV photo wall**. Eliminated players' photos get cut in two.
- **Dawn → Night → Day**, with **no timers by default**: each phase ends when everyone has acted
- **Dawn** round: the Thief steals a power for the round, the Imposter revives the dead, and everyone else taps an identical dummy button
- **Host code**: only people with the code can host; anyone can join
- **Host / Game Master dashboard** and a **TV display** mode
- Survives refreshes, flaky Wi-Fi and server restarts

## Quick start (local)

Requirements: **Node.js 22.5+** (Node 22 LTS recommended).

```bash
npm install
npm run dev
```

- Website: http://localhost:5173. Phones on the same Wi-Fi use `http://<your-computer-IP>:5173`.
- Game server: http://localhost:3001 (Vite proxies `/api` and `/socket.io` to it)

Production-style run (one process serves everything on port 3001):

```bash
npm run build
npm start
```

**No backend setup and no credentials are needed.** The SQLite database is created automatically at `./data/mafia.db`. Optional settings are in [.env.example](.env.example).

## How to run a game

Read **[docs/GUIDE.md](docs/GUIDE.md)** (also in the app at `/guide`). Short version:
1. **Host a Game** → name + player count → share the QR / room code.
2. Players **Join**, enter a name, tap **I'm ready**.
3. Adjust characters and house rules → **Start the game**.
4. Everyone privately holds their card to see their role. The game runs itself from there.

## Tests

```bash
npm test                      # unit + integration (Vitest)
npx playwright install chromium
npm run test:e2e              # multi-browser end-to-end (Playwright)
npm run typecheck
```

Results and coverage: [docs/TESTING.md](docs/TESTING.md).

## Documentation

| Doc | What's in it |
|---|---|
| [docs/GUIDE.md](docs/GUIDE.md) | Host & player guide, table rules, anti-cheat, quick fixes |
| [docs/RULES.md](docs/RULES.md) | State machine, night resolution order, every role's defaults & options, voting, victory, edge cases |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack & trade-offs vs Supabase, data model, access control, privacy boundary, realtime |
| [docs/ADDING_ROLES.md](docs/ADDING_ROLES.md) | How to add new characters, abilities and house rules |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | **Vercel + Render**, Render only, Fly.io, Docker/VPS, laptop-at-the-venue; env vars |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common problems |
| [docs/TESTING.md](docs/TESTING.md) | What is tested, results, known limitations |
| [docs/samples/party-of-10.json](docs/samples/party-of-10.json) | Sample configuration for a playable game |
