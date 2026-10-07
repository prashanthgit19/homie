#!/bin/bash
# homie — statusline badge. Prints [CHILL], [CHILL:DAWG], [CHILL:MAFA], or
# nothing when off. Reads the shared flag; the statusline runs project-less.

DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
LEVEL=""
if [ -f "$DIR/.homie-active" ]; then
  LEVEL=$(cat "$DIR/.homie-active")
fi

case "$LEVEL" in
  yo) echo "[HOMIE]" ;;
  dawg) echo "[HOMIE:DAWG]" ;;
  mafa) echo "[HOMIE:MAFA]" ;;
  *) ;; # off or missing: no badge
esac