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

For these routes, `$pathname` must be `/notes/:noteId` or `/s/:shareToken`.
When present, `$current_url` must be the corresponding normalized first-party
URL (for example, `https://knowtis.app/notes/:noteId`), never a literal
identifier or token. Inspect event properties before expanding a dashboard or
adding a new event field.

## PostHog project assets

The following assets were created or updated in PostHog project `344524` and
read back after configuration. Reuse exact-name matches and these IDs; do not
rename or delete historical assets.

| Asset name                                    | Kind                      | PostHog ID                             |
| --------------------------------------------- | ------------------------- | -------------------------------------- |
| `user signed up`                              | Event definition          | `01a06da6-51e3-0000-9516-b0a4a296cf33` |
| `email verified`                              | Event definition          | `01a06da6-535e-0000-26dd-f222a32df2cf` |
| `note created`                                | Event definition          | `01a06da6-54ce-0000-3fa9-695c8b3e0320` |
| `note activated`                              | Event definition          | `01a06da6-5675-0000-6c2f-d16bcfaea2f1` |
| `note shared`                                 | Event definition          | `01a06da6-58e4-0000-b4c9-fb04d25a18d5` |
| `shared note viewed`                          | Event definition          | `01a06da6-5acd-0000-cade-7038c762a234` |
| `ai response completed`                       | Event definition          | `01a06da6-5bef-0000-433a-d31318b6d3ca` |
| `mcp key created`                             | Event definition          | `01a06da6-5d9b-0000-c573-c27cf9434a8f` |
| `$pathname`                                   | Event property definition | `019cf52e-e328-7591-8627-b18ed2aa2244` |
| `$current_url`                                | Event property definition | `019cf52e-e328-7591-8627-afefb352077d` |
| `$referrer`                                   | Event property definition | `019cf52e-e328-7591-8627-b1c8ef680625` |
| `$geoip_country_name`                         | Event property definition | `019cf52e-e328-7591-8627-b06a58114f54` |
| `Knowtis product activity`                    | Dashboard                 | `2065684`                              |
| `Knowtis weekly active users`                 | Trends insight            | `11618349`                             |
| `Knowtis acquisition by referrer and country` | Trends insight            | `11618350`                             |
| `Knowtis activation funnel`                   | Funnel insight            | `11618351`                             |
| `Knowtis note activation retention`           | Retention insight         | `11618352`                             |
| `Knowtis AI adoption`                         | Trends insight            | `11618353`                             |
| `Knowtis MCP adoption`                        | Trends insight            | `11618354`                             |

PostHog can create custom event definitions before first ingestion, but its
property-definition endpoint can only update properties that already exist in
the taxonomy. Until real production events introduce a custom property, an
update returns `Property definition not found`. Do not send synthetic
production events to work around this. After the first real ingestion,
describe and verify the custom properties listed in the event contract above.

When verifying these assets, confirm the dashboard contains the six saved
insights listed above and that each remains attached to dashboard `2065684`.
Every insight must retain `environment = production` and exclude
`is_internal = true`. Confirm the activation funnel remains ordered from
`user signed up` through `email verified`, `note created`, `note activated`,
and `note shared`; retention remains anchored on `note activated`; and the AI
and MCP insights retain only their approved categorical breakdowns. Treat URL,
referrer, and country breakdowns as safe only after the privacy checks in this
runbook pass.
