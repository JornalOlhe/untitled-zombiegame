#!/usr/bin/env bash
# Runs every test given, keeps going after a failure, and reports each failure as a GitHub
# annotation (test name + the tail of its output) so CI failures are readable without logs.
set -u
fail=0
for t in "$@"; do
  log="$(mktemp)"
  start=$(date +%s)
  if node "$t" >"$log" 2>&1; then
    echo "ok   $t ($(( $(date +%s) - start ))s)"
  else
    code=$?
    fail=1
    cat "$log"
    msg="$(grep -vE '^\s+at |^\[2m|^$' "$log" | tail -n 12 | tr '\n' ' ' | tr -s ' ' | cut -c1-900)"
    echo "::error title=$(basename "$t") failed (exit $code)::$msg"
  fi
  rm -f "$log"
done
exit $fail
