#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
STAGING="$ROOT/dist/apps/mcp-mcpb/staging"
VERSION="$(node -e "console.log(require('$ROOT/apps/mcp/package.json').version)")"
MANIFEST_VERSION="$(node -e "console.log(require('$ROOT/apps/mcp/mcpb/manifest.json').version)")"
SERVER_JSON_VERSION="$(node -e "console.log(require('$ROOT/apps/mcp/server.json').version)")"

if [ "$VERSION" != "$MANIFEST_VERSION" ] || [ "$VERSION" != "$SERVER_JSON_VERSION" ]; then
  echo "version drift: package.json=$VERSION manifest.json=$MANIFEST_VERSION server.json=$SERVER_JSON_VERSION" >&2
  exit 1
fi

rm -rf "$STAGING"
mkdir -p "$STAGING/server"
pnpm exec nx run mcp:build-mcpb
cp "$ROOT/apps/mcp/mcpb/manifest.json" "$STAGING/manifest.json"
cp "$ROOT/apps/mcp/mcpb/icon.png" "$STAGING/icon.png"
# Claude Desktop's bundled Node version is undocumented; without a module scope
# the ESM bundle only runs where syntax detection exists (Node >=22.7).
printf '{"type":"module"}\n' > "$STAGING/server/package.json"

npx -y @anthropic-ai/mcpb@2.1.2 validate "$STAGING/manifest.json"
npx -y @anthropic-ai/mcpb@2.1.2 pack "$STAGING" "$ROOT/dist/apps/mcp-mcpb/knowtis-mcp-$VERSION.mcpb"
echo "packed: dist/apps/mcp-mcpb/knowtis-mcp-$VERSION.mcpb"
