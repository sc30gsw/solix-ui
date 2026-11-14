#!/usr/bin/env bash
set -uo pipefail

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
state="$root/.verify-playground"

if [ -f "$state/server.pid" ]; then
  pid=$(cat "$state/server.pid")
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "stopped pid $pid"
  else
    echo "pid $pid was already gone"
  fi
fi
rm -f "$state/server.pid" "$state/server.port" "$state/server.log"
echo "evidence kept in $state/evidence"
