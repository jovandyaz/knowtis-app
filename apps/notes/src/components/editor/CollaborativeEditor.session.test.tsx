import { ROUTES } from '@/config';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollaborativeEditor } from './CollaborativeEditor';

const performSessionLogout = vi.fn();
const navigate = vi.fn();
let expireSession: (() => void) | undefined;

vi.mock('@/auth', () => ({
  authStore: { getState: () => ({}) },
  tokenStorage: {},
  performSessionLogout: (...a: unknown[]) => performSessionLogout(...a),
  refreshAccessToken: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));
vi.mock('@/collaboration/useHocuspocusCollaboration', () => ({
  getCollaborationServerUrl: () => 'ws://test/collaboration',
  isWebSocketEnabled: () => true,
  useHocuspocusCollaboration: (opts: { onSessionExpired?: () => void }) => {
    expireSession = opts.onSessionExpired;
    return {
      status: 'connected',
      isConnected: true,
      isSynced: true,
      readOnly: false,
    };
  },
}));
vi.mock('@/hooks', () => ({
  useCollaborativeEditor: () => ({
    yDoc: {},
    yXmlFragment: null,
    awareness: null,
    currentUser: { name: 'Tester', color: '#000' },
    isReady: false,
  }),
  useActiveCollaborators: () => [],
  usePresenceBroadcast: () => undefined,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/stores/ai.store', () => ({ useAIStore: () => false }));
vi.mock('@/stores/ai-menu.store', () => ({ useAIMenuStore: () => undefined }));

describe('CollaborativeEditor session expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expireSession = undefined;
  });

  it('sends a signed-in user to the login page', () => {
    render(
      <CollaborativeEditor noteId="n1" initialContent="" onUpdate={vi.fn()} />
    );

    expireSession?.();

    expect(performSessionLogout).toHaveBeenCalledTimes(1);
    const [{ redirect }] = performSessionLogout.mock.calls[0] as [
      { redirect?: () => void },
    ];
    expect(redirect).toBeTypeOf('function');
    redirect?.();
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: ROUTES.LOGIN })
    );
  });

  it('keeps a share-link visitor on the note and never offers a redirect', () => {
    const onEditDenied = vi.fn();
    render(
      <CollaborativeEditor
        noteId="n1"
        initialContent=""
        onUpdate={vi.fn()}
        shareToken="tok"
        onEditDenied={onEditDenied}
      />
    );

    expireSession?.();

    expect(performSessionLogout).toHaveBeenCalledTimes(1);
    const [args] = performSessionLogout.mock.calls[0] as [
      { redirect?: () => void },
    ];
    expect(args.redirect).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
    expect(onEditDenied).toHaveBeenCalledTimes(1);
  });
});
