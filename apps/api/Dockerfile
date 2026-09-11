FROM node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NX_DAEMON=false
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN NODE_ENV=production pnpm nx build api --configuration=production
RUN pnpm exec esbuild apps/api/src/database/migrate.ts --bundle --platform=node --format=cjs --target=node24 --outfile=apps/api/src/database/migrate.cjs
RUN node tools/prune-runtime-deps.mjs api dist/apps/api
RUN pnpm --dir dist/apps/api install --prod --offline --frozen-lockfile --ignore-workspace

FROM node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist/apps/api dist/apps/api
COPY --from=build /app/apps/api/src/database/migrate.cjs apps/api/src/database/migrate.cjs
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
USER node
CMD ["node", "dist/apps/api/main.js"]
