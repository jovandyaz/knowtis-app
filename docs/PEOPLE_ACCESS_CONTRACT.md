# People access contract

People management uses exact normalized email (`trim().toLowerCase()`) for existing, non-anonymous accounts. The owner is projected first with permission `owner`; direct collaborators follow by name, email and ID. Owner entries are never stored as direct grants. No invitation emails or pending-account records are created.

| Request                                  | Body                              | Response           |
| ---------------------------------------- | --------------------------------- | ------------------ |
| `GET /api/v1/notes/:id/collaborators`    | —                                 | `200 NotePerson[]` |
| `POST /api/v1/notes/:id/share`           | `{ email, permission: 'viewer' }` | `201 NotePerson`   |
| `DELETE /api/v1/notes/:id/share/:userId` | —                                 | `204`, no body     |

`NotePerson` is `{ user: { id, name, email, avatarUrl: string | null }, permission: 'owner' | 'viewer' | 'editor' }`. The TypeScript client methods are `getPeople`, `upsertPerson` and `revokePerson` (`Promise<void>`). MCP `share-note` accepts `email`; `get-collaborators` returns the same People projection inside its `collaborators` envelope.

The owner and direct editors with `editorsCanShare` can list and change other non-owner people. A link editor cannot manage People. Administrator read/write privileges do not add People management rights. Authorization precedes recipient lookup; absent, anonymous, owner and self targets return the same `422 PERSON_NOT_ADDABLE` result. The current identity-verification flag still controls verification. When enabled, adding access or upgrading viewer to editor requires verification. Listing, revoking, retaining and reducing direct permissions remain available without verification. A conditional update prevents an unverified narrowing from recreating a concurrently revoked grant or restoring editing after a concurrent downgrade.

Copilot can propose either a reduction or an increase in access. Proposals remain inert until user confirmation; the canonical sharing handler rechecks management rights and requires verification only for new or wider access at execution. A proposal cannot bypass that check.

Effective collaboration access is owner, otherwise the strongest of a direct grant and a valid open-link grant. Restricted links grant nothing. A stale link cannot grant public read access by itself; explicit `none` is rejected before CASL's general public-read rule. Administrator read/write remains supported. The access snapshot comes from one PostgreSQL query and contains only authorization fields. Share tokens are SHA-256 digests with the `knowtis:share-link:v1\0` domain prefix. The People projection is never an authorization input.

This delivery changes the handshake. It does not revalidate sessions that are already open; the subsequent live-session integration must wire authoritative leases and repeat protocol acceptance. A REST response confirms database persistence, not acknowledgement by every active socket. Removing direct access leaves valid link-derived access intact.

## Compatibility and rollout

This is an intentional breaking API and MCP contract change. UUID share request bodies are rejected with 400; the old nested permission object and flattened MCP collaborator response are removed. No dual input format or compatibility shim exists.

Deploying API and MCP independently creates a mixed-version interval in which old clients can fail to share. The existing CI deploy jobs do not provide an atomic cutover. Do not treat their concurrent completion as safe rollout evidence. Release this API/MCP pair during a coordinated sharing maintenance window: pause access-management requests at the ingress, deploy matching API and MCP revisions, ensure every API instance serves the email contract, reconnect MCP clients so they reload tool schemas, verify share/list/revoke through the released paths, then reopen sharing. Existing Notes clients have no caller of the removed UUID client methods in this baseline; People UI is a later dependent delivery. Third-party callers must migrate their payloads and projections before reopening.

Rollback uses the same maintenance boundary and rolls back API and MCP together. There is no schema migration in this delivery: existing direct permission rows are compatible with either release. Preserve data changes made during the release; rollback does not undo sharing decisions. Live-session revocation guarantees must not be announced until their separate integration and acceptance tests pass.

## Primary references checked 2026-09-07

- [NestJS 11 ValidationPipe](https://docs.nestjs.com/techniques/validation): concrete DTOs, explicit transformation, whitelist and rejection of unknown fields. Email transformation runs before validation.
- [NestJS testing](https://docs.nestjs.com/fundamentals/testing): exercise an actual Nest application and HTTP transport, with lifecycle cleanup.
- [CASL guide](https://casl.js.org/v6/en/guide/intro/): conditions constrain resource abilities; application token possession is resolved before constructing the note's CASL grants. Installed CASL is 6.8.x.
- [Drizzle joins](https://orm.drizzle.team/docs/joins), [set operations](https://orm.drizzle.team/docs/set-operations) and [upserts](https://orm.drizzle.team/docs/insert): compose the owner/direct People projection with typed selects, joins, `unionAll` and an ordered subquery in one statement; use parameterized expressions and conflict handling against the existing note/user unique index. Installed Drizzle is 0.45.2.
- [PostgreSQL 16 Read Committed](https://www.postgresql.org/docs/16/transaction-iso.html): each query sees a statement snapshot; conditional updates re-evaluate the predicate after concurrent row changes. A single snapshot query avoids separate note/grant read skew.
- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.5): 204 has no response content; the client must not promise a JSON acknowledgement. POST is explicitly documented as 201 for this endpoint.

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): least privilege, deny by default, and check authorization at the request boundary. Direct management and token-derived read/edit are separate capabilities.
- [Vite dependency deduplication](https://vite.dev/config/shared-options.html#resolve-dedupe) and [unplugin-swc](https://github.com/unplugin/unplugin-swc): the API test runner uses the API tsconfig for decorator metadata and a single Nest/Passport/JWT copy. This avoids a package peer-context `HttpException` identity mismatch that otherwise turned an actual 401 into 500 inside Vitest; the HTTP suite uses production guards without overrides.

- [AI SDK tool execution approval](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-execution-approval): sensitive effects require user approval. The existing Copilot proposal/confirmation mechanism retains that boundary; constructing a proposal grants no access.
