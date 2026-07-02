# Testing standards (Vitest)

Canonical source: `.claude/rules/testing.md` in the knowtis repo.

## Framework

- Runner: **Vitest** (not Jest), configured per project in `vitest.config.ts`. Frontend env `jsdom`, backend `node`.
- DOM matchers via `@testing-library/jest-dom/vitest` setup file.

## Structure

- `describe`/`it` grouped by feature or method; Arrange-Act-Assert inside each test.
- One logical assertion per test (multiple `expect()` calls are fine if they assert the same behavior).
- Names describe behavior, not implementation: `it('should reject expired refresh tokens')`, never `it('test validate method')`.

## Mocking

- `vi.mock('@knowtis/api-client', () => ({ notesApi: { getAll: vi.fn() } }))`; type-safe assertions via `vi.mocked(...)`.
- `vi.clearAllMocks()` in `beforeEach` to prevent pollution.
- Prefer integration tests with real dependencies where feasible (real QueryClient over a mocked one).

## Hooks and components

- `renderHook()` from `@testing-library/react`; wrap provider-dependent hooks in a `wrapper` (QueryClientProvider, Auth).
- `await waitFor(() => expect(result.current.isSuccess).toBe(true))` for async assertions.
- Query by role first (`screen.getByRole('button', { name: 'Save' })`), then text. Avoid `querySelector`, `container`, and test IDs when a semantic query works.
- Test user interactions and visible outcomes, not internal state. No snapshot tests — explicit assertions only.

## Coverage expectations

- Edge cases: empty inputs, boundary values, null/undefined, error responses.
- Error scenarios: network failures, 401/403/404, validation errors.
- Components: loading and error states, not just success.
- Mutations: optimistic update, rollback on error, cache invalidation.

## Assertions

Be specific: `toBe(42)` not `toBeTruthy()`; `toEqual({...})` not `toBeDefined()`; `toHaveLength(3)`; `toThrow(SpecificError)` / `rejects.toThrow()`; DOM: `toBeInTheDocument()`, `toHaveTextContent()`, `toBeVisible()`, `toBeDisabled()`.
