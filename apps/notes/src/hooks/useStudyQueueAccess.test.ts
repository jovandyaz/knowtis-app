import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { useStudyQueueAccess } from './useStudyQueueAccess';

const { flagsState, refetch, useFeatureFlag } = vi.hoisted(() => ({
  flagsState: { isPending: false, isError: false },
  refetch: vi.fn(),
  useFeatureFlag: vi.fn<(key: string) => boolean>(),
}));

vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlags: () => ({ ...flagsState, refetch }),
  useFeatureFlag,
}));

describe('useStudyQueueAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flagsState.isPending = false;
    flagsState.isError = false;
    useFeatureFlag.mockReturnValue(true);
  });

  it('asks for the flag the study endpoints are guarded by', () => {
    renderHook(() => useStudyQueueAccess());

    expect(useFeatureFlag).toHaveBeenCalledWith(FEATURE_FLAG_KEYS.AI_ENABLED);
  });

  it('withholds the queue while ai_enabled is off', () => {
    useFeatureFlag.mockReturnValue(false);

    const { result } = renderHook(() => useStudyQueueAccess());

    expect(result.current.isEnabled).toBe(false);
  });

  it('withholds the queue until the flags have settled', () => {
    flagsState.isPending = true;

    const { result } = renderHook(() => useStudyQueueAccess());

    expect(result.current.isEnabled).toBe(false);
    expect(result.current.isPending).toBe(true);
  });

  it('opens the queue once the flags settle with ai_enabled on', () => {
    const { result } = renderHook(() => useStudyQueueAccess());

    expect(result.current.isEnabled).toBe(true);
    expect(result.current.isError).toBe(false);
  });
});
