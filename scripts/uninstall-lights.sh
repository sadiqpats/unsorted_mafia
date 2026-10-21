#!/bin/bash
# Removes the background lights helper (the lights go back to how they were as it stops).
LABEL="com.unsorted.lights"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
rm -rf "$HOME/.unsorted-lights"
echo "✅ Lights helper removed. (Your saved host code stays in ~/.unsorted-lights.json — delete that file too if you like.)"
