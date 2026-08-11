#!/bin/sh
# Exercises railway-deploy.sh against a scripted fake `railway`, in the same
# image CI uses. Nothing runs this automatically — the gate only fires on main,
# so run it by hand after touching the gate:
#
#   docker run --rm -v "$PWD/.github/scripts:/s" --entrypoint sh \
#     ghcr.io/railwayapp/cli:latest /s/railway-deploy.test.sh
set -u

gate="${1:-$(dirname "$0")/railway-deploy.sh}"

mkdir -p /tmp/fake-bin
cat > /tmp/fake-bin/railway <<'FAKE'
#!/bin/sh
case "$1 $2" in
  "up --detach")
    if [ "${FAKE_NO_ID:-0}" = "1" ]; then
      echo '{"error":"boom"}'
    else
      echo '{"deploymentId":"dep-1","logsUrl":"https://railway.app/logs/dep-1"}'
    fi
    ;;
  "deployment list")
    poll=$(cat /tmp/fake-poll 2>/dev/null || echo 0)
    poll=$((poll + 1))
    echo "$poll" > /tmp/fake-poll
    status=$(echo "$FAKE_STATUSES" | cut -d, -f"$poll")
    [ -z "$status" ] && status=$(echo "$FAKE_STATUSES" | rev | cut -d, -f1 | rev)
    # The nested "id" mirrors the real payload's meta object, which must not be
    # mistaken for a deployment id.
    printf '[\n  {\n    "id": "dep-1",\n    "status": "%s",\n    "meta": { "id": "nested" }\n  }\n]\n' "$status"
    ;;
  "logs "*) echo "  (fake $3 logs for $2)" ;;
esac
FAKE
chmod +x /tmp/fake-bin/railway
PATH=/tmp/fake-bin:$PATH
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
  rm -f /tmp/fake-poll
  # Every case is bounded, not just the timeout one: a gate that stops exiting
  # on a terminal status would otherwise hang for its full default budget.
  output="$(env RAILWAY_DEPLOY_TIMEOUT_SECONDS=5 "$@" RAILWAY_POLL_INTERVAL_SECONDS=1 sh "$gate" svc-1 2>&1)"
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
expect "fails on FAILED" 1 "ended as FAILED" FAKE_STATUSES=BUILDING,FAILED
expect "fails on CRASHED" 1 "ended as CRASHED" FAKE_STATUSES=CRASHED
expect "fails on REMOVED" 1 "was removed before" FAKE_STATUSES=REMOVED
expect "passes on SKIPPED" 0 "was skipped by Railway" FAKE_STATUSES=SKIPPED
expect "times out while still BUILDING" 1 "still BUILDING after 2s" FAKE_STATUSES=BUILDING RAILWAY_DEPLOY_TIMEOUT_SECONDS=2
expect "fails when up reports no deploymentId" 1 "reported no deploymentId" FAKE_STATUSES=SUCCESS FAKE_NO_ID=1

if [ "$failures" -ne 0 ]; then
  echo "$failures check(s) failed."
  exit 1
fi
echo "All checks passed."
