#!/usr/bin/env bash
# Ralph-style build loop for Pi: one fresh Pi session per iteration, until docs/PROGRESS.md says "Status: DONE".
# Usage: ./loop.sh [extra pi flags, e.g. --model <model>]
# Env:   MAX_ITER (default 40), STALL_LIMIT (default 3 iterations without a new commit)
set -uo pipefail
cd "$(dirname "$0")"

MAX_ITER="${MAX_ITER:-40}"
STALL_LIMIT="${STALL_LIMIT:-3}"
PI_ARGS=("$@")
mkdir -p .loop-logs
stall=0

for i in $(seq 1 "$MAX_ITER"); do
  if grep -q '^Status: DONE' docs/PROGRESS.md; then
    echo "Build complete. See docs/PROGRESS.md."; exit 0
  fi
  before=$(git rev-parse HEAD 2>/dev/null || echo none)
  log=".loop-logs/iter-$(printf %03d "$i").log"
  echo "=== Iteration $i/$MAX_ITER  $(date '+%Y-%m-%d %H:%M')  (log: $log)"

  pi -p ${PI_ARGS[@]+"${PI_ARGS[@]}"} "$(cat PROMPT.md)" 2>&1 | tee "$log"

  after=$(git rev-parse HEAD 2>/dev/null || echo none)
  if [ "$before" = "$after" ]; then
    stall=$((stall + 1)); echo "--- No new commit this iteration ($stall/$STALL_LIMIT)"
  else
    stall=0; echo "--- Committed: $(git log -1 --pretty=%s)"
  fi
  if [ "$stall" -ge "$STALL_LIMIT" ]; then
    echo "Stopped: $STALL_LIMIT iterations in a row without a commit."
    echo "Check docs/PROGRESS.md (Blocked / Next) and the latest logs in .loop-logs/, fix the cause, then run ./loop.sh again."
    exit 1
  fi
done
echo "Stopped after MAX_ITER=$MAX_ITER iterations. Run ./loop.sh again to continue."
