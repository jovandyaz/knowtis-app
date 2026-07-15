import type { FunctionComponent } from 'react';

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';

import { render } from '@testing-library/react';

/**
 * Mounts `Component` as the root route of a throwaway memory-history router
 * so `Link` components resolve without a real `RouterProvider` from main.tsx.
 * `linkedPaths` are registered as dummy leaf routes so `<Link to="/users">`
 * etc. match instead of throwing.
 *
 * `router.load()` is awaited before the first render — otherwise the initial
 * route match resolves after mount and React commits an empty tree first,
 * so `render()` returns before the linked content exists.
 */
export async function renderWithRouter(
  Component: FunctionComponent,
  linkedPaths: readonly string[] = []
) {
  const rootRoute = createRootRoute({ component: Component });
  const routeTree = rootRoute.addChildren(
    linkedPaths.map((path) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path,
        component: () => null,
      })
    )
  );
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  await router.load();

  return render(<RouterProvider router={router} />);
}
