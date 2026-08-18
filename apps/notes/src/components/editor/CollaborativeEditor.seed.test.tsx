import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { TooltipProvider } from '@knowtis/design-system';
import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import { CollaborativeEditor } from './CollaborativeEditor';

let wsEnabled = true;
let localFirst = false;
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
  isWebSocketEnabled: () => wsEnabled,
  useHocuspocusCollaboration: () => ({
    status: 'connected',
    isConnected: true,
    isSynced: true,
    readOnly: false,
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

const CONTENT = '<h2>Server truth</h2><p>from the note query</p>';

async function mount() {
  await act(async () => {
    render(
      <TooltipProvider>
        <CollaborativeEditor
          noteId="n1"
          initialContent={CONTENT}
          onUpdate={vi.fn()}
          localFirst={localFirst}
        />
      </TooltipProvider>
    );
    await Promise.resolve();
  });
}

describe('CollaborativeEditor initial-content seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localFirst = false;
    doc = new Y.Doc();
  });

  it('never seeds the CRDT fragment client-side in websocket mode', async () => {
    wsEnabled = true;
    await mount();

    const fragment = doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
    expect(fragment.toString()).not.toContain('Server truth');
  });

  it('still seeds in local-first mode, which has no provider to hydrate from', async () => {
    wsEnabled = true;
    localFirst = true;
    await mount();

    const fragment = doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
    expect(fragment.toString()).toContain('Server truth');
  });

  it('seeds from initialContent when websocket collaboration is disabled', async () => {
    wsEnabled = false;
    await mount();

    const fragment = doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
    expect(fragment.toString()).toContain('Server truth');
  });
});
