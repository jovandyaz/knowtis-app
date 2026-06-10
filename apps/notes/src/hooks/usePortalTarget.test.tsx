import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { usePortalTarget } from './usePortalTarget';

describe('usePortalTarget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the element when it already exists', async () => {
    const target = document.createElement('div');
    target.id = 'existing-target';
    document.body.appendChild(target);

    const { result } = renderHook(() => usePortalTarget('existing-target'));

    await waitFor(() => expect(result.current).toBe(target));
  });

  it('recovers when the target mounts after the consumer', async () => {
    const { result } = renderHook(() => usePortalTarget('late-target'));
    expect(result.current).toBeNull();

    const target = document.createElement('div');
    target.id = 'late-target';
    act(() => {
      document.body.appendChild(target);
    });

    await waitFor(() => expect(result.current).toBe(target));
  });
});
