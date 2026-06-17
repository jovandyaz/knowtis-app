import { afterEach, describe, expect, it, vi } from 'vitest';

import { redirectToLoginWithReload } from './redirect-to-login';

describe('redirectToLoginWithReload', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hard-navigates to the login route to clear in-memory session state', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign },
    });

    redirectToLoginWithReload();

    expect(assign).toHaveBeenCalledWith('/login');
  });
});
