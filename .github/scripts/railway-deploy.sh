#!/bin/sh
# Deploy to Railway and gate on the DEPLOYMENT, not the build.
#
# Agent/non-TTY and detached CLI invocations are not terminal deployment
# evidence. Start detached, capture the exact deployment ID, then poll it to a
# terminal status. Runs under busybox sh in ghcr.io/railwayapp/cli: no bash, no jq.
set -eu

service="${1:?usage: railway-deploy.sh <service-id>}"
poll_interval_seconds="${RAILWAY_POLL_INTERVAL_SECONDS:-10}"
timeout_seconds="${RAILWAY_DEPLOY_TIMEOUT_SECONDS:-900}"
# A successful listing that lacks the deployment means the token is looking at
# the wrong place (or the deployment was purged) — waiting longer cannot fix it.
absent_listing_tolerance=3
failure_log_lines=100

json_string_value() {
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

# Deployments are listed newest first and every object opens with "id" then
# "status". Top-level keys sit at exactly four spaces in the CLI's
# pretty-printed JSON; anchoring there keeps ids nested under `meta` from being
# misattributed.
status_of() {
  awk -v target="$1" '
    /^    "id"[[:space:]]*:/ {
      id = $0; sub(/.*"id"[^"]*"/, "", id); sub(/".*/, "", id)
    }
    /^    "status"[[:space:]]*:/ {
      if (id == target) {
        status = $0; sub(/.*"status"[^"]*"/, "", status); sub(/".*/, "", status)
        print status; exit
      }
    }'
}

dump_logs() {
  echo "--- build logs (last $failure_log_lines) ---"
  railway logs "$1" --build --lines "$failure_log_lines" --service "$service" || true
  echo "--- deploy logs (last $failure_log_lines) ---"
  railway logs "$1" --deployment --lines "$failure_log_lines" --service "$service" || true
}

if ! started="$(railway up --detach --json --service "$service")"; then
  echo "::error::railway up failed to start a deployment for service $service."
  exit 1
fi
deployment_id="$(printf '%s\n' "$started" | json_string_value deploymentId)"

if [ -z "$deployment_id" ]; then
  echo "::error::railway up reported no deploymentId, so the deploy cannot be verified."
  exit 1
fi

echo "Deployment $deployment_id started; waiting up to ${timeout_seconds}s for a terminal status."
echo "Build logs: $(printf '%s\n' "$started" | json_string_value logsUrl)"

deadline=$(($(date +%s) + timeout_seconds))
absent_polls=0
list_failures=0
status=""

while :; do
  if listing="$(railway deployment list --json --service "$service" 2>&1)"; then
    status="$(printf '%s\n' "$listing" | status_of "$deployment_id")"
    if [ -n "$status" ]; then
      absent_polls=0
      case "$status" in
        SUCCESS)
          echo "Deployment $deployment_id succeeded."
          exit 0
          ;;
        # Railway skips a deployment whose watch patterns matched nothing. The
        # CLI treats that as success in CI mode, and so do we: nothing to ship.
        SKIPPED)
          echo "Deployment $deployment_id was skipped by Railway; nothing to deploy."
          exit 0
          ;;
        FAILED | CRASHED)
          echo "::error::Deployment $deployment_id ended as $status."
          dump_logs "$deployment_id"
          exit 1
          ;;
        # Ours was superseded or rolled back before it went live, so whatever
        # is serving traffic is not this commit.
        REMOVED)
          echo "::error::Deployment $deployment_id was removed before reaching SUCCESS."
          dump_logs "$deployment_id"
          exit 1
          ;;
      esac
    else
      absent_polls=$((absent_polls + 1))
      if [ "$absent_polls" -ge "$absent_listing_tolerance" ]; then
        echo "::error::Deployment $deployment_id is not in the listing for service $service; the token may resolve a different environment."
        exit 1
      fi
    fi
  else
    list_failures=$((list_failures + 1))
    echo "deployment list failed (attempt $list_failures): $listing"
  fi

  if [ "$(date +%s)" -ge "$deadline" ]; then
    detail=""
    if [ "$list_failures" -gt 0 ]; then
      detail=" (deployment list failed $list_failures times)"
    fi
    echo "::error::Deployment $deployment_id is still ${status:-unreported} after ${timeout_seconds}s${detail}."
    dump_logs "$deployment_id"
    exit 1
  fi
  sleep "$poll_interval_seconds"
done
