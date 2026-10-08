#!/usr/bin/env bash
# homie — tone-delta realism driver.
#
# Runs the same prompts through a live agent at each level (off/yo/dawg/mafa),
# collects the answers, and hands them to scripts/tone-check.js for scoring.
#
# Usage:
#   scripts/tone-run.sh [--model provider/model] [--host opencode] [--out samples.json] [prompt ...]
#
# Requires a logged-in host CLI. Defaults: opencode, the host's default model.
# With no prompts, a built-in set of opinion-eliciting coding questions is used.

set -euo pipefail

MODEL=""
HOST="opencode"
OUT="samples.json"
PROMPTS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    *) PROMPTS+=("$1"); shift ;;
  esac
done

if [ "${#PROMPTS[@]}" -eq 0 ]; then
  PROMPTS=(
    "Should I increase top_k from 5 to 50 for better retrieval? Answer in 3-4 sentences. Do not use any tools."
    "I keep user sessions in one Postgres table with 40 columns. Is that fine? Answer in 3-4 sentences. Do not use any tools."
    "My CI takes 25 minutes, so I'm adding more parallel runners. Good plan? Answer in 3-4 sentences. Do not use any tools."
  )
fi

# Where the host reads the active level. OpenCode keeps it beside its config.
FLAG="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/.homie-active"

if [ "$HOST" != "opencode" ]; then
  echo "tone-run: only the opencode host is wired up so far" >&2
  exit 2
fi

mkdir -p "$(dirname "$FLAG")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Strip ANSI, drop opencode's "> build · model" banner and blank lines.
clean() {
  sed -e 's/\x1b\[[0-9;]*m//g' -e '/^> /d' | sed -e '/^[[:space:]]*$/d'
}

for level in off yo dawg mafa; do
  printf '%s' "$level" > "$FLAG"
  : > "$TMP/$level.txt"
  echo "tone-run: level=$level" >&2
  for p in "${PROMPTS[@]}"; do
    if [ -n "$MODEL" ]; then
      opencode run -m "$MODEL" "$p" 2>/dev/null | clean >> "$TMP/$level.txt"
    else
      opencode run "$p" 2>/dev/null | clean >> "$TMP/$level.txt"
    fi
    printf '\n\n' >> "$TMP/$level.txt"
  done
done

# Restore the flag to off so the run does not leave the user in a voice.
printf 'off' > "$FLAG"

# Assemble samples.json without requiring node to be invoked twice.
node - "$TMP" "$OUT" <<'NODE'
const fs = require('fs');
const path = require('path');
const [tmp, out] = process.argv.slice(2);
const data = {};
for (const level of ['off', 'yo', 'dawg', 'mafa']) {
  const text = fs.readFileSync(path.join(tmp, level + '.txt'), 'utf8');
  data[level] = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
}
fs.writeFileSync(out, JSON.stringify(data, null, 2));
console.log('tone-run: wrote ' + out);
NODE

node "$(dirname "$0")/tone-check.js" "$OUT"
