import { StrictMode } from 'react';

import i18n from '@/lib/i18n';
import { refuseStorage } from '@/test/refuse-storage';
import { render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppErrorBoundary } from './AppErrorBoundary';

const CHUNK_ERROR_MESSAGE =
  'Failed to fetch dynamically imported module: /assets/NotePage.js';

function StaleChunk(): never {
  throw new Error(CHUNK_ERROR_MESSAGE);
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('AppErrorBoundary', () => {
  const originalLocation = window.location;
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('reloads a stale chunk once without offering the manual controls', () => {
    render(
      <StrictMode>
        <AppErrorBoundary>
          <StaleChunk />
        </AppErrorBoundary>
      </StrictMode>
    );

    expect(reload).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Reload Page' })
    ).not.toBeInTheDocument();
  });

  it('offers a manual reload when the browser refuses to remember the automatic one', () => {
    refuseStorage();

    render(
      <AppErrorBoundary>
        <StaleChunk />
      </AppErrorBoundary>
    );

    expect(reload).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Reload Page' })
    ).toBeInTheDocument();
  });
});
