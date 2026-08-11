#!/bin/sh
# Deploy to Railway and gate on the DEPLOYMENT, not the build.
#
# `railway up` returns when the build log stream closes, which happens before
# preDeployCommand (migrations) and the healthcheck run — so a failed migration
# would otherwise leave this job green. Start detached, then poll for a terminal
# status. Runs under busybox sh in ghcr.io/railwayapp/cli: no bash, no jq.
set -eu

service="${1:?usage: railway-deploy.sh <service-id>}"
poll_interval_seconds="${RAILWAY_POLL_INTERVAL_SECONDS:-10}"
timeout_seconds="${RAILWAY_DEPLOY_TIMEOUT_SECONDS:-900}"
failure_log_lines=100

json_string_value() {
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

# Deployments are listed newest first and every object opens with "id" then
# "status", so tracking the last id seen resolves the status of ours alone.
status_of() {
  railway deployment list --json --service "$service" | awk -v target="$1" '
    /"id"[[:space:]]*:/ {
      id = $0; sub(/.*"id"[^"]*"/, "", id); sub(/".*/, "", id)
    }
    /"status"[[:space:]]*:/ {
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

started="$(railway up --detach --json --service "$service")"
deployment_id="$(printf '%s\n' "$started" | json_string_value deploymentId)"

if [ -z "$deployment_id" ]; then
  echo "::error::railway up reported no deploymentId, so the deploy cannot be verified."
  exit 1
fi

echo "Deployment $deployment_id started; waiting up to ${timeout_seconds}s for a terminal status."
echo "Build logs: $(printf '%s\n' "$started" | json_string_value logsUrl)"
deadline=$(($(date +%s) + timeout_seconds))

while :; do
  status="$(status_of "$deployment_id" || true)"
  case "$status" in
    SUCCESS)
      echo "Deployment $deployment_id succeeded."
      exit 0
      ;;
    # Railway skips a deployment whose watch patterns matched nothing. The CLI
    # treats that as success in CI mode, and so do we: there was nothing to ship.
    SKIPPED)
      echo "Deployment $deployment_id was skipped by Railway; nothing to deploy."
      exit 0
      ;;
    FAILED | CRASHED)
      echo "::error::Deployment $deployment_id ended as $status."
      dump_logs "$deployment_id"
      exit 1
      ;;
    # Ours was superseded or rolled back before it went live, so whatever is
    # serving traffic is not this commit.
    REMOVED)
      echo "::error::Deployment $deployment_id was removed before reaching SUCCESS."
      dump_logs "$deployment_id"
      exit 1
      ;;
  esac

  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::Deployment $deployment_id is still ${status:-unreported} after ${timeout_seconds}s."
    dump_logs "$deployment_id"
    exit 1
  fi

  sleep "$poll_interval_seconds"
done
