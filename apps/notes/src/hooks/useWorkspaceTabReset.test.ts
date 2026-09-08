import { useWorkspaceStore } from '@/stores/workspace.store';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkspaceTabReset } from './useWorkspaceTabReset';

beforeEach(() => {
  useWorkspaceStore.setState({ activeTab: 'note' });
});

describe('useWorkspaceTabReset', () => {
  it('opens on the note tab even when the store was left on study', () => {
    useWorkspaceStore.setState({ activeTab: 'estudio' });

    renderHook(() => useWorkspaceTabReset('note-1'));

    expect(useWorkspaceStore.getState().activeTab).toBe('note');
  });

  it('returns to the note tab when the key changes', () => {
    const { rerender } = renderHook(
      ({ noteKey }: { noteKey: string }) => useWorkspaceTabReset(noteKey),
      { initialProps: { noteKey: 'note-1' } }
    );

    useWorkspaceStore.getState().setTab('estudio');
    rerender({ noteKey: 'note-2' });

    expect(useWorkspaceStore.getState().activeTab).toBe('note');
  });

  it('leaves the tab alone while the key holds', () => {
    const { rerender } = renderHook(
      ({ noteKey }: { noteKey: string }) => useWorkspaceTabReset(noteKey),
      { initialProps: { noteKey: 'note-1' } }
    );

    useWorkspaceStore.getState().setTab('estudio');
    rerender({ noteKey: 'note-1' });

    expect(useWorkspaceStore.getState().activeTab).toBe('estudio');
  });
});
