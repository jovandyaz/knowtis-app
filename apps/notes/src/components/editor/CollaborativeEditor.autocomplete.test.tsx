import { act, render, screen, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { TooltipProvider } from '@knowtis/design-system';
import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import { CollaborativeEditor } from './CollaborativeEditor';

const TOGGLE_LABEL = 'editor.toolbar.autocomplete';
const SUGGESTION = ' over the lazy dog';
const PAST_GHOST_TEXT_DEBOUNCE_MS = 1000;
const TYPED_SENTENCE = 'The quick brown fox jumps';

let aiEnabled = true;
let isAnonymous = false;
let preferences: { ghostTextEnabled: boolean } | undefined;
let preferencesFailed: boolean;
let preferencesQueryEnabled: unknown;
let transportReadOnly = false;
let doc: Y.Doc;
let editor: Editor | null = null;

const updateAISettings = vi.fn();

const { streamSuggestion } = vi.hoisted(() => ({
  streamSuggestion: vi.fn<() => AsyncIterable<{ text: string }>>(),
}));

vi.mock('@/auth', () => ({
  authStore: { getState: () => ({}) },
  tokenStorage: {},
  performSessionLogout: vi.fn(),
  refreshAccessToken: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => ({ isAnonymous }),
}));
vi.mock('@/collaboration/useHocuspocusCollaboration', () => ({
  getCollaborationServerUrl: () => 'ws://test/collaboration',
  isWebSocketEnabled: () => true,
  useHocuspocusCollaboration: () => ({
    status: 'connected',
    isConnected: true,
    isSynced: true,
    readOnly: transportReadOnly,
  }),
}));
vi.mock('@/hooks', () => ({
  useCollaborativeEditor: () => ({
    yDoc: doc,
    yXmlFragment: doc.getXmlFragment(YJS_XML_FRAGMENT_NAME),
    awareness: null,
    currentUser: { name: 'Tester', color: '#000' },
    isReady: true,
  }),
  useActiveCollaborators: () => [],
  usePresenceBroadcast: () => undefined,
  useAISettings: (enabled?: boolean) => {
    preferencesQueryEnabled = enabled;
    return { data: preferences, isError: preferencesFailed };
  },
  useUpdateAISettings: () => ({ mutate: updateAISettings }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/stores/ai.store', () => {
  const useAIStore = (selector?: (s: object) => unknown) =>
    selector ? selector({ aiEnabled }) : aiEnabled;
  useAIStore.getState = () => ({ aiEnabled, status: 'idle' });
  return { useAIStore };
});
vi.mock('./ai/aiClientProvider', () => ({
  createAiClientProvider: () => ({ stream: streamSuggestion }),
}));
vi.mock('@/stores/ai-menu.store', () => ({
  useAIMenuStore: (selector?: (s: object) => unknown) =>
    selector ? selector({ open: vi.fn() }) : undefined,
}));

function editorElement(editable: boolean) {
  return (
    <TooltipProvider>
      <CollaborativeEditor
        noteId="n1"
        initialContent=""
        onUpdate={vi.fn()}
        editable={editable}
        onEditorReady={(ready) => {
          editor = ready;
        }}
      />
    </TooltipProvider>
  );
}

async function mount(editable = true): Promise<RenderResult> {
  let view: RenderResult | undefined;
  await act(async () => {
    view = render(editorElement(editable));
    await Promise.resolve();
  });
  if (!view) {
    throw new Error('render did not produce a view');
  }
  return view;
}

async function rerender(view: RenderResult) {
  await act(async () => {
    view.rerender(editorElement(true));
    await Promise.resolve();
  });
}

function toggle() {
  return screen.queryByRole('button', { name: TOGGLE_LABEL });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function ghostTextEnabled(): unknown {
  const storage: unknown = editor?.storage;
  if (!isRecord(storage) || !isRecord(storage['ghostText'])) {
    return undefined;
  }
  return storage['ghostText']['enabled'];
}

describe('CollaborativeEditor autocomplete toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doc = new Y.Doc();
    editor = null;
    aiEnabled = true;
    isAnonymous = false;
    preferences = { ghostTextEnabled: true };
    preferencesFailed = false;
    preferencesQueryEnabled = undefined;
  });

  it('offers the toggle to a registered user with AI on', async () => {
    await mount();

    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(preferencesQueryEnabled).toBeTruthy();
  });

  it('mirrors the stored preference on the toggle', async () => {
    preferences = { ghostTextEnabled: false };
    await mount();

    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides the toggle from an anonymous visitor, who cannot store it', async () => {
    isAnonymous = true;
    await mount();

    expect(toggle()).not.toBeInTheDocument();
    expect(preferencesQueryEnabled).toBeFalsy();
  });

  it('hides the toggle while AI is off for the workspace', async () => {
    aiEnabled = false;
    await mount();

    expect(toggle()).not.toBeInTheDocument();
    expect(preferencesQueryEnabled).toBeFalsy();
  });

  it('keeps the toggle in a read-only session, since it is an account setting', async () => {
    await mount(false);

    expect(toggle()).toBeInTheDocument();
  });

  it('shows the toggle off when the stored preference cannot be loaded', async () => {
    preferences = undefined;
    preferencesFailed = true;
    await mount();

    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('stores the flipped preference when the toggle is pressed', async () => {
    await mount();

    await userEvent.click(screen.getByRole('button', { name: TOGGLE_LABEL }));

    expect(updateAISettings).toHaveBeenCalledWith({ ghostTextEnabled: false });
  });
});

describe('CollaborativeEditor autocomplete extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doc = new Y.Doc();
    editor = null;
    aiEnabled = true;
    isAnonymous = false;
    preferences = { ghostTextEnabled: true };
    preferencesFailed = false;
  });

  it('stays off while the stored preference is still loading', async () => {
    preferences = undefined;
    await mount();

    expect(ghostTextEnabled()).toBe(false);
  });

  it('turns on once the stored preference arrives', async () => {
    await mount();

    expect(ghostTextEnabled()).toBe(true);
  });

  it('stays off for a user who turned it off', async () => {
    preferences = { ghostTextEnabled: false };
    await mount();

    expect(ghostTextEnabled()).toBe(false);
  });

  it('turns on for a visitor who has no preference to load', async () => {
    isAnonymous = true;
    preferences = undefined;
    await mount();

    expect(ghostTextEnabled()).toBe(true);
  });
});

describe('CollaborativeEditor autocomplete suggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doc = new Y.Doc();
    editor = null;
    aiEnabled = true;
    isAnonymous = false;
    preferences = { ghostTextEnabled: true };
    preferencesFailed = false;
    transportReadOnly = false;
    streamSuggestion.mockImplementation(async function* () {
      yield { text: SUGGESTION };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function liveEditor(): Editor {
    if (!editor) {
      throw new Error('editor is not ready');
    }
    return editor;
  }

  function visibleSuggestion(): string | null {
    return (
      document.querySelector('.ghost-text-suggestion')?.textContent ?? null
    );
  }

  async function typeAndWaitForSuggestion(text: string) {
    const typing = liveEditor();
    vi.spyOn(typing.view, 'hasFocus').mockReturnValue(true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => {
      typing.commands.insertContent(text);
    });
    await act(() => vi.advanceTimersByTimeAsync(PAST_GHOST_TEXT_DEBOUNCE_MS));
    vi.useRealTimers();
  }

  async function mountWithSuggestion(): Promise<RenderResult> {
    const view = await mount();
    await typeAndWaitForSuggestion(TYPED_SENTENCE);
    expect(visibleSuggestion()).toBe(SUGGESTION);
    return view;
  }

  it('clears a visible suggestion when the editor turns read-only', async () => {
    const view = await mountWithSuggestion();

    transportReadOnly = true;
    await rerender(view);

    expect(liveEditor().isEditable).toBe(false);
    expect(visibleSuggestion()).toBeNull();
  });

  it('keeps the suggestion across a render that leaves the editor editable', async () => {
    const view = await mountWithSuggestion();

    await rerender(view);

    expect(visibleSuggestion()).toBe(SUGGESTION);
    expect(streamSuggestion).toHaveBeenCalledTimes(1);
  });

  it('suggests again once the editor is editable again', async () => {
    const view = await mountWithSuggestion();
    transportReadOnly = true;
    await rerender(view);

    transportReadOnly = false;
    await rerender(view);
    await typeAndWaitForSuggestion(' again');

    expect(visibleSuggestion()).toBe(SUGGESTION);
    expect(streamSuggestion).toHaveBeenCalledTimes(2);
  });
});
