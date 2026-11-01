# Backoffice

- recharts is v3: check the [migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide) before writing chart code, because v2 APIs are gone.
- Chart colors come only from `var(--chart-1)` through `var(--chart-5)`.
- `GET /admin/ai/metrics/timeseries` returns pre-bucketed, zero-filled data, so there is no client-side bucketing.
