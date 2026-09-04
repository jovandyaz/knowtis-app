# PostHog product analytics design

Date: 2026-09-04

## Objective

Turn the existing pageview-only PostHog installation into privacy-safe product
analytics for the production Notes app. The result must connect anonymous
acquisition to registered users, measure the core note lifecycle, and keep
note content, prompts, share tokens, business identifiers, and URL secrets out
of PostHog.

This change does not enable autocapture, broaden session-replay visibility,
deploy the application, or change product behavior.

## Current state

- `posthog-js` 1.375.0 and `@posthog/react` 1.8.2 are installed.
- The browser sends manual `$pageview` events and `$web_vitals`; autocapture is
  off and replay masks every input and text node.
- PostHog receives literal `/notes/<uuid>` and `/s/<token>` paths.
- The app never calls `identify()` or `reset()`, so production activity is
  anonymous and cannot be joined reliably across registration.
- Registration, email verification, note creation, and note updates already
  emit domain events in the NestJS application.

## Event and property contract

Event names follow PostHog's recommended `[object] [verb]` convention.

| Event                   | Authority                                                                           | Safe event properties                                |
| ----------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `user signed up`        | API auth event                                                                      | `source=api`                                         |
| `email verified`        | API auth event                                                                      | `source=api`, `verification_method`                  |
| `note created`          | API for registered users; browser after confirmed success for anonymous users       | `source`, `actor_type`                               |
| `note activated`        | Browser, first meaningful edit of an initially empty note in that browser lifecycle | `source=editor`, `actor_type`                        |
| `note shared`           | API after a successful link/collaborator share                                      | `source=api`, `share_type`, `permission`             |
| `shared note viewed`    | Browser after the shared note resolves successfully                                 | `source=share_link`, `permission`, `actor_type`      |
| `ai response completed` | Browser when a live assistant/copilot stream completes                              | `source`, `assistant_type`, `action` when applicable |
| `mcp key created`       | API after persistence succeeds                                                      | `source=api`, `scope_level`                          |

Every event also carries `environment`, `app_version`, `actor_type`,
`is_internal`, and `locale`. `is_internal` means the authenticated account has
the existing `admin` role; it does not infer employment from an email domain.

The event API is typed per event. It cannot accept arbitrary properties. The
contract explicitly excludes:

- note IDs, titles, content, tags, and collaborator IDs;
- share tokens, verification tokens, API keys, and query strings;
- emails or names as event properties;
- prompts, responses, source text, model output, token counts, and costs.

Email, name, role, locale, and `is_internal` are allowed only as person
properties during identification of a registered user.

## Browser architecture

`apps/notes/src/lib/analytics/` will own four small responsibilities:

1. A typed event catalog and `captureProductEvent()` adapter.
2. URL normalization and the `before_send` privacy filter.
3. PostHog initialization and production-host eligibility.
4. Identity/super-property synchronization from the auth store.

The existing `posthog.ts` remains the package-root-facing entry point or is
reduced to re-exports so callers do not import internal files directly.

### Initialization and environment isolation

The production project is enabled only when all conditions hold:

- a project token is configured;
- the Vite build is not development;
- `window.location.hostname` is exactly `knowtis.app`.

Preview, localhost, tests, and custom hosts therefore cannot contaminate the
production project even if they inherit its Vercel environment variables.
`app_version` is injected at build time from `VERCEL_GIT_COMMIT_SHA`, falling
back to the root package version (`0.1.0`).

Autocapture remains off. Pageviews remain router-driven so each resolved SPA
navigation produces one event.

### URL privacy

Before any event leaves the browser, `before_send` sanitizes URL-bearing keys
in `properties`, `$set`, and `$set_once`:

- `/notes/<anything>` becomes `/notes/:noteId`;
- `/s/<anything>` becomes `/s/:shareToken`;
- query strings and fragments are removed from every first-party URL;
- external referrers retain only their origin, which preserves acquisition
  source without leaking an external path or query;
- malformed URL values are removed.

The filter also drops denylisted sensitive event-property keys. Unit tests use
real PostHog `CaptureResult` shapes, including initial URL person properties,
so future SDK defaults cannot silently reintroduce literal tokens.

### Identity lifecycle

An `AnalyticsIdentitySync` component inside `AuthProvider` observes auth state:

- anonymous/guest state keeps PostHog's browser-generated distinct ID and
  registers anonymous common properties;
- a registered state calls `identify(user.id, personProperties)`, merging the
  pre-signup browser journey into the stable database user ID;
- profile changes refresh allowed person and common properties;
- any registered-to-signed-out or registered-to-anonymous transition calls
  `reset()` before registering the next anonymous context.

The stable database ID is the only identified distinct ID. Email is never used
as an identifier.

### UX event placement

- Anonymous note creation is captured only after `mutateAsync()` resolves.
  Registered creation is not duplicated in the browser because the API owns it.
- `note activated` is emitted from `NoteEditorPage` only when a note was loaded
  empty and its editor first becomes non-trivial. A per-mounted-note ref prevents
  keystroke events; IDs are used only in memory and are never sent.
- `shared note viewed` is emitted once after the token lookup returns usable
  data, never on loading, 404, or retry failure.
- Both the completion assistant and agent copilot emit
  `ai response completed` from their existing successful `onDone` callbacks.
  Ghost-text completion is included through the same adapter. Aborts and errors
  are not successes.

## API architecture

Add `posthog-node` 5.51.6 (current registry version; Node requirement
`^20.20.0 || >=22.22.0`) and an `AnalyticsModule` under
`apps/api/src/modules/analytics/`.

The repository's `.nvmrc` and `.node-version` will be pinned from the floating
`22` value to Node `22.23.2`, the current Node 22 LTS release. This satisfies the
SDK floor while staying on the repository's existing major line; the root
`engines.node` remains `22.x`.

The module exposes an app-local `ProductAnalytics` service rather than the raw
SDK. It:

- initializes only for `NODE_ENV=production` with
  `POSTHOG_PROJECT_TOKEN` configured;
- uses `POSTHOG_HOST`, defaulting to `https://us.i.posthog.com`;
- adds server common properties and accepts only the typed safe event union;
- never blocks or changes a successful command when analytics is unavailable;
- flushes the SDK queue in `onApplicationShutdown()`.

No Personal API Key is needed at runtime. The project token is treated as
configuration and still kept in environment variables.

An async `ProductAnalyticsListener` consumes existing auth/note domain events.
It fetches the user only when actor metadata is needed, maps role/anonymous
state to common properties, and never forwards domain event payloads wholesale.
New small domain events announce successful note sharing and MCP-key creation.
The update handler emits `note shared` only when link exposure actually widens,
not when the same setting is saved again.

Registered server events use the authenticated database user ID. Anonymous
note creation stays browser-authoritative-after-success so it keeps the
PostHog browser ID and can participate in pre-signup funnels; sending the
backend anonymous-account UUID would split one visitor into two identities.

The API environment schema/example gain `POSTHOG_PROJECT_TOKEN` and
`POSTHOG_HOST`. `.railway/railway.ts` retains both with `preserve()`. This turn
will only author and plan IaC; it will not apply Railway state or deploy.

## PostHog project configuration

After code verification, use the connected PostHog MCP to create or update:

- event/property descriptions matching this contract;
- a “Knowtis product activity” dashboard;
- weekly active users from normalized pageviews, excluding `is_internal`;
- acquisition by referrer origin and country;
- signup → verification → note creation → activation → sharing funnel;
- retention anchored on `note activated`;
- AI and MCP adoption trends.

Saved insights will filter `environment=production`. No production data or
schema is deleted, and existing raw historical paths remain historical.

## Failure behavior and privacy guarantees

- Missing configuration results in a no-op client, not an application boot
  failure.
- SDK capture failures are logged without event payloads and do not fail the
  product command.
- Analytics listeners never receive note content unless an existing domain
  event already contains it; they select fields explicitly and do not log it.
- Replay remains fully masked (`maskAllInputs` and `maskTextSelector='*'`).
- Autocapture remains disabled.
- Tests assert every emitted payload and the absence of sensitive keys/values.

## Verification

Implementation follows TDD at the narrow boundary first, then runs:

1. analytics/privacy/identity unit tests;
2. affected frontend and API tests;
3. affected lint and typecheck targets;
4. production builds for `notes` and `api`;
5. `railway config plan` for the two preserved variables only;
6. a PostHog MCP read-back of saved dashboard assets.

The current machine is on Node 26 although the repository pins Node 22. The
clean baseline therefore has 100 frontend jsdom failures caused by unavailable
`localStorage`; API tests that bind a local port also fail inside the sandbox
with `EPERM`. Targeted tests that do not depend on those constraints remain
usable, and final verification must be repeated with Node 22 and permission to
bind loopback ports before claiming the full suite passes.

## Evidence and decisions

Decision: keep browser identification and use stable database IDs.
Project evidence: `apps/notes/src/providers/AppProviders.tsx`,
`packages/auth-react/src/lib/types.ts`.
Official source: PostHog JS identification documentation,
https://posthog.com/docs/product-analytics/identify.
Tradeoff: email/name stay useful as person properties without becoming mutable
identifiers or event dimensions.
Verification: identity transition tests for identify, update, and reset.

Decision: sanitize every SDK event at `before_send` and keep manual SPA
pageviews.
Project evidence: `apps/notes/src/lib/posthog.ts`, `apps/notes/src/main.tsx`.
Official sources: PostHog JS configuration and SPA pageview guidance,
https://posthog.com/docs/libraries/js/config and
https://posthog.com/tutorials/single-page-app-pageviews.
Tradeoff: route analytics stay useful while high-cardinality IDs and secrets are
removed at the final egress boundary.
Verification: table-driven URL and `CaptureResult` tests.

Decision: wrap `posthog-node` behind a no-op-safe Nest module and domain-event
listener.
Project evidence: `EventEmitterModule`, auth events, `NoteCreatedEvent`, and
existing `@OnEvent` listeners.
Official sources: PostHog Node and NestJS documentation,
https://posthog.com/docs/libraries/node and
https://posthog.com/docs/libraries/nestjs.
Tradeoff: product commands stay independent of analytics availability, while
successful backend events remain authoritative.
Verification: mocked client/listener tests plus graceful-shutdown test.

Decision: pin the existing Node 22 tool files to 22.23.2.
Project evidence: `.nvmrc`, `.node-version`, and `package.json#engines` all
select Node 22 today.
Official source: Node's current Node 22 LTS download listing,
https://nodejs.org/en/download/archive/v22.
Tradeoff: the SDK's `>=22.22.0` floor becomes reproducible without a major
runtime migration.
Verification: install, tests, typecheck, and builds report Node 22.23.2.

Decision: keep replay fully masked and autocapture disabled.
Project evidence: current `buildPostHogOptions()` and its tests.
Official source: PostHog replay privacy documentation,
https://posthog.com/docs/session-replay/privacy.
Tradeoff: interaction detail is lower, but notes and AI data cannot be collected
accidentally from DOM text.
Verification: immutable configuration tests and browser payload inspection.
