import { act, render, screen, type RenderResult } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { TooltipProvider } from '@knowtis/design-system';
import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';
import type * as SharedHooks from '@knowtis/shared-hooks';

import { CollaborativeEditor } from './CollaborativeEditor';

let isSynced = false;
let isReady = true;
let doc: Y.Doc;

vi.mock('@/auth', () => ({
  authStore: { getState: () => ({}) },
  tokenStorage: {},
  performSessionLogout: vi.fn(),
  refreshAccessToken: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('@/collaboration/useHocuspocusCollaboration', () => ({
  getCollaborationServerUrl: () => 'ws://test/collaboration',
  isWebSocketEnabled: () => true,
  useHocuspocusCollaboration: () => ({
    status: 'connected',
    isConnected: true,
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

describe('CollaborativeEditor loading affordances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSynced = false;
    isReady = true;
    doc = new Y.Doc();
  });

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
