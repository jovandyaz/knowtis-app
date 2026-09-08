import { useWorkspaceStore } from '@/stores/workspace.store';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSharedNoteEditing } from './useSharedNoteEditing';

const ensureGuestSession = vi.fn<() => Promise<boolean>>();
const toastError = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/auth/setup', () => ({
  ensureGuestSession: () => ensureGuestSession(),
}));
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ activeTab: 'note' });
});

describe('useSharedNoteEditing', () => {
  it('promotes the visitor to editing once a guest session exists', async () => {
    ensureGuestSession.mockResolvedValue(true);
    useWorkspaceStore.setState({ activeTab: 'estudio' });
    const { result } = renderHook(() => useSharedNoteEditing());

    act(() => result.current.handleStartEditing());

    await waitFor(() => expect(result.current.isEditing).toBe(true));
    expect(result.current.isPreparingEdit).toBe(false);
    expect(useWorkspaceStore.getState().activeTab).toBe('note');
  });

  it('marks the visitor as preparing while the session is created', async () => {
    let release: ((ready: boolean) => void) | undefined;
    ensureGuestSession.mockReturnValue(
      new Promise<boolean>((resolve) => {
        release = resolve;
      })
    );
    const { result } = renderHook(() => useSharedNoteEditing());

    act(() => result.current.handleStartEditing());
    expect(result.current.isPreparingEdit).toBe(true);
    expect(result.current.isEditing).toBe(false);

    await act(async () => {
      release?.(true);
    });
    expect(result.current.isPreparingEdit).toBe(false);
  });

  it('keeps the visitor reading and says why when no session can be created', async () => {
    ensureGuestSession.mockResolvedValue(false);
    useWorkspaceStore.setState({ activeTab: 'estudio' });
    const { result } = renderHook(() => useSharedNoteEditing());

    act(() => result.current.handleStartEditing());

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('shared.editUnavailable')
    );
    expect(result.current.isEditing).toBe(false);
    expect(useWorkspaceStore.getState().activeTab).toBe('estudio');
  });

  it('returns to the note tab when the visitor stops editing', async () => {
    ensureGuestSession.mockResolvedValue(true);
    const { result } = renderHook(() => useSharedNoteEditing());

    act(() => result.current.handleStartEditing());
    await waitFor(() => expect(result.current.isEditing).toBe(true));
    act(() => useWorkspaceStore.getState().setTab('estudio'));

    act(() => result.current.handleStopEditing());

    expect(result.current.isEditing).toBe(false);
    expect(useWorkspaceStore.getState().activeTab).toBe('note');
  });

  it('reports a denied edit without dropping the collaborative session', async () => {
    ensureGuestSession.mockResolvedValue(true);
    const { result } = renderHook(() => useSharedNoteEditing());

    act(() => result.current.handleStartEditing());
    await waitFor(() => expect(result.current.isEditing).toBe(true));

    act(() => result.current.handleEditDenied());

    expect(toastError).toHaveBeenCalledWith('shared.editDenied');
    expect(result.current.isEditing).toBe(true);
  });

  it('remembers the content the editor last produced', () => {
    const { result } = renderHook(() => useSharedNoteEditing());
    expect(result.current.latestContent).toBeNull();

    act(() => result.current.handleUpdate('<p>edited</p>'));

    expect(result.current.latestContent).toBe('<p>edited</p>');
  });
});
