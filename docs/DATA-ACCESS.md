# Data Access Layer

The five `libs/data-access/*` libraries are the frontend's state/API access layer. They wrap the HTTP client in React Query hooks so components never call the API directly. Each library is imported via its `@knowtis/data-access-*` alias (`tsconfig.base.json`).

## Dependency flow

```
app → data-access → api-client → shared
```

A data-access lib (`type:data-access`) may depend on `api-client` and other `type:data-access`/`type:util` libs, but never on an app or a UI lib. Domain types come from `@knowtis/shared-types`; the actual HTTP adapters (`notesApi`, etc.) come from `@knowtis/api-client`.

## Conventions

Every domain follows the same shape:

- **`useXxx` React Query hooks** — `useQuery` for reads, `useMutation` for writes. Mutations invalidate the relevant query keys in `onSuccess`/`onSettled`.
- **`xxxQueryKeys` factory** — a hierarchical const-object key factory (`all` → `lists()`/`list(params)` → `details()`/`detail(id)`), so callers and invalidations share deterministic keys.
- **Co-located Zod schemas** (`*.types.ts`) — for form/input validation where a domain needs it, with inferred types exported alongside.

```ts
export const notesQueryKeys = {
  all: ['notes'] as const,
  lists: () => [...notesQueryKeys.all, 'list'] as const,
  list: (search?: string) => [...notesQueryKeys.lists(), { search }] as const,
  details: () => [...notesQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...notesQueryKeys.details(), id] as const,
} as const;
```

## Domains

| Library                          | Alias                                | Covers                                                                                                                                                            |
| -------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/data-access/notes`         | `@knowtis/data-access-notes`         | CRUD on notes (`useNotes`, `useNote`, `useCreateNote`, `useUpdateNote`, `useDeleteNote`, `useNoteByToken`), image upload (`useUploadImage`), `notesQueryKeys`     |
| `libs/data-access/users`         | `@knowtis/data-access-users`         | Current-user profile (`useUpdateProfile`, `usersQueryKeys`) + `UpdateProfileSchema`                                                                               |
| `libs/data-access/artifacts`     | `@knowtis/data-access-artifacts`     | AI study artifacts: generate/read/delete, flashcard & quiz progress, spaced-repetition (`useDueCards`, `useReviewCard`, `useSubmitQuiz`, …), `artifactsQueryKeys` |
| `libs/data-access/feature-flags` | `@knowtis/data-access-feature-flags` | Feature-flag reads (`useFeatureFlags`, `useFeatureFlag`)                                                                                                          |
| `libs/data-access/mcp-keys`      | `@knowtis/data-access-mcp-keys`      | MCP API keys: list/create/revoke (`useMcpKeys`, `useCreateMcpKey`, `useRevokeMcpKey`), `mcpKeysQueryKeys` + `createMcpKeySchema`                                  |

## Running tests

Run `nx test <lib>` for a single library (e.g. `nx test data-access-notes`), or `nx affected -t test` to test only changed libraries.
