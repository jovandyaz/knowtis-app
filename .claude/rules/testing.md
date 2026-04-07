---
paths:
  - '**/*.spec.ts'
  - '**/*.spec.tsx'
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '**/vitest.config.ts'
---

# Testing Rules

## Framework

- Test runner: **Vitest** (not Jest). Config per project: `vitest.config.ts`.
- Frontend test environment: `jsdom`. Backend: `node` (default).
- Setup file for DOM tests: `@testing-library/jest-dom/vitest` (adds DOM matchers like `toBeInTheDocument()`).

## Test Structure

- Use `describe` / `it` blocks. Group by feature or method under test.
- Arrange-Act-Assert pattern in each test.
- One logical assertion per test — multiple `expect()` calls are fine if they assert the same behavior.
- Test names must describe behavior, not implementation:

  ```typescript
  // GOOD
  it('should reject expired refresh tokens', ...)
  it('should return 404 when note does not exist', ...)

  // BAD
  it('test validate method', ...)
  it('should call repository', ...)
  ```

## Mocking

- Module mocking: `vi.mock('@knowtis/api-client', () => ({ notesApi: { getAll: vi.fn() } }))`.
- Type-safe mock assertions: `vi.mocked(notesApi.getAll).mockResolvedValue(data)`.
- Spy functions: `vi.fn()` for inline spies.
- Reset mocks: `vi.clearAllMocks()` in `beforeEach` to prevent test pollution.
- Prefer integration tests with real dependencies over mocked unit tests where feasible (e.g., test with a real QueryClient, not a mocked one).

## Hook Testing

- Use `renderHook()` from `@testing-library/react`.
- Wrap hooks that need providers (React Query, Auth) in a `wrapper` component:
  ```typescript
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useNotes(), { wrapper });
  ```
- Use `waitFor()` for async assertions: `await waitFor(() => expect(result.current.isSuccess).toBe(true))`.

## Component Testing

- Use `@testing-library/react`: `render`, `screen`, `userEvent`.
- Query by accessibility role first: `screen.getByRole('button', { name: 'Save' })`.
- Then by text: `screen.getByText('No notes found')`.
- Avoid `querySelector`, `container`, and test IDs when a semantic query works.
- Test user interactions (click, type, submit) and verify visible outcomes — not internal state.
- Do not use snapshot tests — prefer explicit assertions.

## Coverage Requirements

- Test edge cases: empty inputs, boundary values, null/undefined, error responses.
- Test error scenarios: network failures, 401/403/404 responses, validation errors.
- Test loading and error states in components, not just the success state.
- For mutations: test optimistic update, rollback on error, and cache invalidation.

## Assertions

- Be specific: `toBe(42)` not `toBeTruthy()`. `toEqual({ id: '1', name: 'Test' })` not `toBeDefined()`.
- For arrays: `toHaveLength(3)` not `toBeTruthy()`. `toContainEqual(expected)` for partial matching.
- For errors: `toThrow(SpecificError)` or `rejects.toThrow()` for async.
- For DOM: `toBeInTheDocument()`, `toHaveTextContent()`, `toBeVisible()`, `toBeDisabled()`.
