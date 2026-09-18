import type { CollaborationStatus } from '@/collaboration/useHocuspocusCollaboration';
import { act, render, screen, type RenderResult } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { TooltipProvider } from '@knowtis/design-system';
import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';
import type * as SharedHooks from '@knowtis/shared-hooks';

import { CollaborativeEditor } from './CollaborativeEditor';
import type { DocumentConnectionState } from './CollaborativeEditor.types';

let isSynced = false;
let isReady = true;
let status: CollaborationStatus = 'connected';
let wsEnabled = true;
let doc: Y.Doc;

const onConnectionStateChange =
  vi.fn<(state: DocumentConnectionState | null) => void>();

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
  useAuthUser: () => ({ isAnonymous: false }),
}));
vi.mock('@/collaboration/useHocuspocusCollaboration', () => ({
  getCollaborationServerUrl: () => 'ws://test/collaboration',
  isWebSocketEnabled: () => wsEnabled,
  useHocuspocusCollaboration: () => ({
    status,
    isConnected: status === 'connected',
    isSynced,
    readOnly: false,
  }),
}));
vi.mock('@/hooks', () => ({
  useCollaborativeEditor: () => ({
    yDoc: doc,
    yXmlFragment: doc.getXmlFragment(YJS_XML_FRAGMENT_NAME),
    awareness: null,
    currentUser: { name: 'Tester', color: '#000' },
    isReady,
  }),
  useActiveCollaborators: () => [],
  usePresenceBroadcast: () => undefined,
  useAISettings: () => ({ data: undefined }),
  useUpdateAISettings: () => ({ mutate: vi.fn() }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/stores/ai.store', () => {
  const useAIStore = (selector?: (s: object) => unknown) =>
    selector ? selector({ aiEnabled: false }) : false;
  useAIStore.getState = () => ({ aiEnabled: false });
  return { useAIStore };
});
vi.mock('@/stores/ai-menu.store', () => ({ useAIMenuStore: () => undefined }));
vi.mock('@knowtis/shared-hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedHooks>()),
  useTypewriter: ({ texts }: { texts: string[] }) => texts[0] ?? '',
}));

const PLACEHOLDER = 'Write something';
const NOTE_BODY = 'A paragraph the user can already read';

function editorElement() {
  return (
    <TooltipProvider>
      <CollaborativeEditor
        noteId="n1"
        initialContent=""
        onUpdate={vi.fn()}
        placeholder={PLACEHOLDER}
        onConnectionStateChange={onConnectionStateChange}
      />
    </TooltipProvider>
  );
}

async function mount(): Promise<RenderResult> {
  let view: RenderResult | undefined;
  await act(async () => {
    view = render(editorElement());
    await Promise.resolve();
  });
  if (!view) {
    throw new Error('render did not produce a view');
  }
  return view;
}

async function rerender(view: RenderResult) {
  await act(async () => {
    view.rerender(editorElement());
    await Promise.resolve();
  });
}

function seedDocument(text: string) {
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(text)]);
  doc.getXmlFragment(YJS_XML_FRAGMENT_NAME).insert(0, [paragraph]);
}

const loadingSkeleton = () =>
  screen.queryByRole('status', { name: 'editor.loadingEditor' });

const typewriterPlaceholder = () => screen.queryByText(PLACEHOLDER);

function resetCollaboration() {
  vi.clearAllMocks();
  isSynced = false;
  isReady = true;
  status = 'connected';
  wsEnabled = true;
  doc = new Y.Doc();
}

describe('CollaborativeEditor loading affordances', () => {
  beforeEach(resetCollaboration);

  it('shows the skeleton instead of a visible loading message while the provider boots', async () => {
    isReady = false;
    await mount();

    expect(loadingSkeleton()).toBeInTheDocument();
    expect(screen.getByText('editor.loadingEditor')).toHaveClass('sr-only');
  });

  it('shows the skeleton, not the typewriter, until the socket syncs', async () => {
    await mount();

    expect(loadingSkeleton()).toBeInTheDocument();
    expect(typewriterPlaceholder()).toBeNull();
  });

  it('swaps the skeleton for the typewriter once an empty note syncs', async () => {
    isSynced = true;
    await mount();

    expect(typewriterPlaceholder()).toBeInTheDocument();
    expect(loadingSkeleton()).toBeNull();
  });

  it('keeps a synced note readable when the socket drops on a reconnect', async () => {
    isSynced = true;
    seedDocument(NOTE_BODY);
    const view = await mount();
    expect(screen.getByText(NOTE_BODY)).toBeInTheDocument();

    isSynced = false;
    await rerender(view);

    expect(loadingSkeleton()).toBeNull();
    expect(screen.getByText(NOTE_BODY)).toBeInTheDocument();
  });
});

describe('CollaborativeEditor connection reporting', () => {
  beforeEach(resetCollaboration);

  it('reports a connected document once the socket syncs', async () => {
    isSynced = true;
    await mount();

    expect(onConnectionStateChange).toHaveBeenLastCalledWith('connected');
  });

  it('reports syncing while a connected socket still hydrates', async () => {
    await mount();

    expect(onConnectionStateChange).toHaveBeenLastCalledWith('syncing');
  });

  it('reports a dropped socket', async () => {
    status = 'disconnected';
    await mount();

    expect(onConnectionStateChange).toHaveBeenLastCalledWith('disconnected');
  });

  it('reports a revoked document', async () => {
    status = 'accessDenied';
    await mount();

    expect(onConnectionStateChange).toHaveBeenLastCalledWith('accessDenied');
  });

  it('reports connecting while credentials are being recovered', async () => {
    status = 'authenticationFailed';
    await mount();

    expect(onConnectionStateChange).toHaveBeenLastCalledWith('connecting');
  });

  it('reports no state at all when websockets are disabled', async () => {
    wsEnabled = false;
    isSynced = true;
    await mount();

    expect(onConnectionStateChange).toHaveBeenLastCalledWith(null);
  });

  it('reports once per change, not once per render', async () => {
    const view = await mount();
    await rerender(view);

    isSynced = true;
    await rerender(view);

    expect(onConnectionStateChange.mock.calls).toEqual([
      ['syncing'],
      ['connected'],
    ]);
  });

  it('no longer floats a dot under the sticky toolbar', async () => {
    isSynced = true;
    const { container } = await mount();

    expect(container.querySelector('.absolute.top-2.right-2')).toBeNull();
  });
});
