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
  `https://us.i.posthog.com`. The schema rejects plain-HTTP hosts so the
  project token and person properties never travel in cleartext.

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

`app_version` is the commit the deploy shipped: the notes build stamps
`GITHUB_SHA`, and the API reads the `REVISION` file the deploy job writes
before `railway up`. Railway's `RAILWAY_GIT_COMMIT_SHA` exists only for
GitHub-triggered deploys, and Vercel's system variables do not exist in a
prebuilt deploy, so neither is used. A non-empty `REVISION` wins over a `RELEASE_SHA`
environment variable. Local runs report `0.1.0`.

| Event                        | Authority                                                                                                                                                                                  | Allowed event properties                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user signed up`             | API auth event                                                                                                                                                                             | `source=api`                                                                                                                                                             |
| `email verified`             | API auth event                                                                                                                                                                             | `source=api`, `verification_method` (`code`, `link`, or `password_reset`)                                                                                                |
| `note created`               | API for registered users; browser after confirmed success for anonymous users                                                                                                              | `source` (`api` or `browser`), `actor_type`                                                                                                                              |
| `note activated`             | Browser, on the first meaningful edit of an initially empty note during that lifecycle                                                                                                     | `source=editor`                                                                                                                                                          |
| `note shared`                | API after a successful link or collaborator share                                                                                                                                          | `source=api`, `share_type` (`link` or `collaborator`), `permission` (`viewer` or `editor`)                                                                               |
| `shared note viewed`         | Browser after the shared note resolves successfully                                                                                                                                        | `source=share_link`, `permission`, `actor_type`                                                                                                                          |
| `ai response completed`      | Browser only after a live assistant or copilot stream completes                                                                                                                            | `source`, `assistant_type`, and `action` when applicable                                                                                                                 |
| `ai message queued`          | Browser, when a copilot message is queued behind a live turn instead of sent                                                                                                               | `source=copilot`, `queue_length` (queued messages, this one included)                                                                                                    |
| `ai conversation opened`     | Browser, once an opened copilot conversation's transcript loads                                                                                                                            | `source` (`switcher` or `reload`)                                                                                                                                        |
| `ai conversation deleted`    | Browser, after a delete from the conversation switcher succeeds                                                                                                                            | `source=switcher`                                                                                                                                                        |
| `mcp key created`            | API after persistence succeeds                                                                                                                                                             | `source=api`, `scope_level` (`read`, `write`, or `share`)                                                                                                                |
| `study artifact generated`   | API after a generated study artifact is stored                                                                                                                                             | `source=api`, `artifact_type` (`flashcard_deck`, `quiz`, `summary`, or `mind_map`)                                                                                       |
| `study session started`      | Browser, once per flashcard study session, on a note's deck or the review queue                                                                                                            | `source` (`note` or `queue`), `due_count`, `new_count`                                                                                                                   |
| `study session completed`    | Browser, once per flashcard study session, when it completes                                                                                                                               | `source` (`note` or `queue`), `reviewed_count`, `correct_count`, `duration_bucket` (`<2m`, `2-5m`, `5-15m`, or `>15m`)                                                   |
| `flashcard reviewed`         | API after a card review is recorded                                                                                                                                                        | `source=api`, `quality` (`0`–`5`), `kind` (`due`, `new`, or `early`)                                                                                                     |
| `quiz completed`             | API after a quiz attempt is graded and stored                                                                                                                                              | `source=api`, `scope` (`full` or `missed`), `score_bucket` (`<50`, `50-79`, `80-99`, or `100`, bucketed in the listener; raw scores never leave the API)                 |
| `ai quota consumed`          | API when a copilot turn draws a daily message (not on a replayed turn id)                                                                                                                  | `source=api`, `tier` (`anonymous`, `free`, or `byok`), `remaining_bucket` (`0`, `1-20%`, or `>20%`, bucketed in the listener; raw counts never leave the API)            |
| `ai quota exhausted`         | API on a caller's first turn refused for a spent quota each UTC day                                                                                                                        | `source=api`, `tier`                                                                                                                                                     |
| `ai turn checkpoint reached` | API on a copilot turn's `done` with a continuable `stop_reason`, a resumed turn included                                                                                                   | `source=api`, `tier`, `stop_reason` (`max_steps`, `token_budget`, or `time_limit`), `segment_index` (`0` for a message's own turn, `n` for its nth continuation)         |
| `ai turn continued`          | API once per continuation, when its model call starts                                                                                                                                      | `source=api`, `tier`, `segment_index`                                                                                                                                    |
| `ai upgrade cta clicked`     | Browser, on a click of an upgrade CTA: the locked composer's account or own-key button, the free model menu's **Más modelos con tu API key →** entry, or "Revisar tu key" on a refused key | `from_tier` (`anonymous`, `free`, or `byok`), `cta` (`register`, `byok`, `more_models`, or `review_key`)                                                                 |
| `ai continue clicked`        | Browser, once per Continuar click the client acts on; a click while one runs and a Retry send none                                                                                         | `tier` (`anonymous`, `free`, or `byok`) when today's quota is known, `stop_reason` (`max_steps`, `token_budget`, or `time_limit`) when the answer's stop reason is known |
| `byok key failed`            | API when a BYOK turn's key is refused by the provider or no longer decrypts                                                                                                                | `source=api`, `provider`, `kind` (`auth`, `credit`, `permission`)                                                                                                        |

Browser anonymous creation is deliberately browser-authoritative so it retains
the browser distinct ID and joins the pre-signup funnel. Registered API events
use the stable database user ID. `shared note viewed` is not emitted when the
viewer is the note's owner; owners opening their own link are not an audience.
Server events carry `actor_type=anonymous` for anonymous sessions; their
distinct ID is the anonymous user ID, not the browser's. `ai quota exhausted`
counts callers, not attempts: retries on a spent quota are not captured again
that day, except while the quota falls back to Postgres, which captures every
refusal.

The insight `AI turn checkpoint rate` (short id `3Txw9e6s`,
<https://us.posthog.com/project/344524/insights/3Txw9e6s>) plots checkpoints per
metered message on the platform tiers, per day: `ai turn checkpoint reached`
without the `byok` tier ÷ `ai quota consumed`. It shows how often copilot turns
stop at a checkpoint the user can continue. Resume segments and refunded turns
still skew the ratio slightly, since neither pairs one checkpoint with one
metered message. Checkpoints are product usage, not failures; turns that end
without an answer alert through the API's daily agent health report instead.

Only identification may set these person properties: `email`, `name`, `role`,
`locale`, and `is_internal`. Email and name are not event properties. Event
names and categorical values are declared once in `@knowtis/shared-types`
(`PRODUCT_EVENT_NAMES` and friends) and both emitters type against them.

## Identity lifecycle

`AnalyticsIdentitySync` mirrors the auth store into PostHog:

- The browser identifies registered users with the database ID, never email,
  and calls `reset()` before the next anonymous context after sign-out, a
  transition to anonymous, or a switch to a different account.
- PostHog persists its identified state across page loads. On the first sync
  of a page load the synchronizer compares that persisted state with the auth
  state and calls `reset()` when PostHog still holds a different or stale
  identified distinct ID, so a new anonymous session never inherits the
  previous account.
- Capture is paused while a transition is in flight. The SDK's automatic
  `$pageleave` is dropped in `before_send` during the pause so it cannot carry
  the previous identity; the transition events themselves (`$identify`,
  `$set`) still pass.
- A failed transition is retried up to three times, one second apart. If the
  budget is exhausted the synchronizer logs a warning, resets PostHog to a
  fresh anonymous identity, registers anonymous context, and resumes capture,
  so a broken identify can never silence the session. Returning to the last
  completed identity also resumes capture immediately.

## Privacy boundary

The browser's final `before_send` boundary sanitizes URL values in event and
person payloads. The only retained first-party path templates are:

- `/notes/:noteId`
- `/s/:shareToken`

It removes every query string and fragment; external referrers keep only their
origin; malformed URL values are dropped. It also removes sensitive
event-property keys and acquisition click identifiers (`gclid`, `fbclid`,
`utm_*`, ...), including the copies posthog-js re-emits as
`$session_entry_*` and `$initial_*` on every event of a session. Person
properties are filtered by an allowlist whether they arrive at the top level
of the payload or nested under `properties.$set` / `properties.$set_once`,
which is the shape the SDK uses once a distinct ID is already identified. Never send note IDs, titles, contents, tags,
collaborator IDs, share or verification tokens, API keys, query strings,
emails, names, prompts, responses, source text, model output, token counts,
or costs. The single exception is `properties.token`, the public browser
project token posthog-js stamps on every event: the capture endpoint
authenticates the batch with it and answers `401 event submitted without an
api_key` when it is missing. Autocapture, heatmaps, and replay stay off in
the client configuration regardless of the PostHog project settings: heatmap
payloads are keyed by the raw page URL (note IDs and query strings included)
and replay snapshots embed hrefs, so `before_send` drops both events outright
rather than filtering them. Router navigation emits manual pageviews.

## Release validation

1. Confirm Vercel owns only the browser variables and Railway `knowtis_app`
   owns only `POSTHOG_HOST` and `POSTHOG_PROJECT_TOKEN`; verify no values are
   copied into source, logs, or this runbook.
2. Confirm `.railway/railway.ts` preserves exactly those two variables for
   `knowtis_app`, not `knowtis-mcp`, then run `railway config plan`. Review the
   plan before any future apply; it must contain no service deletion, domain,
   replica, or deployment change.
3. In production at `https://knowtis.app`, verify one manual `$pageview` after
   a resolved SPA navigation and verify it uses only normalized URLs. Confirm
   the capture request itself answers `200 {"status":"Ok"}` and that the event
   reaches PostHog: a stubbed or unread response hides a rejected batch. Verify
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
    'ai response completed', 'mcp key created', 'ai quota consumed',
    'ai quota exhausted', 'ai turn checkpoint reached', 'ai turn continued',
    'byok key failed', 'ai upgrade cta clicked', 'ai continue clicked')
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
| `AI turn checkpoint rate`                     | Trends insight            | `12353729`                             |
| `AI tiers and copilot health`                 | Dashboard                 | `2165520`                              |
| `AI messages by tier`                         | Trends insight            | `12479824`                             |
| `AI quota exhaustion rate by tier`            | Trends insight            | `12479825`                             |
| `Copilot continue rate`                       | Trends insight            | `12479826`                             |
| `Copilot continuation chain length`           | Trends insight            | `12479827`                             |
| `AI upgrade CTA clicks`                       | Trends insight            | `12479828`                             |
| `BYOK key failures`                           | Trends insight            | `12479829`                             |
| `API operational alerts`                      | Trends insight            | `12479830`                             |
| `API raised an operational alert`             | Insight alert             | `01a100b5-fa3c-0000-3140-0c6518b827f7` |
| `Knowtis API alerts`                          | Incoming webhook source   | not published                          |

PostHog can create custom event definitions before first ingestion, but its
property-definition endpoint can only update properties that already exist in
the taxonomy. Until real production events introduce a custom property, an
update returns `Property definition not found`. Do not send synthetic
production events to work around this. After the first real ingestion,
describe and verify the custom properties listed in the event contract above.
The AI tier events (`ai quota consumed`, `ai quota exhausted`,
`ai turn checkpoint reached`, `ai turn continued`, `byok key failed`,
`ai upgrade cta clicked`) are verified, and their custom properties (`tier`,
`remaining_bucket`, `segment_index`, `stop_reason`, `cta`, `from_tier`,
`provider`, `kind`) are described. `ai continue clicked` is still waiting for its
first real ingestion.

The `AI tiers and copilot health` dashboard follows the same production filters.
`ai turn continued` and `ai turn checkpoint reached` count attempts, and no AI
event carries a conversation id, so the continue rate is an upper bound and
cannot be deduplicated per conversation.

The `Knowtis API alerts` incoming webhook is the production value of the API's
`AI_ALERT_WEBHOOK_URL`. It captures each alert as a personless `ai alert fired`
event (`alert`, `signal`, `rate`, `threshold`, `samples`, `window_hours`,
`provider`, `failures`, `spent_usd`, `limit_usd`, `alerted_at`) and never maps
user ids. The `API raised an operational alert` insight alert checks hourly and
emails its subscribers when any alert other than `webhook.test` fires. Test the
webhook only with `"event": "webhook.test"`.
The webhook's ID is its public ingestion URL, so it lives only in Railway's
`AI_ALERT_WEBHOOK_URL` and in PostHog's data pipelines, never in the
repository.

When verifying these assets, confirm the dashboard contains the six saved
insights listed above and that each remains attached to dashboard `2065684`.
Every insight must retain `environment = production` and exclude
`is_internal = true`. Confirm the activation funnel remains ordered from
`user signed up` through `email verified`, `note created`, `note activated`,
and `note shared`; retention remains anchored on `note activated`; and the AI
and MCP insights retain only their approved categorical breakdowns. Treat URL,
referrer, and country breakdowns as safe only after the privacy checks in this
runbook pass.
