import { act, render } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { imagesApi } from '@knowtis/api-client';
import type * as ApiClientModule from '@knowtis/api-client';
import { TooltipProvider } from '@knowtis/design-system';
import { IMAGE_NODE_NAME, YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';
import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { CollaborativeEditor } from './CollaborativeEditor';

const NOTE_ID = 'n1';
const SHARE_TOKEN = 'share-token';
const PASTED_URL = 'https://example.com/chart.png';
const STORED_URL = `https://${STORED_IMAGE_HOST}/notes/${NOTE_ID}/imported-a1.png`;

let doc: Y.Doc;
let editor: Editor | null = null;

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClientModule>()),
  imagesApi: { upload: vi.fn(), import: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
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
  isWebSocketEnabled: () => true,
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

async function pasteForeignImage(shareToken?: string): Promise<Editor> {
  await act(async () => {
    render(
      <TooltipProvider>
        <CollaborativeEditor
          noteId={NOTE_ID}
          initialContent=""
          onUpdate={vi.fn()}
          shareToken={shareToken}
          onEditorReady={(ready) => {
            editor = ready;
          }}
        />
      </TooltipProvider>
    );
    await Promise.resolve();
  });
  if (!editor) {
    throw new Error('the editor did not mount');
  }
  const html = `<img src="${PASTED_URL}" alt="Chart">`;
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/html' ? html : ''),
      types: ['text/html'],
      files: [],
    },
  });
  const view = editor.view;
  await act(async () => {
    view.dom.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return editor;
}

function imageSrcs(current: Editor): unknown[] {
  const found: unknown[] = [];
  current.state.doc.descendants((node) => {
    if (node.type.name === IMAGE_NODE_NAME) {
      found.push(node.attrs['src']);
    }
  });
  return found;
}

describe('CollaborativeEditor pasted image import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doc = new Y.Doc();
    editor = null;
    vi.mocked(imagesApi.import).mockResolvedValue({
      id: 'image-1',
      url: STORED_URL,
      width: null,
      height: null,
    });
  });

  it('copies a pasted foreign image into the note for a signed-in session', async () => {
    const current = await pasteForeignImage();

    expect(imageSrcs(current)).toEqual([STORED_URL]);
    expect(imagesApi.import).toHaveBeenCalledWith({
      noteId: NOTE_ID,
      url: PASTED_URL,
      signal: expect.any(AbortSignal),
    });
  });

  it('keeps a pasted foreign image as it is for a share-link session, which cannot store images', async () => {
    const current = await pasteForeignImage(SHARE_TOKEN);

    expect(imageSrcs(current)).toEqual([PASTED_URL]);
    expect(imagesApi.import).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
