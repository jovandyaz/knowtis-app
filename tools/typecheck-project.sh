#!/bin/bash
# Typecheck a project's source and test files.
# Runs tsc --noEmit against tsconfig.lib.json (or tsconfig.app.json) and tsconfig.spec.json.
# Takes the project root as its only argument; Nx passes {projectRoot} so the
# script never has to locate the workspace itself (git-based lookups break in
# hooks inside linked worktrees, where GIT_DIR points at the main repository).
set -e

cd "${1:?usage: typecheck-project.sh <project-root>}"

status=0

# Typecheck source files
if [ -f "tsconfig.lib.json" ]; then
  tsc -p tsconfig.lib.json --noEmit || status=$?
elif [ -f "tsconfig.app.json" ]; then
  tsc -p tsconfig.app.json --noEmit || status=$?
fi

# Typecheck test files
if [ -f "tsconfig.spec.json" ]; then
  tsc -p tsconfig.spec.json --noEmit || status=$?
fi

exit $status
