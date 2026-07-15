import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createRouter, RouterProvider } from '@tanstack/react-router';

import './index.css';

import { LoadingState } from '@knowtis/design-system';

import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  defaultPendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingState />
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
