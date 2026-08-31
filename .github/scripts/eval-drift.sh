#!/usr/bin/env bash
set -euo pipefail

# Compares the current eval summaries against the previous successful
# nightly's eval-results artifact and appends a per-case drift table to the
# GitHub job summary. Informational only: always exits 0.

OUTPUT_DIR="${AI_EVAL_OUTPUT_DIR:?AI_EVAL_OUTPUT_DIR must be set}"
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
WORKFLOW_FILE="nightly-eval.yml"
ARTIFACT_NAME="eval-results"

note() {
  printf '%s\n' "$1" >>"$SUMMARY_FILE"
}

baseline_dir="${EVAL_DRIFT_BASELINE_DIR:-}"
baseline_label="local baseline"

if [ -z "$baseline_dir" ]; then
  current_run="${GITHUB_RUN_ID:-}"
  prev_run="$(gh run list --workflow "$WORKFLOW_FILE" --status success --limit 20 \
    --json databaseId --jq '.[].databaseId' | grep -vx "$current_run" | head -n 1 || true)"
  if [ -z "$prev_run" ]; then
    note "Eval drift: no previous successful nightly run found; nothing to compare."
    exit 0
  fi
  baseline_dir="$(mktemp -d)"
  if ! gh run download "$prev_run" --name "$ARTIFACT_NAME" --dir "$baseline_dir"; then
    note "Eval drift: run ${prev_run} has no ${ARTIFACT_NAME} artifact; nothing to compare."
    exit 0
  fi
  baseline_label="run ${prev_run}"
fi

note "## Eval drift vs previous nightly (${baseline_label})"

shopt -s nullglob
summaries=("$OUTPUT_DIR"/*.summary.json)
if [ "${#summaries[@]}" -eq 0 ]; then
  note ""
  note "No suite summaries found in ${OUTPUT_DIR}."
  exit 0
fi

for current in "${summaries[@]}"; do
  file="$(basename "$current")"
  suite="${file%.summary.json}"
  baseline="$baseline_dir/$file"
  note ""
  if [ ! -f "$baseline" ]; then
    note "### ${suite}: no baseline summary in previous run."
    continue
  fi
  cur_model="$(jq -r '.model' "$current")"
  prev_model="$(jq -r '.model' "$baseline")"
  cur_trials="$(jq -r '.trials' "$current")"
  prev_trials="$(jq -r '.trials' "$baseline")"
  if [ "$cur_model" != "$prev_model" ] || [ "$cur_trials" != "$prev_trials" ]; then
    note "### ${suite}: baseline not comparable (model ${prev_model} -> ${cur_model}, trials ${prev_trials} -> ${cur_trials})."
    continue
  fi
  note "### ${suite} (${cur_model}, ${cur_trials} trials)"
  note ""
  note "| Case | Baseline | Current | Status |"
  note "| --- | --- | --- | --- |"
  jq -r --slurpfile base "$baseline" '
    ($base[0].cases | map({key: .key, value: .}) | from_entries) as $prev
    | .cases[]
    | ($prev[.key] // null) as $old
    | [
        .label,
        (if $old == null then "-" else "\($old.passes)/\($old.trials)" end),
        "\(.passes)/\(.trials)",
        (if $old == null then "new"
         elif .passes < $old.passes then "REGRESSED"
         elif .passes > $old.passes then "improved"
         else "=" end)
      ]
    | "| \(.[0]) | \(.[1]) | \(.[2]) | \(.[3]) |"
  ' "$current" >>"$SUMMARY_FILE"
  removed="$(jq -r --slurpfile cur "$current" '
    ($cur[0].cases | map(.key)) as $keys
    | .cases[]
    | select(.key as $k | $keys | index($k) | not)
    | .label
  ' "$baseline")"
  if [ -n "$removed" ]; then
    note ""
    note "Removed cases: ${removed//$'\n'/, }"
  fi
done

exit 0
