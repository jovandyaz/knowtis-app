#!/bin/sh
# Exercises railway-deploy.sh against a scripted fake `railway`, in the same
# image CI uses. CI runs it via .github/workflows/deploy-gate.yml whenever
# .github/scripts changes; run it locally with:
#
#   docker run --rm -v "$PWD/.github/scripts:/s" --entrypoint sh \
#     ghcr.io/railwayapp/cli:latest /s/railway-deploy.test.sh
set -u

gate="${1:-$(dirname "$0")/railway-deploy.sh}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
export FAKE_STATE_DIR="$workdir"

cat > "$workdir/railway" <<'FAKE'
#!/bin/sh
case "$1 $2" in
  "up --detach")
    if [ "${FAKE_UP_FAILS:-0}" = "1" ]; then
      echo "Upload failed: connection reset" >&2
      exit 1
    fi
    if [ "${FAKE_NO_ID:-0}" = "1" ]; then
      echo '{"error":"boom"}'
    else
      echo '{"deploymentId":"dep-1","logsUrl":"https://railway.app/logs/dep-1"}'
    fi
    ;;
  "deployment list")
    if [ "${FAKE_LIST_FAILS:-0}" = "1" ]; then
      echo "Unauthorized. Please login with railway login" >&2
      exit 1
    fi
    poll=$(cat "$FAKE_STATE_DIR/poll" 2>/dev/null || echo 0)
    poll=$((poll + 1))
    echo "$poll" > "$FAKE_STATE_DIR/poll"
    status=$(echo "$FAKE_STATUSES" | cut -d, -f"$poll")
    [ -z "$status" ] && status=$(echo "$FAKE_STATUSES" | rev | cut -d, -f1 | rev)
    # Mirrors the CLI's pretty-printed shape: a newer deployment first, ours
    # second, nested ids under `meta` that must never be misattributed.
    if [ "${FAKE_ABSENT:-0}" = "1" ]; then
      printf '[\n  {\n    "id": "dep-newer",\n    "status": "SUCCESS",\n    "meta": {\n      "id": "nested"\n    }\n  }\n]\n'
    elif [ "${FAKE_NESTED_TRAP:-0}" = "1" ]; then
      # A nested id equal to ours sits between another object's id and status:
      # unanchored parsing credits that SUCCESS to our FAILED deployment.
      printf '[\n  {\n    "id": "dep-newer",\n    "creator": {\n      "id": "dep-1"\n    },\n    "status": "SUCCESS",\n    "meta": {\n      "id": "nested"\n    }\n  },\n  {\n    "id": "dep-1",\n    "status": "FAILED",\n    "meta": {\n      "id": "nested2"\n    }\n  }\n]\n'
    else
      printf '[\n  {\n    "id": "dep-newer",\n    "status": "SUCCESS",\n    "meta": {\n      "id": "nested"\n    }\n  },\n  {\n    "id": "dep-1",\n    "status": "%s",\n    "meta": {\n      "id": "nested2"\n    }\n  }\n]\n' "$status"
    fi
    ;;
  "logs "*) echo "  (fake $3 logs for $2)" ;;
esac
FAKE
chmod +x "$workdir/railway"
PATH="$workdir:$PATH"
export PATH

failures=0

# Asserting the exit code alone is not enough: a gate that ignored every status
# and always ran out its budget would exit 1 for most cases and look correct, so
# each case also has to say why it ended.
expect() {
  label="$1"
  expected_exit="$2"
  expected_reason="$3"
  shift 3
  rm -f "$workdir/poll"
  # Every case is bounded, not just the timeout one: a gate that stops exiting
  # on a terminal status would otherwise hang for its full default budget.
  output="$(env RAILWAY_DEPLOY_TIMEOUT_SECONDS=10 "$@" RAILWAY_POLL_INTERVAL_SECONDS=1 sh "$gate" svc-1 2>&1)"
  actual_exit=$?

  if [ "$actual_exit" != "$expected_exit" ]; then
    echo "FAIL $label -> exit=$actual_exit, expected $expected_exit"
  elif ! printf '%s' "$output" | grep -q "$expected_reason"; then
    echo "FAIL $label -> exited $actual_exit but never said '$expected_reason'"
  else
    echo "ok   $label"
    return 0
  fi

  echo "$output" | sed 's/^/       | /'
  failures=$((failures + 1))
}

expect "reaches SUCCESS after two polls" 0 "dep-1 succeeded" FAKE_STATUSES=BUILDING,DEPLOYING,SUCCESS
expect "fails on FAILED behind a newer green deployment" 1 "ended as FAILED" FAKE_STATUSES=BUILDING,FAILED
expect "fails on CRASHED" 1 "ended as CRASHED" FAKE_STATUSES=CRASHED
expect "fails on REMOVED" 1 "was removed before" FAKE_STATUSES=REMOVED
expect "passes on SKIPPED" 0 "was skipped by Railway" FAKE_STATUSES=SKIPPED
expect "times out while still BUILDING" 1 "still BUILDING after 2s" FAKE_STATUSES=BUILDING RAILWAY_DEPLOY_TIMEOUT_SECONDS=2
expect "fails when up reports no deploymentId" 1 "reported no deploymentId" FAKE_STATUSES=SUCCESS FAKE_NO_ID=1
expect "fails when up itself fails" 1 "railway up failed to start" FAKE_STATUSES=SUCCESS FAKE_UP_FAILS=1
expect "fails fast when the listing never contains the deployment" 1 "not in the listing" FAKE_STATUSES=SUCCESS FAKE_ABSENT=1
expect "never credits a nested id with a top-level status" 1 "ended as FAILED" FAKE_STATUSES=FAILED FAKE_NESTED_TRAP=1
expect "keeps polling through listing failures until the deadline" 1 "deployment list failed" FAKE_STATUSES=SUCCESS FAKE_LIST_FAILS=1 RAILWAY_DEPLOY_TIMEOUT_SECONDS=2

if [ "$failures" -ne 0 ]; then
  echo "$failures check(s) failed."
  exit 1
fi
echo "All checks passed."
