# Backoffice

Internal admin panel. Isolated from the end-user `notes` app — separate bundle, separate Vercel project, role-gated (`admin`).

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
