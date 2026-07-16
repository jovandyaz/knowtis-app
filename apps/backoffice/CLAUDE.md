# Backoffice app notes

## Charts

- recharts is **v3** — never use v2 APIs. Check the migration guide before writing chart code: https://github.com/recharts/recharts/wiki/3.0-migration-guide
- Chart components live in `src/components/charts/` and take colors exclusively from design-system tokens (`var(--chart-1)`…`var(--chart-5)`). Never hardcode color values.
- Time-series data comes pre-bucketed and zero-filled from `GET /admin/ai/metrics/timeseries` — no client-side bucketing.
