import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStudyArtifactParam } from './useStudyArtifactParam';

const { navigate, search } = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: { value: {} as { study?: string } },
}));

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search.value,
  useNavigate: () => navigate,
}));

describe('useStudyArtifactParam', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the open artifact from the search params', () => {
    search.value = { study: 'a1' };
    const { result } = renderHook(() => useStudyArtifactParam());
    expect(result.current.selectedArtifactId).toBe('a1');
  });

  it('writes and clears the param without scrolling the note', () => {
    search.value = {};
    const { result } = renderHook(() => useStudyArtifactParam());
    result.current.selectArtifact('a2');
    const [open] = navigate.mock.calls.at(-1) as [
      { search: (p: object) => object; resetScroll: boolean },
    ];
    expect(open.search({ tag: 'x' })).toEqual({ tag: 'x', study: 'a2' });
    expect(open.resetScroll).toBe(false);
    expect(open).not.toHaveProperty('replace', true);
    result.current.selectArtifact(null);
    const [close] = navigate.mock.calls.at(-1) as [
      { search: (p: object) => object },
    ];
    expect(close.search({ study: 'a2', tag: 'x' })).toEqual({
      tag: 'x',
      study: undefined,
    });
    expect(close).toHaveProperty('replace', true);
  });
});
