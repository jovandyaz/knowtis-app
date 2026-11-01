import { act, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCopyLink } from './useCopyLink';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('useCopyLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userEvent.setup();
  });

  it('reports a copied link through its state, leaving feedback to the consumer', async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useCopyLink());

    await act(() => result.current.copy());

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(result.current.copied).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps the copied state for the full window after a repeat copy', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { result } = renderHook(() => useCopyLink());

      await act(() => result.current.copy());
      act(() => vi.advanceTimersByTime(1500));
      await act(() => result.current.copy());
      act(() => vi.advanceTimersByTime(1000));

      expect(result.current.copied).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a refused copy with an error toast and no copied state', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied')
    );
    const { result } = renderHook(() => useCopyLink());

    await act(() => result.current.copy());

    expect(result.current.copied).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('errors.somethingWentWrong');
  });
});
