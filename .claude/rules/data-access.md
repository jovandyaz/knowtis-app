---
paths:
  - 'libs/data-access/**'
  - 'libs/api-client/**'
---

# Data Access & API Client Rules

## Query Key Factories

- Define query keys as const objects with hierarchical factory functions:
  ```typescript
  export const xQueryKeys = {
    all: ['x'] as const,
    lists: () => [...xQueryKeys.all, 'list'] as const,
    list: (params?: Params) => [...xQueryKeys.lists(), params] as const,
    details: () => [...xQueryKeys.all, 'detail'] as const,
    detail: (id: string) => [...xQueryKeys.details(), id] as const,
  } as const;
  ```
- Query keys must be deterministic — same input produces same key. Never include timestamps or random values.

## Query Hooks

- Use `useQuery` with explicit `queryKey` and `queryFn`.
- Set `staleTime` per query based on data freshness needs (default: `1000 * 60`).
- Return the full query result object — don't destructure and re-wrap.

## Mutation Hooks

- Use `useMutation` with these callbacks:
  - `onMutate`: snapshot current cache, apply optimistic update via `queryClient.setQueryData()`.
  - `onError`: rollback to snapshot from `onMutate` context.
  - `onSettled`: invalidate affected queries via `queryClient.invalidateQueries()` regardless of success/failure.
- Optimistic updates must always have rollback logic — never update cache without a recovery path.

## Zod Schemas

- Define Zod schemas that match the API contract exactly.
- Use schemas for runtime validation of API responses when data shape is critical.
- Export inferred types: `export type Note = z.infer<typeof NoteSchema>;`.

## API Adapters (`libs/api-client/`)

- API adapters are plain objects with async methods: `notesApi.getAll()`, `notesApi.create(input)`.
- Each method calls `httpClient.get/post/put/patch/delete` and returns the typed response.
- URL query parameters: build with `encodeURIComponent()`, never interpolate raw user input.

## HTTP Client

- Bearer token auth: `Authorization: Bearer ${token}` header added automatically.
- Credentials: `withCredentials: true` for cross-origin cookie support (refresh tokens).
- 401 handling: automatic token refresh + request retry. On final failure, triggers logout.
- Error class: `ApiClientError` with `status`, `message`, and `data` properties. Use `ApiClientError.isApiClientError()` for type narrowing.

## Error Handling

- Never silently swallow API errors. Surface errors to the user via toast notifications or error states.
- Query-level errors are handled by React Query's `error` state — ensure components render error UI.
- Mutation errors: show user-facing message via `toast.error()` or inline form errors.
