# Sharing acceptance

`notes-e2e` exercises the sharing API and production Notes bundle with Chromium,
two independent API processes, PostgreSQL 16 and Redis 7. It uses the real login,
anonymous-session, cookie, JWT, authorization and Hocuspocus paths. Test accounts
are verified in the disposable database; verification and throttling stay enabled.

## Run locally

Use the repository's Node 24 and pnpm versions, with Docker running:

```sh
pnpm exec playwright install chromium
NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx e2e notes-e2e --skip-nx-cache
```

An installed Chrome can be selected with `SHARING_E2E_BROWSER_CHANNEL=chrome`.
The target does not accept cached success or an empty test selection. It stops
after the first failure and does not retry failed tests or sharing mutations.
One worker shares four HTTP-authenticated test accounts and one real anonymous
session, avoiding repeated logins that would exceed the normal rate limit.
Every scenario creates a separate note. Browser routes used for an intentional
failure are removed in `finally` blocks.

Setup checks that ports 3373, 3374, 4273, 5573 and 6573 are free before doing work.
It rejects local dotenv files in the workspace root and API, Notes and E2E
project directories, and disables Nx dotenv loading for child tasks. Example
files are allowed; local files are never renamed, removed or read by the guard.
It creates a uniquely named Compose project, generates disposable authentication
secrets, migrates its own database, builds API and Notes in production mode without
reading or writing the Nx cache, and serves the built frontend with Vite preview. The build explicitly selects
WebSocket collaboration; browser assertions confirm connections to both APIs.
The API runs with test-mode cookie settings for loopback HTTP. Normal guards,
session validation and authorization remain active. No existing development
server, database, environment file or production credential is reused.

Teardown stops only the child process groups and Compose project created by this
run. An occupied port fails setup; the harness never kills an unrelated process.
Run the target in an isolated worktree because its production build writes `dist`.

## Scenarios and evidence

- Owner adds a viewer, promotes and demotes access while the recipient keeps the
  editor open, then revokes access. Native Hocuspocus clients attempt writes beyond
  readonly UI controls and verify accepted traffic before the reduction.
- Link rotation invalidates the old REST URL and handshake, closes old-link
  sessions, preserves direct editor access, and reduces a direct viewer's former
  link-based editing permission. Pausing and resuming preserves only the new link.
- The existing shared-note artifact-list boundary is read with an empty fixture;
  no artifact generation, study workflow or download is exercised.
- A browser loses the rotation response after the real HTTP request commits.
  Reconciliation shows the current link and does not issue a second rotation.
- Redis is stopped in the owned Compose project while two API processes continue
  reading PostgreSQL. PostgreSQL is separately paused to stall actual authority
  reads; expired sessions cannot revive after the database resumes. New authorized
  sessions must recover.
- English desktop and Spanish mobile runs preserve drafts and the mounted editor
  through a temporary access-refetch failure, retry successfully, and check focus,
  dialog bounds and unhandled browser errors.

Timing begins before the fault command or mutation. Attachments separately report
document closure, the last received update, server acknowledgements accepting
updates, and application of guest keys in authorized replicas, with a five-second
acceptance bound. Server acknowledgement receipt is an upper bound on application
time; it is not direct server Y.Doc instrumentation. The API integration suite
provides that additional instrumentation. Active traffic and positive round trips
prevent disconnected observers from certifying rejection. These are measurements
on healthy test processes, not an instantaneous
revocation guarantee or an acknowledgement from every production session.
Previously downloaded content and already accepted edits cannot be recalled.
Browser network failures and Docker pause/stop are controlled test faults; they do
not cover every production partition or a blocked JavaScript event loop.

The HTML report persists success screenshots and timing attachments under
`dist/.playwright/apps/notes-e2e/report`. Playwright writes failure traces under
`dist/.playwright/apps/notes-e2e`. Private service logs live under
`dist/.playwright/sharing-runtime`; inspect them locally when setup fails. Traces
can contain disposable test-session credentials. CI retains the Playwright
evidence for seven days and does not upload the private service-log directory.

## Technical references

The harness follows the installed Nx 22.3.3 Playwright generator and executor,
with explicit uncached execution and an independently managed runtime:
[Nx Playwright](https://nx.dev/technologies/test-tools/playwright/introduction),
[Playwright fixtures](https://playwright.dev/docs/test-fixtures),
[authentication](https://playwright.dev/docs/auth),
[global setup and teardown](https://playwright.dev/docs/test-global-setup-teardown),
[Docker Compose pause](https://docs.docker.com/reference/cli/docker/compose/pause/),
and [Hocuspocus provider configuration](https://tiptap.dev/docs/hocuspocus/provider/configuration).
The [provider event API](https://tiptap.dev/docs/hocuspocus/provider/events) and
installed 4.1.0 implementation determine the native message observer: it binds
to the document provider after construction, avoiding transport callbacks with
a different payload.
