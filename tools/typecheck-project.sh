#!/bin/bash
# Typecheck a project's source and test files.
# Runs tsc --noEmit against tsconfig.lib.json (or tsconfig.app.json) and tsconfig.spec.json.
# Designed to be run with cwd set to a project root.
set -e

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
