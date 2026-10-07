#!/bin/bash
# chill — statusline badge. Prints [CHILL], [CHILL:DAWG], [CHILL:MAFA], or
# nothing when off. Reads the shared flag; the statusline runs project-less.

DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
LEVEL=""
if [ -f "$DIR/.chill-active" ]; then
  LEVEL=$(cat "$DIR/.chill-active")
fi

case "$LEVEL" in
  yo) echo "[CHILL]" ;;
  dawg) echo "[CHILL:DAWG]" ;;
  mafa) echo "[CHILL:MAFA]" ;;
  *) ;; # off or missing: no badge
esac