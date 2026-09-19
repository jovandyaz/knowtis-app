#!/usr/bin/env bash
set -euo pipefail

# Compares the current eval summaries against the most recent earlier run that
# uploaded the same artifact and appends a per-case drift table to the GitHub
# job summary. Informational only: always exits 0.

OUTPUT_DIR="${AI_EVAL_OUTPUT_DIR:?AI_EVAL_OUTPUT_DIR must be set}"
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
WORKFLOW_FILE="nightly-eval.yml"
ARTIFACT_NAME="${EVAL_DRIFT_ARTIFACT_NAME:-eval-results}"
BASELINE_RUN_LOOKBACK=20

note() {
  printf '%s\n' "$1" >>"$SUMMARY_FILE"
}

baseline_dir="${EVAL_DRIFT_BASELINE_DIR:-}"
baseline_label="local baseline"

if [ -z "$baseline_dir" ]; then
  current_run="${GITHUB_RUN_ID:-}"
  # A red leg still uploads valid results, and one red leg must not freeze the
  # baseline of the others, so the conclusion of the earlier run is ignored.
  earlier_runs="$(gh run list --workflow "$WORKFLOW_FILE" --status completed \
    --limit "$BASELINE_RUN_LOOKBACK" --json databaseId --jq '.[].databaseId' |
    grep -vx "$current_run" || true)"
  prev_run=""
  for candidate in $earlier_runs; do
    candidate_dir="$(mktemp -d)"
    if gh run download "$candidate" --name "$ARTIFACT_NAME" --dir "$candidate_dir" 2>/dev/null; then
      prev_run="$candidate"
      baseline_dir="$candidate_dir"
      break
    fi
  done
  if [ -z "$prev_run" ]; then
    note "Eval drift: none of the last ${BASELINE_RUN_LOOKBACK} runs uploaded ${ARTIFACT_NAME}; nothing to compare."
    exit 0
  fi
  baseline_label="run ${prev_run}"
fi

note "## Eval drift vs previous run (${baseline_label})"

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
  note "| Case | Baseline | Current | Ungraded | Status |"
  note "| --- | --- | --- | --- | --- |"
  jq -r --slurpfile base "$baseline" '
    def graded: .trials - (.graderErrors // 0);
    def rate: if graded == 0 then null else .passes / graded end;
    def cell: if graded == 0 then "-/0" else "\(.passes)/\(graded)" end;
    ($base[0].cases | map({key: .key, value: .}) | from_entries) as $prev
    | .cases[]
    | . as $cur
    | ($prev[.key] // null) as $old
    | [
        .label,
        (if $old == null then "-" else ($old | cell) end),
        ($cur | cell),
        "\(.graderErrors // 0)/\(.trials)",
        (if $old == null then "new"
         elif ($cur | rate) == null then "ungraded"
         elif ($old | rate) == null then "regraded"
         elif ($cur | rate) < ($old | rate) then "REGRESSED"
         elif ($cur | rate) > ($old | rate) then "improved"
         else "=" end)
      ]
    | "| \(.[0]) | \(.[1]) | \(.[2]) | \(.[3]) | \(.[4]) |"
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
