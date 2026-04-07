---
paths:
  - 'apps/notes/**'
---

# React Frontend Rules

## Component Patterns

- All components are functional with hooks. Use named exports: `export function NoteCard() {}`.
- Lazy-load route-level components with `React.lazy()` and wrap in `<Suspense fallback={<LoadingState />}>`.
- Use `forwardRef` when a component needs to expose its DOM ref to parents.
- Memoize components with `React.memo()` only when they receive stable props and re-render is measurable — don't memo everything.

## Hooks

- Custom hooks live in `apps/notes/src/hooks/` with `use` prefix.
- Follow Rules of Hooks strictly: no conditional hooks, no hooks inside loops, hooks at top level only.
- `useEffect`: dependencies must be exhaustive. If an effect runs on mount only, the dependency array must be `[]` with a comment explaining why.
- `useEffect` vs event handlers: if code runs in response to a user action (click, submit), use an event handler — not an effect.
- `useCallback`: wrap callbacks passed to memoized children or used as effect dependencies.
- Stale closures: verify that callbacks capture the correct values. Use refs for values that change frequently but shouldn't trigger re-renders.

## State Management

- **Zustand** for shared/global state: stores live in `apps/notes/src/stores/` with `.store.ts` suffix.
- Store pattern: `create<StoreInterface>((set, get) => ({ ...initialState, action: () => set({ key: value }) }))`.
- **useState** for component-scoped state that doesn't need to be shared.
- Flag prop drilling: if a prop passes through 2+ intermediate components, extract to a Zustand store or context.

## TanStack Router

- File-based routing: route files in `apps/notes/src/routes/`.
- Define routes with `createFileRoute('/path/')({ component: RouteComponent })`.
- Route components must wrap lazy-loaded pages in `<Suspense>`.
- `routeTree.gen.ts` is auto-generated — never edit manually.
- Register router type: `declare module '@tanstack/react-router' { interface Register { router: typeof router } }`.

## TanStack Query (React Query)

- Query key factories are defined in `libs/data-access/*/src/*.hooks.ts`:
  ```typescript
  const notesQueryKeys = {
    all: ['notes'] as const,
    lists: () => [...notesQueryKeys.all, 'list'] as const,
    list: (search?: string) => [...notesQueryKeys.lists(), { search }] as const,
    detail: (id: string) => [...notesQueryKeys.all, 'detail', id] as const,
  } as const;
  ```
- Default `staleTime: 1000 * 60` (1 minute) — set per-query if different.
- Mutations: use `onMutate` for optimistic updates (snapshot + `setQueryData`), `onError` for rollback, `onSettled` for cache invalidation.
- Global 401 handling: `QueryCache.onError` detects `ApiClientError` with status 401 and triggers auth failure.

## Forms

- Use `react-hook-form` with `zodResolver` for all forms.
- Pattern: `useForm<FormData>({ resolver: zodResolver(Schema), defaultValues })`.
- Reset form after successful mutation: `reset(data)` in `onSuccess`.

## Auth

- Auth is managed by `@jovandyaz/auth-react` package with `useAuthStore()` hook.
- Token storage: `createTokenStorage()` singleton — access token in memory, refresh token in HttpOnly cookie.
- Cross-tab sync: `createCrossTabSync()` detects logout in other tabs via `storage` event.
- Anonymous sessions: persisted in localStorage, merged on login/register.

## Security

- Never render unsanitized user input as HTML — XSS risk.
- Always sanitize with DOMPurify or equivalent before any HTML rendering.

## Design

- Mobile-first: write styles for mobile viewport first, add breakpoints for larger screens.
- Test on mobile viewport before considering a component complete.
- Prefer `@knowtis/design-system` components over raw HTML elements (`<Button>` not `<button>`).
