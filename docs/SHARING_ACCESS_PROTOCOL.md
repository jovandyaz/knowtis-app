# Active note access protocol

This runtime uses PostgreSQL primary as the authority for each collaboration
session. Redis requests rereads; it never grants permission. The HTTP response
confirms the access write, not acknowledgments from every active session.

## Enforcement and resource bounds

`AccessRevalidationService` groups reads by note and process. It renews every
1 second, gives the caller a 1-second read deadline, and expires authorization
2 seconds after the monotonic start of the read. A delayed or superseded result
cannot extend a lease. Invalidation increments a generation and coalesces any
additional event into the next read. Events carry no access verdict.

Every authenticated context owns a lease before Hocuspocus loads its document.
A context awaiting connection registration retains its initial expiry; it cannot
renew indefinitely after failed or abandoned hydration. Registered sessions
renew only while their effective capability remains identical. A changed grant,
a missing note, unavailable authority or expiry closes that document connection.
Closing is terminal for that lease. Reauthentication creates a separate lease.

Final configured `beforeHandleMessage` and `beforeSync` hooks check the lease
after awaited extension work. A 50 ms process scheduler closes idle recipients,
which removes them synchronously from Hocuspocus broadcasts. The existing JWT
expiry timer and rejection of MCP credentials remain in place. Admin content
access remains editor-capable without manufacturing ownership; deletion denies
admin as well. Actual ownership takes precedence.

The dedicated access-read pool has two PostgreSQL connections, a 1-second
connection timeout, a 900 ms server statement timeout and `read-write` primary
selection. URL `statement_timeout`, `options` and `application_name` cannot
weaken its session defaults. The ordinary application pool is unchanged. The
snapshot remains one LEFT JOIN statement, so note and direct grants come from
one PostgreSQL statement snapshot.

Application admission permits at most two underlying SQL operations and 64
queued notes per process. A full or expired queue fails closed. Events do not
create new queued promises. Crucially, caller timeout **does not release SQL
admission**: the slot stays occupied until the underlying query resolves or
rejects. A permanently stalled transport can exhaust those two slots, while
sessions expire; this version deliberately does not replace the pool behind an
unsettled query. Recovery requires transport recovery or process restart.

The scheduler and invalidation clients are lifecycle-owned. Note state is
removed when no session or unfinished read owns it. Shutdown closes leases,
clears the scheduler/subscription retries, disconnects owned Redis clients and
ends the owned SQL pool with a 1-second teardown timeout. Diagnostics expose
active/peak reads, current/peak queued notes, coalesced invalidations, expired
sessions, completed reads and cumulative SQL latency without identity labels.
Pool teardown logs contain operation name and duration only.

## Invalidation and effective permissions

Share/upsert, revoke, link-setting updates and soft deletion emit
`NoteAccessChangedEvent` after the relevant write succeeds. Updates emit before
later tag operations, which can fail independently. A synchronous emitter error
cannot turn a committed access write into a failed operation. The listener runs
local invalidation independently from Redis publication. Periodic primary
rereads cover missing events, process death between commit and publication, and
unavailable Redis.

The dedicated channel is `knowtis-collab:access-invalidations:v1`. Separate
publisher/subscriber clients validate a payload of at most 256 bytes with exact
shape `{ version: 1, noteId: UUID }`. Reconnection explicitly resubscribes and
then rereads all locally active notes. No permission, email, token, fingerprint
or content travels in this event. Publication uses bounded command/connect
waits with its offline queue disabled.

The effective permission is owner, otherwise the strongest valid direct/link
grant. A direct editor survives token rotation; a direct viewer editing through
a link returns to viewer after that token becomes invalid. Removing a direct
grant does not revoke an independently valid link. An `editorsCanShare` change
does not change document read/write capability.

## Client recovery

Hocuspocus 4.1.0 document CLOSE transmits only a reason: its provider synthesizes
code 1000, and a physical WebSocket need not close. Server/client share stable
`Note access changed`, `Note access unavailable` and `Token expired` reasons.
Physical 4403 and 4401 are also recognized.

An access close immediately marks the editor readonly/unsynced and invalidates
the notes query family, including detail, share-route, People, sharing authority,
lists and counts. The hook keeps its existing provider, Y.Doc and Awareness. On
the open transport it calls `sendToken()`,
then restarts sync after a successful authentication verdict. Duplicate close
callbacks share one recovery attempt. It allows at most three attempts, with
2-second deadlines through authentication and synchronization, with bounded
backoff; only successful sync clears the deadline and resets that budget.
Transient exhaustion disconnects without clearing local state or logging
out. FORBIDDEN/NOTE_NOT_FOUND stops retries and renders access lost. Credential
expiry uses the existing judged-refresh policy; only rejected/exhausted
credentials end the user session. Cached query reconciliation is UI behavior;
the server lease enforces authorization independently.

The shared-link page retains a previously loaded editor through recoverable
background HTTP failures and offers an inline retry. A fresh viewer permission
or readonly authentication keeps the same collaboration session, now readonly.
Terminal HTTP 401/403/404 still removes the editor even if the query retains
cached data. A successful authentication without synchronization cannot leave
recovery pending indefinitely: the same attempt deadline remains active.

## Executed integration evidence

Local acceptance on 2026-09-07 used Node 24.20.0, Hocuspocus server/provider and
Redis extension 4.1.0, ioredis 5.10.0, postgres.js 3.4.7, Drizzle 0.45.2,
PostgreSQL 16, Redis 7 and Vitest 4.1.0. Each case used migrated disposable
application tables, real UsersService/JWT/snapshot/persistence implementations,
two real Hocuspocus servers where distribution matters, and real providers.

Continuous traffic writes from guests and broadcasts from an owner every
20 ms. Application timestamps come from synchronous server Y.Doc `update`
events; receipt timestamps come from provider-origin Y.Doc updates. They are
not timestamps from `beforeSync` or asynchronous configured `onChange` hooks,
which can include Redis publication latency. Measurement starts before the
mutation/fault SQL round trip, conservatively including commit latency.

Representative measured latest removal/application/receipt boundaries:

| Scenario                                  | Latest boundary |
| ----------------------------------------- | --------------: |
| Delivered invalidation                    |           13 ms |
| Lost publication                          |          888 ms |
| Subscriber killed and resubscribed        |          116 ms |
| Child emitter SIGKILL after SQL commit    |          895 ms |
| Real SQL read error                       |          896 ms |
| Exclusive lock / server statement timeout |        1,816 ms |
| Paused authority TCP transport            |        1,913 ms |

All cases enforce the 5-second measured objective. After removal, additional
writes do not apply, receipts stop, and recovered authority never revives the
original lease. New authorized sessions can reconnect. A downgrade on the same
provider reauthenticates readonly, and persisted Yjs state excludes the denied
write. Tests also cover token/direct grant combinations, soft deletion,
duplicate events, slow shared hydration, and an awaited sync extension.

The 100-note saturated-pool case observed two actual blocked backend queries,
a peak of two admitted reads and 64 queued notes. Pending callers expired,
queued work was removed, and SQL admission remained occupied until settlement.
The controlled TCP fault paused owned proxy sockets rather than substituting a
mock repository; admission remained held through the pause, then recovered.
The owned pool test reads `SHOW statement_timeout`, attempts `pg_sleep(2)`,
terminates its own backend, and checks session defaults after reconnect.

The negative control disables renewal and message guards only in the test
fixture: the lost-publication case then fails its 5-second removal wait.
Normal acceptance must run without `SHARING_ACCESS_NEGATIVE_CONTROL`.

```sh
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/DISPOSABLE_DATABASE \
REDIS_URL=redis://127.0.0.1:REDIS_PORT \
NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_PARALLEL=1 VITEST_MAX_WORKERS=2 \
pnpm nx test api \
  --testFile=src/modules/collaboration/access-revalidation.redis.db.spec.ts \
  --run --skip-nx-cache
```

The file ends in `.db.spec.ts` so Nx/Vitest routes it into the sequential database
project. Missing database or Redis URLs fail the acceptance suite rather than
silently skipping its cases. CI provisions both services. No migrations change.

## Limits

Five seconds is a measured convergence objective on healthy processes/local
network, not instantaneous revocation, distributed acknowledgment or a universal
SLA. The two collaboration servers in these tests run in one Node process; the
killed emitter is a separate real child process. SQL errors, locks and a paused
owned TCP proxy are tested; a killed production database, arbitrary distributed
packet delay and a stalled Node event loop are not claimed. Stock Hocuspocus can
send Awareness in its connection constructor before `connected`; these hooks do
not claim to suppress every Awareness frame in that narrow window. Already
received content and previously accepted edits cannot be recovered or undone.
The [browser acceptance suite](SHARING_E2E.md) adds two independent API
processes, real HTTP-authenticated browser sessions, and controlled Redis/SQL
faults. Its measurements supplement these server-level tests; both suites and
independent review remain release gates.

## Primary sources and decisions

Consulted 2026-09-07; installed-version source resolves documentation ambiguity.

- [Hocuspocus 4.1.0 ClientConnection](https://github.com/ueberdosis/hocuspocus/blob/v4.1.0/packages/server/src/ClientConnection.ts): queued frames and construction precede `connected`.
- [Hocuspocus 4.1.0 MessageReceiver](https://github.com/ueberdosis/hocuspocus/blob/v4.1.0/packages/server/src/MessageReceiver.ts) and [hook reference](https://tiptap.dev/docs/hocuspocus/server/hooks): installed `beforeSync` is awaited, so the configured guard must run last.
- [Provider 4.1.0](https://github.com/ueberdosis/hocuspocus/blob/v4.1.0/packages/provider/src/HocuspocusProvider.ts) and [CLOSE decoder](https://github.com/ueberdosis/hocuspocus/blob/v4.1.0/packages/provider/src/MessageReceiver.ts): preserve provider/document state and explicitly reauthenticate document closes.
- [PostgreSQL 16 statement snapshots](https://www.postgresql.org/docs/16/transaction-iso.html), [timeout scope](https://www.postgresql.org/docs/16/runtime-config-client.html), and [postgres.js 3.4.7](https://github.com/porsager/postgres/blob/v3.4.7/README.md): one primary statement, dedicated bounded pool, separate caller deadline/admission lifetime.
- [Redis Pub/Sub semantics](https://redis.io/docs/latest/develop/pubsub/) and [ioredis 5.10.0](https://github.com/redis/ioredis/blob/v5.10.0/README.md): delivery is lossy; subscription recovery requests primary rereads.
- [Nest event handling](https://docs.nestjs.com/techniques/events): handler events reach the local listener across REST/MCP/application entrypoints.
- [TanStack Query invalidation](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient) and [disabled queries](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries): reconcile active detail/share-route queries; cached metadata is not authorization.
- [Node 24 monotonic time](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html#performancenow) and [Y.Doc event order](https://docs.yjs.dev/api/y.doc): measure process-local read starts and actual applied/received updates.

## Protocol probe

`apps/api/src/modules/collaboration/__tests__/access-protocol.probe.db.spec.ts`
probes the lease/close mechanism in isolation. It needs a disposable PostgreSQL
database: its fixture creates and drops uniquely named `sharing_probe_*` tables
and requires no application migrations. Six of its cases additionally need a
separate disposable Redis instance whose URL is plain `redis://HOST:PORT`,
without credentials or a database path.

```sh
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/TEST_DATABASE \
SHARING_PROBE_REDIS_URL=redis://127.0.0.1:REDIS_PORT \
NX_DAEMON=false NX_ISOLATE_PLUGINS=false \
pnpm nx test api \
  --testFile=src/modules/collaboration/__tests__/access-protocol.probe.db.spec.ts \
  --run --skip-nx-cache
```

The sequential CI database project supplies PostgreSQL but no Redis service, so
those six cases skip explicitly when `SHARING_PROBE_REDIS_URL` is absent. A CI
pass alone therefore does not establish the complete distributed proof; all 16
cases must run before relying on it. Providers, Y.Docs, servers, subscriptions,
timers and database clients close during teardown; disposable external services
stay owned by the runner.

The probe reaches unavailable authority through a real SQL error and read
timeout, not a killed database container or a production TCP partition. Its
lost-notification case unsubscribes the invalidation consumers while keeping
Redis document propagation alive, so receipt cutoff stays measurable, and
subscription reconnection is real. A full Redis outage, process pauses,
saturated database pools, distributed clock behavior and buffered packets
delayed by a remote network stay outside this probe. No expiry timer can hold a
strict outgoing deadline while its event loop is blocked.
