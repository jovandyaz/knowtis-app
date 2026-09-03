# Backoffice

Internal admin panel. Isolated from the end-user `notes` app — separate bundle, separate Vercel project, role-gated (`admin`).

## Pages

`src/routes/_authenticated/`: dashboard (`index`), `users`, `audit`, `feature-flags` (the `product`-domain flags), `ai-metrics` (spend/token/request charts) and `ai-config` — the single AI-ops surface.

The **AI Config** page composes `src/components/ai-config/`: `ModelsSection` (which model each kind of turn runs on), `RoutingSection` (the fallback chain order), `UpstreamSection` (the OpenRouter upstream allowlist), `ReasoningSection` (the global reasoning-effort default), `CeilingSection` (the free-tier price ceiling), `ProvidersSection` with a `ProviderCard` per provider (stored key, enablement, live probe verdict), `CatalogSection` + `PromotedTable` / `CandidatesTable` for the open-tier catalog, and `ConfigSourceCell`, which badges every setting `custom` / `default` / `stale` — `stale` destructively, next to the stored value the runtime is ignoring. `assignable-model-options.ts` is what limits the model pickers in `ModelsSection` / `RoutingSection` to models a keyed, enabled provider can actually route. See [docs/AI.md](../../docs/AI.md).

## Local development

```bash
cp apps/backoffice/.env.example apps/backoffice/.env
pnpm dev:api          # API on :3333
pnpm dev:backoffice   # app on :4400
```

Seed an admin user: see `apps/api/src/scripts/seed-admin.ts`.

## Deploy constraints

- **Same-site hosting required:** the refresh-token cookie is `SameSite=Lax`, so the backoffice must be served from the same registrable domain as the API (e.g. `admin.knowtis.app`). Cross-domain hosts (e.g. `*.vercel.app` previews against the production API) will not carry the session cookie.
- **CORS:** set `BACKOFFICE_URL` on the API (Railway) to the backoffice origin before the first deploy.
- **Vercel:** CI-driven via `deploy-backoffice` in `.github/workflows/ci.yml` using `--local-config=apps/backoffice/vercel.json`; requires the `VERCEL_PROJECT_ID_BACKOFFICE` secret.
