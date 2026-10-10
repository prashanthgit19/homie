#!/usr/bin/env bash
# homie — deterministic demo driver for recording the showcase GIF.
#
# Runs one prompt through the same agent at each level and streams the
# responses, so the on-screen contrast between voices is reproducible. Built
# for recording with asciinema + agg, but works fine as a plain terminal run.
#
# Usage:
#   scripts/demo.sh [--host opencode] [--model provider/model]
#                   [--levels "dawg mafa"] [--prompt "..."] [--record out.gif]
#
# Recording (requires `asciinema` and `agg`):
#   scripts/demo.sh --record docs/demo.gif
#   brew install asciinema     # https://asciinema.org
#   cargo install --locked agg # https://github.com/asciinema/agg
#
# The active level is restored to whatever it was before the run.

set -euo pipefail

HOST="opencode"
MODEL=""
LEVELS=(dawg mafa)
PROMPT=""
RECORD=""
SELF="$0"

usage() {
  # Print the leading comment block (skip shebang, stop at first non-comment).
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$SELF"
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --host)   HOST="$2"; shift 2 ;;
    --model)  MODEL="$2"; shift 2 ;;
    --levels) read -r -a LEVELS <<< "$2"; shift 2 ;;
    --prompt) PROMPT="$2"; shift 2 ;;
    --record) RECORD="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "demo: unknown argument: $1" >&2; usage 1 ;;
  esac
done

if [ "${#LEVELS[@]}" -eq 0 ]; then
  echo "demo: --levels must list at least one level" >&2
  exit 1
fi

# A question with an obvious over-engineered answer: good bait for the voices.
if [ -z "$PROMPT" ]; then
  PROMPT="Should I put a Redis cache in front of Postgres to speed this up? Two sentences."
fi

if [ "$HOST" != "opencode" ]; then
  echo "demo: only the opencode host is wired up so far" >&2
  exit 2
fi

FLAG="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/.homie-active"

# ── recording mode: re-exec this script under asciinema, then convert to GIF ──
if [ -n "$RECORD" ] && [ "${HOMIE_DEMO_RECORDING:-0}" != "1" ]; then
  for tool in asciinema agg; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "demo: '$tool' not found — install it to use --record." >&2
      echo "      brew install asciinema && cargo install --locked agg" >&2
      exit 3
    fi
  done
  # Rebuild the invocation without --record so the inner run just prints.
  args=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --record) shift 2 ;;
      *) args+=("$1"); shift ;;
    esac
  done
  cast="$(mktemp -u).cast"
  echo "demo: recording to $RECORD ..." >&2
  HOMIE_DEMO_RECORDING=1 asciinema rec --overwrite --quiet \
    -c "$SELF ${args[*]}" "$cast"
  agg --theme monokai "$cast" "$RECORD"
  rm -f "$cast"
  echo "demo: wrote $RECORD" >&2
  exit 0
fi

# ── restore the level that was active before this run ──
PRIOR="off"
[ -f "$FLAG" ] && PRIOR="$(cat "$FLAG")"
mkdir -p "$(dirname "$FLAG")"
restore() { printf '%s' "$PRIOR" > "$FLAG"; }
trap restore EXIT

# Strip ANSI and opencode's "> host · model" banner; line-buffered so the GIF
# shows the response arriving instead of dumping at once.
clean() { sed -u -e 's/\x1b\[[0-9;]*m//g' -e '/^> /d'; }

rule() { printf '%s\n' "────────────────────────────────────────────────────────────"; }

agent_run() {
  if [ -n "$MODEL" ]; then
    opencode run -m "$MODEL" "$PROMPT"
  else
    opencode run "$PROMPT"
  fi
}

{
  echo
  echo "  homie — same code, different voice"
  echo "  $PROMPT"
  echo
} 

for level in "${LEVELS[@]}"; do
  printf '%s' "$level" > "$FLAG"
  rule
  printf '  homie:%s\n' "$level"
  rule
  agent_run 2>/dev/null | clean
  echo
done

# Give the reader a beat to see the last response before the prompt returns.
sleep 1
