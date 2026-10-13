#!/bin/sh
# Fetch (once, cached) and start DynamoDB Local 2.6.1 in memory, for a Linux session or CI. Never the laptop.
# Usage: scripts/ddb-local.sh           start in the background on ${DDB_PORT:-8000}, print the endpoint
#        scripts/ddb-local.sh --stop    stop it
# Why Maven: Docker image pulls are blocked in cloud sessions; Maven Central works (specs/028-m27-aws-infra research R8).
# No AWS account or credential is involved: the API's client sends fixed dummy keys to a local endpoint only.
set -eu
VERSION=2.6.1
PORT=${DDB_PORT:-8000}
CACHE=${XDG_CACHE_HOME:-$HOME/.cache}/socialmorning/ddb-local
LIB=$CACHE/lib
PIDFILE=$CACHE/ddb-$PORT.pid
LOG=$CACHE/ddb-$PORT.log
mkdir -p "$CACHE"

if [ "${1:-}" = "--stop" ]; then
  if [ -f "$PIDFILE" ]; then kill "$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"; echo "DynamoDB Local on :$PORT stopped"; else echo "no DynamoDB Local pid file for :$PORT"; fi
  exit 0
fi

fail_fetch() {
  echo "DynamoDB Local could not be fetched — run the DynamoDB suites in CI (ci/workflows/ddb-api.yml)" >&2
  exit 2
}

if [ ! -f "$LIB/.complete-$VERSION" ]; then
  command -v java >/dev/null 2>&1 || fail_fetch
  command -v mvn >/dev/null 2>&1 || fail_fetch
  WORK=$(mktemp -d)
  trap 'rm -rf "$WORK"' EXIT
  cat > "$WORK/pom.xml" <<POM
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>local</groupId><artifactId>ddb-local-fetch</artifactId><version>1</version>
  <dependencies>
    <dependency><groupId>com.amazonaws</groupId><artifactId>DynamoDBLocal</artifactId><version>$VERSION</version></dependency>
  </dependencies>
</project>
POM
  rm -rf "$LIB"; mkdir -p "$LIB"
  (cd "$WORK" && mvn -q -B dependency:copy-dependencies -DoutputDirectory="$LIB") >"$CACHE/fetch.log" 2>&1 || { tail -5 "$CACHE/fetch.log" >&2; fail_fetch; }
  touch "$LIB/.complete-$VERSION"
fi

if curl -s -o /dev/null "http://localhost:$PORT"; then
  echo "http://localhost:$PORT (already running)"; exit 0
fi

# sqlite4java's native library sits in the same folder as the jars. Run from the cache folder: DynamoDB Local drops a metadata file in its cwd.
cd "$CACHE"
nohup java -Djava.library.path="$LIB" -cp "$LIB/*" com.amazonaws.services.dynamodbv2.local.main.ServerRunner -inMemory -port "$PORT" >"$LOG" 2>&1 &
echo $! > "$PIDFILE"
i=0
while [ "$i" -lt 60 ]; do
  # Any HTTP answer means it is up (it answers 400 to an unsigned request).
  if curl -s -o /dev/null "http://localhost:$PORT"; then echo "http://localhost:$PORT"; exit 0; fi
  i=$((i + 1)); sleep 1
done
echo "DynamoDB Local did not answer on :$PORT in 60 s — see $LOG" >&2
exit 1
