#!/bin/bash
# Installs the lights helper as a background service on this Mac: it starts by itself when
# you log in, restarts if it ever crashes, and does nothing until a game has
# "Playing at Elita home" turned on.
#
#   npm run lights:install     install (or update after changing scripts/lights.mjs)
#   npm run lights:uninstall   remove it
#
# It runs from ~/.unsorted-lights (macOS keeps background programs out of the Desktop folder).
set -euo pipefail

LABEL="com.unsorted.lights"
APP="$HOME/.unsorted-lights"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/unsorted-lights.log"
HERE="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node || true)"
[ -z "$NODE" ] && [ -x "$HOME/.local/node/bin/node" ] && NODE="$HOME/.local/node/bin/node"
[ -z "$NODE" ] && { echo "Node.js not found."; exit 1; }
NPM="$(dirname "$NODE")/npm"

if [ ! -f "$HOME/.unsorted-lights.json" ] || ! grep -q '"hostCode"' "$HOME/.unsorted-lights.json"; then
  echo "Set it up once first (it asks for the host code):  npm run lights"
  exit 1
fi

echo "Copying the helper to $APP…"
mkdir -p "$APP" "$(dirname "$PLIST")" "$(dirname "$LOG")"
cp "$HERE/lights.mjs" "$APP/lights.mjs"
cat > "$APP/package.json" <<'JSON'
{ "name": "unsorted-lights", "private": true, "type": "module", "dependencies": { "socket.io-client": "^4.8.4" } }
JSON
PATH="$(dirname "$NODE"):$PATH" "$NPM" install --prefix "$APP" --omit=dev --no-audit --no-fund --loglevel=error

cat > "$PLIST" <<PLISTXML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$APP/lights.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$APP</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTXML

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
echo "✅ Lights helper installed. It starts by itself whenever you log in."
echo "   What it's doing: tail -f \"$LOG\""
