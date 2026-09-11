import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from '@tiptap/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { ApiClientError, notesApi } from '@knowtis/api-client';
import { notesQueryKeys } from '@knowtis/data-access-notes';
import { TooltipProvider } from '@knowtis/design-system';
import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';
import { COLLABORATION_CLOSE_REASON } from '@knowtis/shared-types';

import { SharedNotePage } from './SharedNotePage';

interface ProviderOptions {
  document: Y.Doc;
  awareness: Awareness;
  websocketProvider: Pick<
    HocuspocusProviderWebsocket,
    'status' | 'connect' | 'disconnect' | 'destroy'
  >;
  onClose(event: { event: { code: number; reason: string } }): void;
  onAuthenticated(event: { scope: string }): void;
  onSynced(event: { state: boolean }): void;
}
const providers: Array<{
  options: ProviderOptions;
  destroy: ReturnType<typeof vi.fn>;
  sendToken: ReturnType<typeof vi.fn>;
  startSync: ReturnType<typeof vi.fn>;
}> = [];
let doc: Y.Doc;
let awareness: Awareness;

vi.mock('@hocuspocus/provider', () => ({
  WebSocketStatus: {
    Connecting: 'connecting',
    Connected: 'connected',
    Disconnected: 'disconnected',
  },
  HocuspocusProviderWebsocket: vi.fn(function () {
    return {
      status: 'connected',
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      destroy: vi.fn(),
    };
  }),
  HocuspocusProvider: vi.fn(function (options: ProviderOptions) {
    const provider = {
      options,
      destroy: vi.fn(() => options.awareness.destroy()),
      sendToken: vi.fn().mockResolvedValue(undefined),
      startSync: vi.fn(),
      attach: vi.fn(),
      configuration: {
        websocketProvider: options.websocketProvider,
      },
    };
    providers.push(provider);
    return provider;
  }),
}));
vi.mock('@/auth', () => ({
  authStore: { getState: () => ({}) },
  tokenStorage: {},
  performSessionLogout: vi.fn(),
  refreshAccessToken: vi.fn(),
  redirectToLoginWithReload: vi.fn(),
}));
vi.mock('@/auth/setup', () => ({
  ensureGuestSession: () => Promise.resolve(true),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => ({ isAnonymous: true }),
  useAuthLoading: () => false,
}));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ token: 'shared-token' }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/hooks', () => ({
  useCollaborativeEditor: () => ({
    yDoc: doc,
    yXmlFragment: doc.getXmlFragment(YJS_XML_FRAGMENT_NAME),
    awareness,
    currentUser: { name: 'Guest', color: '#000' },
    isReady: true,
  }),
  useActiveCollaborators: () => [],
  usePresenceBroadcast: () => undefined,
  useAISettings: () => ({ data: undefined }),
  useUpdateAISettings: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/stores/ai.store', () => {
  const useAIStore = (selector?: (s: object) => unknown) =>
    selector ? selector({ aiEnabled: false }) : false;
  useAIStore.getState = () => ({ aiEnabled: false });
  return { useAIStore };
});
vi.mock('@/stores/ai-menu.store', () => ({ useAIMenuStore: () => undefined }));
vi.mock('@/lib/analytics/product-events', () => ({
  captureProductEvent: vi.fn(),
}));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useSharedNoteArtifacts: () => ({ data: [] }),
}));

const note: Awaited<ReturnType<typeof notesApi.getNoteByToken>> = {
  id: 'note-1',
  title: 'Shared note',
  content: '<p>Existing note</p>',
  ownerId: 'owner-1',
  owner: { id: 'owner-1', name: 'Owner', avatarUrl: null },
  generalAccess: 'anyone_with_link',
  generalAccessPermission: 'editor',
  editorsCanShare: false,
  shareToken: 'shared-token',
  bucket: null,
  supertag: null,
  supertagFields: null,
  createdAt: new Date('2026-09-07T00:00:00.000Z'),
  updatedAt: new Date('2026-09-07T00:00:00.000Z'),
  accessLevel: 'editor',
};

function currentEditor(): Editor {
  const element = document.querySelector('.tiptap');
  if (
    !element ||
    !('editor' in element) ||
    !(element.editor instanceof Editor)
  ) {
    throw new Error('Expected the mounted Tiptap editor');
  }
  return element.editor;
}

async function mountEditingSession() {
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SharedNotePage />
      </TooltipProvider>
    </QueryClientProvider>
  );
  await userEvent.click(
    (await screen.findAllByRole('button', { name: 'shared.editButton' }))[0]
  );
  await waitFor(() => expect(providers).toHaveLength(1));
  const provider = providers[0];
  act(() => {
    provider.options.onAuthenticated({ scope: 'read-write' });
    provider.options.onSynced({ state: true });
  });
  const editor = currentEditor();
  await act(async () => {
    editor.commands.insertContent('Unsent local draft');
    editor.commands.setTextSelection(4);
    await Promise.resolve();
  });
  expect(editor.isEditable).toBe(true);
  return { provider, editor };
}

beforeEach(() => {
  vi.stubEnv('VITE_COLLABORATION_MODE', 'websocket');
  queryClient.clear();
  providers.length = 0;
  doc = new Y.Doc();
  awareness = new Awareness(doc);
  vi.spyOn(notesApi, 'getNoteByToken').mockResolvedValue(note);
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  awareness.destroy();
  doc.destroy();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('SharedNotePage access reconciliation lifecycle', () => {
  it.each([
    new ApiClientError('Unavailable', 503),
    new TypeError('Network unavailable'),
  ])(
    'preserves the editor, provider and local state through a recoverable background error: %s',
    async (error) => {
      const { provider, editor } = await mountEditingSession();
      const destroyAwareness = vi.spyOn(awareness, 'destroy');
      const selection = editor.state.selection.from;
      vi.mocked(notesApi.getNoteByToken).mockRejectedValue(error);

      act(() =>
        provider.options.onClose({
          event: {
            code: 1000,
            reason: COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE,
          },
        })
      );
      await waitFor(() =>
        expect(
          queryClient.getQueryState(notesQueryKeys.sharedNote('shared-token'))
            ?.status
        ).toBe('error')
      );

      expect(provider.destroy).not.toHaveBeenCalled();
      expect(destroyAwareness).not.toHaveBeenCalled();
      expect(currentEditor()).toBe(editor);
      expect(editor.isEditable).toBe(false);
      expect(editor.state.selection.from).toBe(selection);
      expect(editor.getText()).toContain('Unsent local draft');
      expect(screen.getByRole('alert')).toHaveTextContent(
        'shared.failedToLoadShared'
      );

      vi.mocked(notesApi.getNoteByToken).mockResolvedValue(note);
      await userEvent.click(
        screen.getByRole('button', { name: 'buttons.tryAgain' })
      );
      await waitFor(() =>
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      );
      await waitFor(() => expect(provider.sendToken).toHaveBeenCalledTimes(1));
      act(() => {
        provider.options.onAuthenticated({ scope: 'read-write' });
        provider.options.onSynced({ state: true });
      });
      expect(currentEditor()).toBe(editor);
      expect(editor.isEditable).toBe(true);
      expect(editor.getText()).toContain('Unsent local draft');
      expect(provider.options.document).toBe(doc);
      expect(provider.options.awareness).toBe(awareness);
      expect(providers).toHaveLength(1);
      expect(provider.destroy).not.toHaveBeenCalled();
    }
  );

  it('preserves the collaboration session when a fresh query and authentication downgrade it to viewer', async () => {
    const { provider, editor } = await mountEditingSession();
    const destroyAwareness = vi.spyOn(awareness, 'destroy');
    vi.mocked(notesApi.getNoteByToken).mockResolvedValue({
      ...note,
      accessLevel: 'viewer',
    });
    act(() =>
      provider.options.onClose({
        event: {
          code: 1000,
          reason: COLLABORATION_CLOSE_REASON.ACCESS_CHANGED,
        },
      })
    );
    await waitFor(() => expect(provider.sendToken).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.queryAllByRole('button', { name: 'shared.editButton' })
      ).toHaveLength(0)
    );
    act(() => {
      provider.options.onAuthenticated({ scope: 'readonly' });
      provider.options.onSynced({ state: true });
    });
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(destroyAwareness).not.toHaveBeenCalled();
    expect(currentEditor()).toBe(editor);
    expect(editor.isEditable).toBe(false);
    expect(editor.getText()).toContain('Unsent local draft');
    expect(providers).toHaveLength(1);
    expect(provider.options.document).toBe(doc);
    expect(provider.options.awareness).toBe(awareness);
  });

  it.each([401, 403, 404])(
    'unmounts the editing session for terminal HTTP %s even with retained data',
    async (status) => {
      const { provider, editor } = await mountEditingSession();
      const destroyAwareness = vi.spyOn(awareness, 'destroy');
      vi.mocked(notesApi.getNoteByToken).mockRejectedValue(
        new ApiClientError('Denied', status)
      );
      act(() =>
        provider.options.onClose({
          event: {
            code: 1000,
            reason: COLLABORATION_CLOSE_REASON.ACCESS_CHANGED,
          },
        })
      );
      await waitFor(() => expect(provider.destroy).toHaveBeenCalledTimes(1));
      expect(destroyAwareness).toHaveBeenCalled();
      expect(editor.isDestroyed).toBe(true);
      expect(
        queryClient.getQueryData(notesQueryKeys.sharedNote('shared-token'))
      ).toEqual(note);
      expect(screen.queryByText('Unsent local draft')).not.toBeInTheDocument();
    }
  );
});
