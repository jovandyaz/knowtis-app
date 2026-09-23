import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { DocumentConnectionState } from '@/components/editor/CollaborativeEditor.types';
import type { NoteSaveState } from '@/components/editor/NoteControlsPortal';
import { DEBOUNCE_DELAYS } from '@/lib';
import { useNoteEditorStore } from '@/stores/note-editor.store';
import { act, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';
import { createBaseExtensions } from '@knowtis/editor';
import { IMAGE_NODE_NAME } from '@knowtis/editor-schema';

import { NoteEditorPage, SAVED_STATE_DISPLAY_MS } from './NoteEditorPage';

const renderWithClient = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );

const authUser = vi.fn<() => { isAnonymous: boolean }>();
const { captureProductEvent } = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
}));

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
  useAuthUser: () => authUser(),
}));
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));

const propertiesRowProps = vi.fn();

vi.mock('@/components/organization/NotePropertiesRow', () => ({
  NotePropertiesRow: (props: { onSuggest?: () => void }) => {
    propertiesRowProps(props);
    return <div data-testid="note-properties-row" />;
  },
}));

const aiEnabled = vi.fn<() => boolean>();
const voiceNotesEnabled = vi.fn<() => boolean>();
const autoOrganizeEnabled = vi.fn<() => boolean>();

vi.mock('@/stores/ai.store', () => ({
  useAIStore: (
    selector: (s: { aiEnabled: boolean; voiceNotesEnabled: boolean }) => unknown
  ) =>
    selector({
      aiEnabled: aiEnabled(),
      voiceNotesEnabled: voiceNotesEnabled(),
    }),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => autoOrganizeEnabled(),
  useFeatureFlags: () => ({ isPending: false }),
}));

const editorRenders: { count: number } = { count: 0 };
let capturedOnUpdate: ((html: string) => void) | undefined;
let capturedOnVoiceNote: (() => void) | undefined;
let capturedOnEditorReady: ((editor: unknown) => void) | undefined;
let capturedOnConnectionStateChange:
  | ((state: DocumentConnectionState | null) => void)
  | undefined;
const updateNoteMutate = vi.fn();

vi.mock('@/components/editor/CollaborativeEditor', () => ({
  CollaborativeEditor: (props: {
    onUpdate: (html: string) => void;
    onVoiceNote?: () => void;
    onEditorReady?: (editor: unknown) => void;
    onConnectionStateChange?: (state: DocumentConnectionState | null) => void;
  }) => {
    editorRenders.count += 1;
    capturedOnUpdate = props.onUpdate;
    capturedOnVoiceNote = props.onVoiceNote;
    capturedOnEditorReady = props.onEditorReady;
    capturedOnConnectionStateChange = props.onConnectionStateChange;
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

let capturedOnVoiceInsert: ((html: string) => void) | undefined;

vi.mock('@/components/voice-note/VoiceNoteRecorder', () => ({
  VoiceNoteRecorder: (props: { onInsert: (html: string) => void }) => {
    capturedOnVoiceInsert = props.onInsert;
    return <div data-testid="voice-note-recorder" />;
  },
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

function loadNote(overrides: Partial<typeof loadedNote.data>) {
  noteQuery.mockReturnValue({
    ...loadedNote,
    data: { ...loadedNote.data, ...overrides },
  });
}

vi.mock('@knowtis/data-access-notes', () => ({
  useNote: () => noteQuery(),
  useUpdateNote: () => ({ mutate: updateNoteMutate }),
  useDeleteNote: () => ({ mutate: vi.fn() }),
  useRestoreNote: () => ({ mutate: vi.fn() }),
  useSuggestOrganization: () => ({
    mutate: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
}));

describe('NoteEditorPage', () => {
  beforeEach(() => {
    editorRenders.count = 0;
    capturedOnUpdate = undefined;
    capturedOnVoiceNote = undefined;
    capturedOnEditorReady = undefined;
    capturedOnConnectionStateChange = undefined;
    capturedOnVoiceInsert = undefined;
    noteControlsProps.mockClear();
    updateNoteMutate.mockReset();
    captureProductEvent.mockClear();
    propertiesRowProps.mockClear();
    noteQuery.mockReturnValue(loadedNote);
    authUser.mockReturnValue({ isAnonymous: false });
    aiEnabled.mockReturnValue(true);
    voiceNotesEnabled.mockReturnValue(true);
    autoOrganizeEnabled.mockReturnValue(true);
  });

  it('offers the voice note entry points when AI and voice notes are both enabled', () => {
    renderWithClient(<NoteEditorPage />);

    expect(capturedOnVoiceNote).toBeInstanceOf(Function);
    expect(screen.getByTestId('voice-note-recorder')).toBeInTheDocument();
  });

  it('inserts a voice note without the images the model put in it', () => {
    renderWithClient(<NoteEditorPage />);
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: createBaseExtensions({ disableHistory: true }),
      content: '<p>hello</p>',
    });
    act(() => capturedOnEditorReady?.(editor));

    act(() =>
      capturedOnVoiceInsert?.(
        '<p>Transcribed idea</p><figure data-image><img src="https://evil.com/p.png"></figure><p><img src="https://evil.com/p.png"></p>'
      )
    );

    const images: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === IMAGE_NODE_NAME) {
        images.push(String(node.attrs['src']));
      }
    });
    expect(editor.getText()).toContain('Transcribed idea');
    expect(images).toEqual([]);
    expect(editor.getHTML()).not.toContain('evil.com');
    editor.destroy();
  });

  it('hides the voice note entry points when voice notes are disabled', () => {
    voiceNotesEnabled.mockReturnValue(false);

    renderWithClient(<NoteEditorPage />);

    expect(capturedOnVoiceNote).toBeUndefined();
    expect(screen.queryByTestId('voice-note-recorder')).not.toBeInTheDocument();
  });

  it('hides the voice note entry points when AI is disabled', () => {
    aiEnabled.mockReturnValue(false);

    renderWithClient(<NoteEditorPage />);

    expect(capturedOnVoiceNote).toBeUndefined();
    expect(screen.queryByTestId('voice-note-recorder')).not.toBeInTheDocument();
  });

  it('offers the suggestion affordance when both AI flags are on', () => {
    renderWithClient(<NoteEditorPage />);

    expect(propertiesRowProps.mock.calls[0][0].onSuggest).toBeInstanceOf(
      Function
    );
  });

  it('hides the suggestion affordance when the master AI flag is off', () => {
    aiEnabled.mockReturnValue(false);

    renderWithClient(<NoteEditorPage />);

    expect(propertiesRowProps.mock.calls[0][0].onSuggest).toBeUndefined();
  });

  it('renders the editor', () => {
    renderWithClient(<NoteEditorPage />);
    expect(screen.getByTestId('collaborative-editor')).toBeInTheDocument();
  });

  it('forwards the document connection state to the header controls', () => {
    renderWithClient(<NoteEditorPage />);

    expect(noteControlsProps.mock.lastCall?.[0].connectionState).toBeNull();

    act(() => capturedOnConnectionStateChange?.('syncing'));

    expect(noteControlsProps.mock.lastCall?.[0].connectionState).toBe(
      'syncing'
    );
  });

  it('hosts the connection status on the phone layout, where the header portal is hidden', () => {
    const { container } = renderWithClient(<NoteEditorPage />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('.md\\:hidden')).toBeNull();

    act(() => capturedOnConnectionStateChange?.('connected'));

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('editor.connection.connected');
    expect(status.parentElement).toHaveClass('md:hidden');
  });

  it('drops a stale connection state when another note takes over the page', () => {
    const client = new QueryClient();
    const page = () => (
      <QueryClientProvider client={client}>
        <NoteEditorPage />
      </QueryClientProvider>
    );
    const { rerender } = render(page());

    act(() => capturedOnConnectionStateChange?.('connected'));
    expect(noteControlsProps.mock.lastCall?.[0].connectionState).toBe(
      'connected'
    );

    loadNote({ id: 'note-2' });
    rerender(page());

    expect(noteControlsProps.mock.lastCall?.[0].connectionState).toBeNull();
  });

  it('exposes the live editor to the note-editor store and detaches on unmount', () => {
    const { unmount } = renderWithClient(<NoteEditorPage />);
    const fakeEditor = { isDestroyed: false, getHTML: () => '<p>x</p>' };
    act(() => capturedOnEditorReady?.(fakeEditor));
    expect(useNoteEditorStore.getState().editor).toBe(fakeEditor);
    expect(useNoteEditorStore.getState().noteId).toBe('note-1');
    unmount();
    expect(useNoteEditorStore.getState().editor).toBeNull();
  });

  it('shows the note skeleton while the note loads', () => {
    noteQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    renderWithClient(<NoteEditorPage />);

    expect(
      screen.getByRole('status', { name: 'editor.loadingNote' })
    ).toBeInTheDocument();
  });

  it('offers the organization properties to a signed-up owner', () => {
    renderWithClient(<NoteEditorPage />);
    expect(screen.getByTestId('note-properties-row')).toBeInTheDocument();
  });

  it('hides the organization properties from an anonymous owner', () => {
    authUser.mockReturnValue({ isAnonymous: true });

    renderWithClient(<NoteEditorPage />);

    expect(screen.queryByTestId('note-properties-row')).not.toBeInTheDocument();
  });

  // Autosaved content must carry the doc's own CRDT state — a content write
  // without it lets the server mint a parallel history and duplicate the
  // note on reload.
  it('sends the doc CRDT state with every content autosave', async () => {
    vi.useFakeTimers();
    try {
      renderWithClient(<NoteEditorPage />);
      await act(async () => {
        capturedOnUpdate?.('<p>hello world</p>');
        await vi.runAllTimersAsync();
      });

      expect(updateNoteMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ content: '<p>hello world</p>' }),
          yjsState: 'AAA=',
        }),
        expect.anything()
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-renders the editor subtree once per autosave burst, never per keystroke', () => {
    renderWithClient(<NoteEditorPage />);
    expect(editorRenders.count).toBe(1);

    act(() => {
      capturedOnUpdate?.('<p>hello w</p>');
      capturedOnUpdate?.('<p>hello wo</p>');
      capturedOnUpdate?.('<p>hello world</p>');
    });
    expect(editorRenders.count).toBe(2);

    act(() => {
      capturedOnUpdate?.('<p>hello world again</p>');
      capturedOnUpdate?.('<p>hello world again and again</p>');
    });

    expect(editorRenders.count).toBe(2);
  });

  describe('save status', () => {
    interface SaveHandlers {
      onSuccess: () => void;
      onError: (error: Error) => void;
    }

    const succeed = (_input: unknown, handlers: SaveHandlers) =>
      handlers.onSuccess();
    const fail = (_input: unknown, handlers: SaveHandlers) =>
      handlers.onError(new Error('offline'));

    const saveState = () => noteControlsProps.mock.lastCall?.[0].saveState;

    const edit = async (html: string) => {
      await act(async () => {
        capturedOnUpdate?.(html);
      });
    };

    const runDebounce = async () => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEBOUNCE_DELAYS.AUTO_SAVE);
      });
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts idle and reports queued changes while the debounce runs', async () => {
      renderWithClient(<NoteEditorPage />);
      expect(saveState()).toBe('idle');

      await edit('<p>first words</p>');

      expect(saveState()).toBe('pending');
      expect(updateNoteMutate).not.toHaveBeenCalled();
    });

    it('reports the request in flight and claims success only once it settles', async () => {
      let settle: (() => void) | undefined;
      updateNoteMutate.mockImplementation(
        (_input: unknown, handlers: SaveHandlers) => {
          settle = handlers.onSuccess;
        }
      );
      renderWithClient(<NoteEditorPage />);

      await edit('<p>first words</p>');
      await runDebounce();
      expect(saveState()).toBe('saving');

      await act(async () => settle?.());

      expect(saveState()).toBe('saved');
    });

    it('does not claim success while a newer edit is already queued', async () => {
      let settle: (() => void) | undefined;
      updateNoteMutate.mockImplementation(
        (_input: unknown, handlers: SaveHandlers) => {
          settle = handlers.onSuccess;
        }
      );
      renderWithClient(<NoteEditorPage />);
      await edit('<p>first words</p>');
      await runDebounce();

      await edit('<p>second words</p>');
      await act(async () => settle?.());

      expect(saveState()).toBe('pending');
    });

    it('keeps a failed save on screen instead of falling back to the earlier success', async () => {
      updateNoteMutate.mockImplementation(succeed);
      renderWithClient(<NoteEditorPage />);
      await edit('<p>first words</p>');
      await runDebounce();
      expect(saveState()).toBe('saved');

      updateNoteMutate.mockImplementation(fail);
      await edit('<p>second words</p>');
      await runDebounce();
      expect(saveState()).toBe('error');

      act(() => capturedOnConnectionStateChange?.('connected'));

      expect(saveState()).toBe('error');
    });

    it('clears the failure once a later attempt succeeds', async () => {
      updateNoteMutate.mockImplementation(fail);
      renderWithClient(<NoteEditorPage />);
      await edit('<p>first words</p>');
      await runDebounce();
      expect(saveState()).toBe('error');

      updateNoteMutate.mockImplementation(succeed);
      await edit('<p>second words</p>');
      await runDebounce();

      expect(saveState()).toBe('saved');
    });

    it('returns the saved indicator to idle after its display duration', async () => {
      updateNoteMutate.mockImplementation(succeed);
      renderWithClient(<NoteEditorPage />);
      await edit('<p>first words</p>');
      await runDebounce();
      expect(saveState()).toBe('saved');

      await act(async () => {
        vi.advanceTimersByTime(SAVED_STATE_DISPLAY_MS);
      });

      expect(saveState()).toBe('idle');
    });

    it('does not let a stale saved timer clobber a newer pending edit', async () => {
      updateNoteMutate.mockImplementation(succeed);
      renderWithClient(<NoteEditorPage />);
      await edit('<p>first words</p>');
      await runDebounce();
      expect(saveState()).toBe('saved');

      let settle: (() => void) | undefined;
      updateNoteMutate.mockImplementation(
        (_input: unknown, handlers: SaveHandlers) => {
          settle = handlers.onSuccess;
        }
      );
      await edit('<p>second words</p>');
      expect(saveState()).toBe('pending');

      await act(async () => {
        vi.advanceTimersByTime(SAVED_STATE_DISPLAY_MS);
      });

      expect(saveState()).not.toBe('idle');
      expect(saveState()).toBe('saving');
      expect(settle).toBeInstanceOf(Function);
    });

    it('does not let a stale saved timer clobber an error', async () => {
      updateNoteMutate.mockImplementation(succeed);
      renderWithClient(<NoteEditorPage />);
      await edit('<p>first words</p>');
      await runDebounce();
      expect(saveState()).toBe('saved');

      updateNoteMutate.mockImplementation(fail);
      await edit('<p>second words</p>');
      await runDebounce();
      expect(saveState()).toBe('error');

      await act(async () => {
        vi.advanceTimersByTime(SAVED_STATE_DISPLAY_MS);
      });

      expect(saveState()).toBe('error');
    });

    it('clears the saved timer on unmount', async () => {
      updateNoteMutate.mockImplementation(succeed);
      const { unmount } = renderWithClient(<NoteEditorPage />);
      await edit('<p>first words</p>');
      await runDebounce();
      expect(saveState()).toBe('saved');
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      await edit('<p>more words</p>');
      await runDebounce();
      const savedTimerCall = setTimeoutSpy.mock.calls.findIndex(
        ([, delay]) => delay === SAVED_STATE_DISPLAY_MS
      );
      const savedTimerId = setTimeoutSpy.mock.results[savedTimerCall]?.value;

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(savedTimerId);
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('load errors', () => {
    const failWith = (error: unknown) => {
      noteQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error,
      });
    };

    it('translates a known error code instead of printing the server message', () => {
      failWith(
        new ApiClientError('Permission denied', 403, 'PERMISSION_DENIED')
      );

      renderWithClient(<NoteEditorPage />);

      expect(screen.getByText('editor.permissionDenied')).toBeInTheDocument();
      expect(screen.queryByText('Permission denied')).not.toBeInTheDocument();
    });

    it('translates a not-found code', () => {
      failWith(new ApiClientError('Note abc not found', 404, 'NOTE_NOT_FOUND'));

      renderWithClient(<NoteEditorPage />);

      expect(screen.getByText('editor.notFound')).toBeInTheDocument();
      expect(screen.queryByText('Note abc not found')).not.toBeInTheDocument();
    });

    it('falls back to a generic translated message for an unknown code', () => {
      failWith(new ApiClientError('Something exploded', 500, 'INTERNAL_ERROR'));

      renderWithClient(<NoteEditorPage />);

      expect(screen.getByText('editor.loadErrorGeneric')).toBeInTheDocument();
      expect(screen.queryByText('Something exploded')).not.toBeInTheDocument();
    });

    it('falls back to the generic message for a non-API error', () => {
      failWith(new TypeError('Failed to fetch'));

      renderWithClient(<NoteEditorPage />);

      expect(screen.getByText('editor.loadErrorGeneric')).toBeInTheDocument();
      expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
    });
  });

  it.each(['', '<p></p>', '<p><br></p>', '<p>&nbsp;</p>'])(
    'captures activation once when an initially trivial note (%s) becomes meaningful',
    (initialContent) => {
      loadNote({ content: initialContent });
      renderWithClient(<NoteEditorPage />);

      act(() => capturedOnUpdate?.('<p>First words</p>'));
      act(() => capturedOnUpdate?.('<p>First words and more</p>'));

      expect(captureProductEvent).toHaveBeenCalledTimes(1);
      expect(captureProductEvent).toHaveBeenCalledWith('note activated', {
        source: 'editor',
      });
    }
  );

  it('does not activate an initially populated note', () => {
    renderWithClient(<NoteEditorPage />);

    act(() => capturedOnUpdate?.('<p>Changed words</p>'));

    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('does not activate a read-only note', () => {
    loadNote({ content: '', accessLevel: 'viewer' });
    renderWithClient(<NoteEditorPage />);

    act(() => capturedOnUpdate?.('<p>Words</p>'));

    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('does not activate while changes remain trivial', () => {
    loadNote({ content: '' });
    renderWithClient(<NoteEditorPage />);

    act(() => capturedOnUpdate?.('<p>&nbsp;</p>'));
    act(() => capturedOnUpdate?.('<p><br></p>'));

    expect(captureProductEvent).not.toHaveBeenCalled();
  });
});
