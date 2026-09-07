# Active sharing access: protocol proof

Status: isolated protocol proof for #245 and #246, verified against main
`1aa9426029cba9c48ae4c76d4de7ea0d659653bb` on 2026-09-07. The fixture is not
registered in Nest. Production collaboration, note permissions, migrations,
learning-loop code and UI remain unchanged by this proof.

## Decision

Use PostgreSQL as the authority for a short-lived permission on each document
session. Renew every 1 second; limit waiting for a read to 1 second; expire the
permission 2 seconds after the **start** of that read using a monotonic clock.
An error, timeout, missing permission or changed permission closes the document
connection. Reconnection must authenticate again and obtain the current access.
A delayed response must never extend a closed session or replace a newer
invalidation generation.

The measured objective is removal of write and receive capabilities within
5 seconds after a committed access reduction on a healthy process and local
network, including a lost invalidation notification. This is a bounded
convergence objective, not instantaneous revocation or a formal guarantee for a
blocked event loop or an arbitrarily delayed network.

The supported implementation mechanism is an expiry timer plus synchronous
removal from the Hocuspocus document, guarded inbound handling and guarded sync.
There is no general outgoing Yjs-update interceptor in the installed version.
The proof therefore checks actual provider receipts after removal rather than
assuming that throwing in an inbound hook also stops broadcasts.

## Installed APIs and official guidance

The proof uses Node 24.20.0, Hocuspocus server/provider/Redis extension 4.1.0,
Yjs 13.6.27, application ioredis 5.10.0, postgres.js 3.4.7, PostgreSQL 16 and
Vitest 4.1.0. Hocuspocus Redis has its own ioredis 5.6.1 dependency. Configure
its public host/port options instead of casting an application Redis client
across incompatible dependency types.

Sources consulted on 2026-09-07:

- [Hocuspocus hooks](https://tiptap.dev/docs/hocuspocus/server/hooks): rejected
  authentication and inbound hooks stop the operation. The current page and
  installed source differ in some signatures; use 4.1.0 `connectionConfig`,
  not the older documentation example's `connection.readOnly` during auth.
- [Hocuspocus 4.1.0 Connection source](https://github.com/ueberdosis/hocuspocus/blob/v4.1.0/packages/server/src/Connection.ts)
  and adjacent `ClientConnection.ts`, `MessageReceiver.ts` and `Document.ts`,
  also inspected in the installed package: `close()` removes the connection
  from the document synchronously before sending the protocol close frame.
  Pending messages can still be drained, so they must recheck authorization.
  `beforeSync` is awaited before sync content is applied or a sync response
  is produced.
- [Hocuspocus Redis extension](https://tiptap.dev/docs/hocuspocus/server/extensions/redis):
  Redis propagates document updates; it does not persist them. The page's
  `awaitInitialSyncTimeout` is absent from the installed 4.1.0 configuration
  and is deliberately not used.
- [Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/): delivery can
  be lost permanently. A successful publish cannot establish that remote
  sessions have applied a permission change.
- [PostgreSQL 16 locking](https://www.postgresql.org/docs/16/explicit-locking.html)
  and [statement timeouts](https://www.postgresql.org/docs/16/runtime-config-client.html):
  an exclusive table lock is used to exercise a genuinely blocked read.
  Production integration must also bound server query duration and pool
  occupancy; abandoning a JavaScript promise does not cancel PostgreSQL work.

`ClientConnection` drains queued messages before running `connected`.
Consequently the permission starts in `onAuthenticate`, not `connected`.
Both `beforeHandleMessage` and `beforeSync` validate it. Once a connection is
available, attach its close callback and immediately close any already-expired
session. Set server `readOnly` during authentication; client editing controls
are not an authorization boundary.

A failed initial proposal exposed another race: an editor was downgraded while
`onLoadDocument` was pending, before a `Connection` was attached. Updating the
cached permission left the original writable connection configuration intact,
and one queued Yjs update was accepted. The revised fixture closes sessions on
an access change even while the handshake is still loading. That case now
rejects the queued update.

## Authority and invalidation contract

After the database commit, publish `{ version: 1, noteId }`. An instance uses
that signal to re-read authoritative access, never to grant permission directly.
Coalesce an invalidation arriving during an outstanding read, increment a local
generation and ignore that read's obsolete result. On subscription recovery,
re-read all local sessions. Periodic renewal covers missed events and a crash
between commit and publication.

The proposed production resolver takes the maximum of direct access and a
currently valid link grant, with owner access taking precedence. Removing a
direct permission does not remove a valid link grant; rotating a link does not
remove direct access. A direct viewer who edited through the old link becomes
a viewer when that link is invalidated. Preserve existing explicit
administrative read/edit permissions without making administrators owners or
People managers. Reject effective access `none` before applying a general
public-read CASL rule.

This resolver, actual note snapshots, JWT/token validation, People REST
endpoints and link rotation are subsequent implementation work. The probe's
synthetic identity/access table deliberately represents an already-resolved
permission and does not claim to test those contracts.

A successful mutation response confirms persistence, not acknowledgements from
all sessions. Proposed user copy: “Permisos guardados. Las sesiones abiertas se
actualizarán en unos segundos”. Already downloaded content cannot be recalled;
previously accepted edits are not rolled back.

## Executable evidence

`access-protocol.probe.db.spec.ts` uses real providers, real WebSocket listeners
on OS-assigned loopback ports and disposable PostgreSQL tables. Five cases run
two Hocuspocus servers with independent subscriptions and real Redis document
propagation; a sixth Redis case isolates a stale read on one server. The servers
run in one Node process; independent process failures are not represented.

The suite covers:

- Handshake-only characterization: a revoked client still writes and receives
  content without the proposed renewal mechanism.
- Viewer enforcement against raw Yjs writes, independent of UI controls.
- Revocation without any invalidation message; no writes or broadcasts after
  document removal.
- A downgraded handshake, stale initial read, pending inbound update, a stale
  read completing after invalidation, and read-start-based expiry.
- Real PostgreSQL query failure and a query blocked by an exclusive lock. Both
  remove permission; late completion does not revive it.
- Reconnection after downgrade with read-only enforcement, and denied
  authentication after complete revocation.
- Two-server traffic with delivered, lost and recovered invalidation
  subscriptions, plus SQL read errors and blocked reads. Changes are generated
  every 20 milliseconds; measurements include the latest applied guest update
  and latest guest provider receipt, not only the server close callback.
- Both database traffic cases first establish real writes and receipts, then
  continue traffic through the fault. After recovering readable authority,
  new owner sessions exchange content across Redis while the original sessions
  stay closed, receive no new content and cannot apply further writes. The
  blocked case also waits for the outstanding SQL reads to complete.

Timing starts immediately **before** the committed mutation query. This is a
conservative lower bound on the commit time, so the reported window includes
the database round trip rather than subtracting it. Zero for the last accepted
update/receipt means none occurred after that starting point.

Applied-update timestamps come from the server Y.Doc's synchronous `update`
event after the transaction, not from an authorization hook or a client send.
[The Y.Doc event order](https://docs.yjs.dev/api/y.doc) places this event after
application. Hocuspocus 4.1.0 `Hocuspocus.handleDocumentUpdate` instead starts a
promise chain for `onChange`; the Redis extension's `onChange` awaits publication
before the configured hook runs. An initial blocked-read run exposed that this
later callback could timestamp an already-applied update after expiry. The
fixture now observes the actual Yjs event and retains the strict assertion that
every sampled application precedes its lease expiry. See the installed-version
[hook chain](https://github.com/ueberdosis/hocuspocus/blob/v4.1.0/packages/server/src/Hocuspocus.ts)
and [Redis hook](https://github.com/ueberdosis/hocuspocus/blob/v4.1.0/packages/extension-redis/src/Redis.ts).

The verified local run passed 16 tests. Local timings on 2026-09-07 were:

| Invalidation | Last removal | Last accepted update | Last received content | Reads during window |
| ------------ | -----------: | -------------------: | --------------------: | ------------------: |
| Delivered    |         2 ms |                 0 ms |                  0 ms |                   3 |
| Lost         |       985 ms |               982 ms |                983 ms |                   3 |
| Reconnected  |         4 ms |                 0 ms |                  0 ms |                   3 |

Database-fault timings start immediately before the fault-inducing SQL command,
including its round trip. These are fault boundaries, not permission commits:
the stored guest grant remains `editor` to test that recovery cannot revive an
expired session. A new authenticated session may obtain that still-valid grant.

| Authority fault | Last removal | Last applied update | Last received content | Reads during fault |
| --------------- | -----------: | ------------------: | --------------------: | -----------------: |
| SQL read error  |       954 ms |              951 ms |                952 ms |                  3 |
| Exclusive lock  |     1,938 ms |            1,919 ms |              1,922 ms |                  3 |

All five two-server cases assert a maximum of 5 seconds for removal, applied
updates and received content. Every sampled applied update also precedes its
session's permission expiry. The fault cases check that no guest update is
applied after that server removes the guest. After allowing in-flight frames to
drain, received-update counts remain unchanged through database recovery and
fresh cross-server owner traffic. Extra writes after removal do not reach the
owner, and newly generated owner content does not reach removed guests. Both
fault cases report zero revived original sessions. Disabling renewal with the
existing handshake-only control makes both new cases fail their removal wait.

Steady-state query cost in this unbatched fixture is one read per active
session per second, plus authentication and invalidation/recovery reads. Three
sessions issued three reads during each measured invalidation window. This is
not a production capacity claim. Production work must group reads by note,
bound outstanding queries, coalesce invalidation bursts and measure pool load.

## Running the proof

Use a disposable PostgreSQL database. The fixture creates and drops uniquely
named `sharing_probe_*` tables; it does not require application migrations.
Supply a separate disposable Redis instance to run the six Redis cases. Its
URL must be plain `redis://HOST:PORT` without credentials or a database path.

```sh
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/TEST_DATABASE \
SHARING_PROBE_REDIS_URL=redis://127.0.0.1:REDIS_PORT \
NX_DAEMON=false NX_ISOLATE_PLUGINS=false \
pnpm nx test api \
  --testFile=src/modules/collaboration/__tests__/access-protocol.probe.db.spec.ts \
  --run --skip-nx-cache
```

The existing CI database project runs sequentially and supplies PostgreSQL,
but has no Redis service. Without `SHARING_PROBE_REDIS_URL`, those six cases
are explicitly skipped. A CI pass alone therefore does not establish the
complete distributed proof; running all 16 cases is required before relying
on it. The local verification supplied both services. Providers, Y.Docs,
servers, subscriptions, timers and database clients are closed during teardown;
disposable external services remain owned by the runner.

## Limits and integration gate

The proof supports the lease/close mechanism under the tested conditions. It
does not enable revocation in production. The next integration must repeat
these tests with the real resolver and actual Hocuspocus extension ordering,
then exercise People/rotation through API and browser workflows.

The fault cases exercise unavailable authority through a real SQL error and
read timeout, not a killed database container or a production TCP partition.
The lost-notification case unsubscribes the invalidation consumers while
keeping Redis document propagation alive, allowing receipt cutoff to be
measured. Subscription reconnection is also real. A full Redis outage,
process pauses, saturated database pools, distributed clock behavior and
buffered packets delayed by a remote network remain outside this local proof.
No expiry timer can establish a strict outgoing deadline while its event loop
is blocked. Do not promise instantaneous revocation or a universal 5-second SLA.
