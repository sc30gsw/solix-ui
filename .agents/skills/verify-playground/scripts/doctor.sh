#!/usr/bin/env bash
set -uo pipefail

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
state="$root/.verify-playground"
app="$root/apps/playground"
lib="$root/packages/core"
failed=0
report() { if [ "$1" -eq 0 ]; then echo "ok    $2"; else echo "FAIL  $2"; failed=1; fi; }

[ -f "$state/server.pid" ] && [ -f "$state/server.port" ]
report $? "an instance was launched from this checkout (.verify-playground/server.pid exists)"
pid=$(cat "$state/server.pid" 2>/dev/null || echo 0)
port=$(cat "$state/server.port" 2>/dev/null || echo 0)

[ "$pid" -gt 0 ] && kill -0 "$pid" 2>/dev/null
report $? "the launched process is alive (pid $pid)"

[ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$app" ]
report $? "that process runs from this checkout's app directory"

curl --silent --fail "http://127.0.0.1:$port/" 2>/dev/null | grep -q 'class="[^"]*solix-'
report $? "http://127.0.0.1:$port/ serves a page whose markup carries a library class"

stale=$(find "$lib/src" "$lib/build-pipeline.mjs" "$lib/build.mjs" "$app/src" -type f -newer "$app/dist/server/node.js" 2>/dev/null | head -1)
[ -z "$stale" ]
report $? "the build is newer than every source file${stale:+ (stale: ${stale#"$root"/})}"

exit $failed
