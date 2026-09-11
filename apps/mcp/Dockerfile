FROM node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NX_DAEMON=false
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm nx build mcp
RUN node tools/prune-runtime-deps.mjs mcp dist/apps/mcp
RUN pnpm --dir dist/apps/mcp install --prod --offline --frozen-lockfile --ignore-workspace

FROM node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist/apps/mcp dist/apps/mcp
USER node
CMD ["node", "dist/apps/mcp/index.js"]
