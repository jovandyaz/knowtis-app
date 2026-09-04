import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createRouter, RouterProvider } from '@tanstack/react-router';

import './lib/i18n';
import './index.css';

import { logger } from '@knowtis/shared-util';

import { reloadIfStaleChunk } from './lib/chunk-reload';
import { capturePageview, initPostHog } from './lib/posthog';
import { routeTree } from './routeTree.gen';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  logger.warn('Stale chunk detected via vite:preloadError, attempting reload', {
    error: event.payload,
  });
  reloadIfStaleChunk();
});

initPostHog();

const router = createRouter({ routeTree });

router.subscribe('onResolved', () => {
  capturePageview();
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
