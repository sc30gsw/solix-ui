#!/usr/bin/env bash
set -euo pipefail

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
state="$root/.verify-playground"
port=${VERIFY_PLAYGROUND_PORT:-4331}
url="http://127.0.0.1:$port/"
mkdir -p "$state/evidence"

if [ -f "$state/server.pid" ] && kill -0 "$(cat "$state/server.pid")" 2>/dev/null; then
  echo "refusing to launch: this checkout already runs an instance (pid $(cat "$state/server.pid")). Run cleanup.sh first." >&2
  exit 1
fi

(cd "$root" && NODE_ENV=production node_modules/.bin/vp run -r build)

cd "$root/apps/playground"
PORT=$port HOST=127.0.0.1 nohup node dist/server/node.js >"$state/server.log" 2>&1 &
echo $! >"$state/server.pid"
echo "$port" >"$state/server.port"

if curl --silent --fail --retry 10 --retry-connrefused --retry-delay 1 "$url" | grep -q 'class="[^"]*solix-'; then
  echo "ready: $url (pid $(cat "$state/server.pid"))"
else
  echo "not ready: the page did not serve markup that carries a library class. See $state/server.log" >&2
  exit 1
fi
