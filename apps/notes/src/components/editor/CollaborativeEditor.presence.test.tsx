import type * as ActiveCollaboratorsModule from '@/hooks/useActiveCollaborators';
import { act, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import * as Y from 'yjs';

import { TooltipProvider } from '@knowtis/design-system';
import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import { CollaborativeEditor } from './CollaborativeEditor';

const COLLABORATOR = { name: 'Quiet Heron', color: '#22d3ee' };

let connectionAwareness: Awareness | null = null;
let doc: Y.Doc;
const readyEditors: Editor[] = [];
const owned: Array<{ destroy: () => void }> = [];

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
  useAuthUser: () => ({ id: 'user-1', isAnonymous: false }),
}));
vi.mock('@/collaboration/useHocuspocusCollaboration', () => ({
  getCollaborationServerUrl: () => 'ws://test/collaboration',
  isWebSocketEnabled: () => true,
  useHocuspocusCollaboration: () => ({
    status: 'connected',
    isConnected: true,
    isSynced: true,
    readOnly: false,
    awareness: connectionAwareness,
  }),
}));
vi.mock('@/hooks', async () => ({
  useCollaborativeEditor: () => ({
    yDoc: doc,
    yXmlFragment: doc.getXmlFragment(YJS_XML_FRAGMENT_NAME),
    currentUser: { name: 'Tester', color: '#000' },
    isReady: true,
  }),
  useActiveCollaborators: (
    await vi.importActual<typeof ActiveCollaboratorsModule>(
      '@/hooks/useActiveCollaborators'
    )
  ).useActiveCollaborators,
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

function newConnectionAwareness(): Awareness {
  const awareness = new Awareness(doc);
  owned.push(awareness);
  return awareness;
}

function collaboratorJoins(awareness: Awareness) {
  const collaboratorDoc = new Y.Doc();
  const collaborator = new Awareness(collaboratorDoc);
  owned.push(collaborator, collaboratorDoc);
  collaborator.setLocalState({
    user: COLLABORATOR,
    cursor: { anchor: 1, head: 1 },
  });
  applyAwarenessUpdate(
    awareness,
    encodeAwarenessUpdate(collaborator, [collaborator.clientID]),
    'remote'
  );
}

function recordReadyEditor(editor: Editor) {
  readyEditors.push(editor);
}

const onUpdate = vi.fn();

function editorTree() {
  return (
    <TooltipProvider>
      <CollaborativeEditor
        noteId="n1"
        initialContent=""
        onUpdate={onUpdate}
        onEditorReady={recordReadyEditor}
      />
    </TooltipProvider>
  );
}

describe('CollaborativeEditor presence across connections', () => {
  beforeEach(() => {
    doc = new Y.Doc();
    readyEditors.length = 0;
  });

  afterEach(() => {
    owned.splice(0).forEach((resource) => resource.destroy());
    connectionAwareness = null;
    doc.destroy();
  });

  it('moves the same editor and its selection onto the new connection', async () => {
    connectionAwareness = newConnectionAwareness();
    const { rerender } = render(editorTree());
    const [editor] = readyEditors;
    act(() => {
      editor.commands.insertContent('Draft in progress');
      editor.commands.setTextSelection({ from: 2, to: 6 });
    });
    const previous = connectionAwareness;

    connectionAwareness = newConnectionAwareness();
    await act(async () => rerender(editorTree()));

    expect(readyEditors).toEqual([editor]);
    expect(editor.isDestroyed).toBe(false);
    expect(editor.state.selection.from).toBe(2);
    expect(editor.state.selection.to).toBe(6);
    expect(editor.getText()).toContain('Draft in progress');
    expect(connectionAwareness.getLocalState()?.['cursor']).toEqual({
      anchor: 2,
      head: 6,
    });
    expect(previous.getLocalState()?.['cursor']).toBeNull();
  });

  it('lists the collaborators of the new connection', async () => {
    connectionAwareness = newConnectionAwareness();
    const { rerender } = render(editorTree());

    connectionAwareness = newConnectionAwareness();
    await act(async () => rerender(editorTree()));
    act(() => {
      if (connectionAwareness) {
        collaboratorJoins(connectionAwareness);
      }
    });

    expect(screen.getByTitle(COLLABORATOR.name)).toBeInTheDocument();
  });
});
