#!/usr/bin/env bash
#
# Runs the API suites against a throwaway database.
#
# Builds the API, starts it on a spare port with its own SQLite file and its
# own mail outbox, runs the Python suites, and stops it again. Nothing it
# touches outlives the run.
#
#   tests/run-api-tests.sh            # both suites
#   PORT=5301 tests/run-api-tests.sh  # somewhere else
#
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PORT="${PORT:-5297}"
WORK="$(mktemp -d)"
PYTHON="${PYTHON:-python}"
PID=""

cleanup() {
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null
    sleep 1
    kill -9 "$PID" 2>/dev/null
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "Building the API…"
if ! dotnet build "$ROOT/backend/Smf.Api" -v q --nologo > "$WORK/build.log" 2>&1; then
  echo "The API did not build:"
  tail -20 "$WORK/build.log"
  exit 1
fi

# Windows builds want a Windows path in the connection string.
if command -v cygpath > /dev/null 2>&1; then
  DATA="$(cygpath -w "$WORK")"
else
  DATA="$WORK"
fi

echo "Starting the API on $PORT…"
ASPNETCORE_ENVIRONMENT=Development \
ConnectionStrings__DefaultConnection="Data Source=$DATA/smf.db" \
Email__OutboxPath="$DATA/outbox" \
Sms__OutboxPath="$DATA/sms-outbox" \
Storage__RegistrationUploadsPath="$DATA/uploads" \
Membership__MaintenanceEnabled=false \
RateLimits__PublicRegistration__PermitLimit=5000 \
RateLimits__MemberAuth__PermitLimit=5000 \
dotnet run --project "$ROOT/backend/Smf.Api" --no-build --no-launch-profile \
  --urls "http://127.0.0.1:$PORT" > "$WORK/api.log" 2>&1 &
PID=$!

for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/events" || true)"
  [ "$code" = "200" ] && break
  sleep 1
done

if [ "${code:-}" != "200" ]; then
  echo "The API did not come up:"
  tail -20 "$WORK/api.log"
  exit 1
fi

export SMF_TEST_API="http://127.0.0.1:$PORT"
export SMF_TEST_DB="$WORK/smf.db"
export SMF_TEST_OUTBOX="$WORK/outbox"

status=0
for suite in test_phase3 test_accounts test_gaps; do
  echo
  echo "=============================================================="
  echo " $suite"
  echo "=============================================================="
  "$PYTHON" "$HERE/api/$suite.py" || status=1
done

echo
[ "$status" -eq 0 ] && echo "ALL API SUITES PASSED" || echo "SOME API SUITES FAILED"
exit "$status"
