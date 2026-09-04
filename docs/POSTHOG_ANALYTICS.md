# PostHog product analytics runbook

This runbook describes the production-only, privacy-safe product analytics
contract for the Notes app. Analytics is best effort: unavailable or failed
capture must never change a successful product command.

## Production configuration

Browser analytics belongs to the Notes Vercel project:

- `VITE_PUBLIC_POSTHOG_KEY` is the browser project token. An empty value
  disables browser analytics.
- `VITE_PUBLIC_POSTHOG_HOST` is optional and defaults to the `/t` proxy.

Server analytics belongs only to Railway's `knowtis_app` service:

- `POSTHOG_PROJECT_TOKEN` is the PostHog **project ingestion token**, never a
  Personal API Key.
- `POSTHOG_HOST` is the ingestion host and defaults in the API to
  `https://us.i.posthog.com`.

Both server variables are declared with `preserve()` in
`.railway/railway.ts`; their values remain remote secrets and must not be
committed. They are intentionally absent from `knowtis-mcp`. Do not use
Railway apply or deployment to configure this change.

The browser initializes the production PostHog project only when a token is
present, the Vite build is not development, and the hostname is exactly
`knowtis.app`. Preview deployments, localhost, tests, and custom hosts must
not send production browser events even if they inherit Vercel variables.

## Event contract

All product events include `environment`, `app_version`, `actor_type`,
`is_internal`, and `locale`. `is_internal` is true only for the existing
`admin` role; do not infer it from an email domain.

| Event                   | Authority                                                                              | Allowed event properties                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `user signed up`        | API auth event                                                                         | `source=api`                                                                               |
| `email verified`        | API auth event                                                                         | `source=api`, `verification_method` (`code`, `link`, or `password_reset`)                  |
| `note created`          | API for registered users; browser after confirmed success for anonymous users          | `source` (`api` or `browser`), `actor_type`                                                |
| `note activated`        | Browser, on the first meaningful edit of an initially empty note during that lifecycle | `source=editor`                                                                            |
| `note shared`           | API after a successful link or collaborator share                                      | `source=api`, `share_type` (`link` or `collaborator`), `permission` (`viewer` or `editor`) |
| `shared note viewed`    | Browser after the shared note resolves successfully                                    | `source=share_link`, `permission`, `actor_type`                                            |
| `ai response completed` | Browser only after a live assistant or copilot stream completes                        | `source`, `assistant_type`, and `action` when applicable                                   |
| `mcp key created`       | API after persistence succeeds                                                         | `source=api`, `scope_level` (`read`, `write`, or `share`)                                  |

Browser anonymous creation is deliberately browser-authoritative so it retains
the browser distinct ID and joins the pre-signup funnel. Registered API events
use the stable database user ID. The browser identifies registered users with
that database ID, never email, and calls `reset()` before the next anonymous
context after sign-out or a transition to anonymous.

Only identification may set these person properties: `email`, `name`, `role`,
`locale`, and `is_internal`. Email and name are not event properties.

## Privacy boundary

The browser's final `before_send` boundary sanitizes URL values in event and
person payloads. The only retained first-party path templates are:

- `/notes/:noteId`
- `/s/:shareToken`

It removes every query string and fragment; external referrers keep only their
origin; malformed URL values are dropped. It also removes sensitive
event-property keys. Never send note IDs, titles, contents, tags,
collaborator IDs, share or verification tokens, API keys, query strings,
emails, names, prompts, responses, source text, model output, token counts,
or costs. Autocapture remains off, router navigation emits manual pageviews,
and replay masks all inputs and text.

## Release validation

1. Confirm Vercel owns only the browser variables and Railway `knowtis_app`
   owns only `POSTHOG_HOST` and `POSTHOG_PROJECT_TOKEN`; verify no values are
   copied into source, logs, or this runbook.
2. Confirm `.railway/railway.ts` preserves exactly those two variables for
   `knowtis_app`, not `knowtis-mcp`, then run `railway config plan`. Review the
   plan before any future apply; it must contain no service deletion, domain,
   replica, or deployment change.
3. In production at `https://knowtis.app`, verify one manual `$pageview` after
   a resolved SPA navigation and verify it uses only normalized URLs. Verify
   preview and localhost produce no browser capture.
4. Exercise one successful path for each applicable event. Confirm failures,
   aborts, loading/error shared links, and duplicate save actions do not create
   success events.
5. In PostHog, filter every release check to `environment = production` and
   exclude `is_internal = true` for product reporting.

Useful HogQL checks (replace the time window as needed) are:

```sql
SELECT event, count()
FROM events
WHERE timestamp >= now() - INTERVAL 24 HOUR
  AND properties.environment = 'production'
  AND event IN ('user signed up', 'email verified', 'note created',
    'note activated', 'note shared', 'shared note viewed',
    'ai response completed', 'mcp key created')
GROUP BY event
ORDER BY event
```

```sql
SELECT properties.$pathname, properties.$current_url
FROM events
WHERE timestamp >= now() - INTERVAL 24 HOUR
  AND properties.environment = 'production'
  AND (properties.$pathname LIKE '/notes/%' OR properties.$pathname LIKE '/s/%')
LIMIT 100
```

The second query must show only `/notes/:noteId` and `/s/:shareToken` for
these routes, never literal identifiers or tokens. Inspect event properties
before expanding a dashboard or adding a new event field.
