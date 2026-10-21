# Home lights (Philips WiZ)

At Elita home the living-room lights follow the Mafia game. The host turns on
**💡 Playing at Elita home?** (shown when "Together (offline)" is picked), and a small
helper program on a computer at home changes the lights.

| Moment | Lights |
|---|---|
| Lobby | warm white, 80 % |
| Role reveal | dim purple |
| Dawn | sunrise orange |
| Night | dark blue, 12 % |
| Day (discussion) | bright daylight |
| Vote | red |
| Tie to settle | amber |
| Game over | WiZ "Party" for 45 s, then back to how they were |

Big news flashes the lights as it lands: red for a kill or a vote-out, green for a save,
gold for a revival, violet for a silence. When the game ends, the toggle is turned off,
or the helper is stopped (Ctrl+C), every light goes back to exactly how it was.

## Running the helper

WiZ lights only accept commands on the home Wi-Fi, so the game server (in the cloud)
can't reach them; the helper runs on a computer at home and watches the game like the
TV does (public information only — it never learns anyone's role).

```bash
npm run lights
```

The first run asks for the host code (saved in `~/.unsorted-lights.json`, readable only
by you) and finds the lights. It follows the most recently active game that has
"Playing at Elita home" on.

- `npm run lights -- --demo` — shows each scene for a few seconds, then restores the lights.
- `npm run lights -- --setup` — asks for the host code and the lights room again.
- `npm run lights -- --dry-run` — follows the game but only prints what it would do.

## Running it automatically (installed at Elita home)

```bash
npm run lights:install     # starts by itself at login, restarts if it crashes
npm run lights:uninstall   # removes it
```

It runs from `~/.unsorted-lights` and logs to `~/Library/Logs/unsorted-lights.log`. It does
nothing until a game has "Playing at Elita home" on, and checks for games every 20 s while
idle. After changing `scripts/lights.mjs`, run `npm run lights:install` again to update it.
The Mac must be awake and on the home Wi-Fi during the game.

Found at Elita home: 6 colour bulbs in one WiZ room (the living room and entrance) — those
are the ones used. Other rooms and the smart plug are never touched.

## Music and sound on the living-room Echo (Alexa)

When signed in, the helper also plays suspense music through Spotify on **Living room Echo**
(Dawn, Night, Day and the vote each have their own mood), pauses it for the big moments and
plays an Alexa sound effect (a kill, a revival, a silence, the Mafia count, the finale, the
winner). Everything goes over Wi-Fi through the Amazon account — no Bluetooth.

```bash
npm run lights -- --alexa-login   # sign in to Amazon once, in your own browser (localhost:3001)
npm run lights:install            # restart the background helper with it
```

The Amazon session (not the password) is saved in `~/.unsorted-lights.json`, readable only by you.
Spotify must be linked in the Alexa app. The music searches and effects are in `scripts/alexa.mjs`.
