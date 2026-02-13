#!/bin/bash
# Vercel Ignored Build Step for Nx monorepo.
# Returns exit 1 (proceed with build) if the project is affected by changes.
# Returns exit 0 (skip build) if the project is NOT affected.
#
# Usage: Set as "Ignored Build Step" in Vercel Dashboard > Project Settings > Git
# Command: bash tools/vercel-ignore.sh notes
#
# Docs: https://vercel.com/docs/monorepos#ignoring-the-build-step

PROJECT_NAME="${1:-notes}"

echo "Checking if '$PROJECT_NAME' is affected by the commit..."

# Vercel sets VERCEL_GIT_PREVIOUS_SHA and VERCEL_GIT_COMMIT_SHA
if npx nx show projects --affected --base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD~1}" --head="${VERCEL_GIT_COMMIT_SHA:-HEAD}" | grep -q "^${PROJECT_NAME}$"; then
  echo ">> '$PROJECT_NAME' is affected. Proceeding with build."
  exit 1 # Build
else
  echo ">> '$PROJECT_NAME' is NOT affected. Skipping build."
  exit 0 # Skip
fi
