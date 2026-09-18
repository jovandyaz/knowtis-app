import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { DocumentConnectionState } from '@/components/editor/CollaborativeEditor.types';
import type { NoteSaveState } from '@/components/editor/NoteControlsPortal';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClientModule from '@knowtis/api-client';
import { notesApi } from '@knowtis/api-client';
import type * as DataAccessNotesModule from '@knowtis/data-access-notes';

import { NoteEditorPage } from './NoteEditorPage';

// TanStack Query v5 resets the mutation observer on every `mutate` call, so
// callbacks passed to an earlier `mutate` fire only for that call, regardless
// of resolution order (docs: Mutation Side Effects > Consecutive mutations).
// A mocked useUpdateNote can't reproduce that reset, so this pins the
// guarantee against the real hook and a real QueryClient, with a deferred
// `notesApi.update` to control settle order.

const renderWithClient = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ noteId: 'note-1' }),
}));

vi.mock('@/hooks/useStudyArtifactParam', () => ({
  useStudyArtifactParam: () => ({
    selectedArtifactId: null,
    selectArtifact: vi.fn(),
  }),
}));

vi.mock('@knowtis/crdt', () => ({
  useYjs: () => ({ getYDoc: () => ({}) }),
  docStateToBase64: () => 'AAA=',
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => ({ isAnonymous: false }),
}));
vi.mock('@/lib/analytics/product-events', () => ({
  captureProductEvent: vi.fn(),
}));

vi.mock('@/components/organization/NotePropertiesRow', () => ({
  NotePropertiesRow: () => <div data-testid="note-properties-row" />,
}));

vi.mock('@/stores/ai.store', () => ({
  useAIStore: () => false,
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => false,
  useFeatureFlags: () => ({ isPending: false }),
}));

let capturedOnUpdate: ((html: string) => void) | undefined;

vi.mock('@/components/editor/CollaborativeEditor', () => ({
  CollaborativeEditor: (props: { onUpdate: (html: string) => void }) => {
    capturedOnUpdate = props.onUpdate;
    return <div data-testid="collaborative-editor" />;
  },
}));

vi.mock('@/components/editor/MobileEditorHeader', () => ({
  MobileEditorHeader: () => null,
}));

interface CapturedControlsProps {
  connectionState: DocumentConnectionState | null;
  saveState: NoteSaveState;
}

const noteControlsProps = vi.fn<(props: CapturedControlsProps) => void>();

vi.mock('@/components/editor/NoteControlsPortal', () => ({
  NoteControlsPortal: (props: CapturedControlsProps) => {
    noteControlsProps(props);
    return null;
  },
}));

vi.mock('@/components/voice-note/VoiceNoteRecorder', () => ({
  VoiceNoteRecorder: () => null,
}));

const loadedNote = {
  data: {
    id: 'note-1',
    title: 'My Note',
    content: '<p>hello</p>',
    accessLevel: 'owner',
    bucket: null,
    generalAccess: 'restricted',
    generalAccessPermission: 'viewer',
    shareToken: null,
    editorsCanShare: false,
  },
  isLoading: false,
  isError: false,
  error: null,
};
const noteQuery = vi.fn<() => Record<string, unknown>>();

vi.mock('@knowtis/data-access-notes', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessNotesModule>();
  return {
    ...actual,
    useNote: () => noteQuery(),
    useDeleteNote: () => ({ mutate: vi.fn() }),
    useRestoreNote: () => ({ mutate: vi.fn() }),
    useSuggestOrganization: () => ({
      mutate: vi.fn(),
      isPending: false,
      reset: vi.fn(),
    }),
  };
});

vi.mock('@knowtis/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    notesApi: { ...actual.notesApi, update: vi.fn() },
  };
});

describe('NoteEditorPage save ordering', () => {
  beforeEach(() => {
    capturedOnUpdate = undefined;
    noteControlsProps.mockClear();
    noteQuery.mockReturnValue(loadedNote);
    vi.mocked(notesApi.update).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const saveState = () => noteControlsProps.mock.lastCall?.[0].saveState;

  const edit = async (html: string) => {
    await act(async () => {
      capturedOnUpdate?.(html);
    });
  };

  const runDebounce = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  };

  it('follows only the last in-flight save, even when an earlier one resolves after it', async () => {
    let resolveA: (() => void) | undefined;
    let rejectB: ((error: Error) => void) | undefined;
    const pendingA = new Promise<{ id: string }>((resolve) => {
      resolveA = () => resolve({ id: 'note-1' });
    });
    const pendingB = new Promise<{ id: string }>((_resolve, reject) => {
      rejectB = reject;
    });

    vi.mocked(notesApi.update).mockImplementationOnce(() => pendingA as never);

    renderWithClient(<NoteEditorPage />);

    await edit('<p>save A</p>');
    await runDebounce();
    expect(saveState()).toBe('saving');
    expect(notesApi.update).toHaveBeenCalledTimes(1);

    vi.mocked(notesApi.update).mockImplementationOnce(() => pendingB as never);

    await edit('<p>save B</p>');
    await runDebounce();
    expect(saveState()).toBe('saving');
    expect(notesApi.update).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveA?.();
      await pendingA;
    });

    expect(saveState()).toBe('saving');

    await act(async () => {
      rejectB?.(new Error('offline'));
      await pendingB.catch(() => undefined);
    });

    expect(saveState()).toBe('error');
  });
});
