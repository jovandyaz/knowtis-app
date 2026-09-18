import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';
import type { NoteAccessLevel } from '@knowtis/shared-types';

import type { DocumentConnectionState } from './CollaborativeEditor.types';
import { NoteControlsPortal } from './NoteControlsPortal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/notes/NoteActionsMenu', () => ({
  NoteActionsMenu: () => <div data-testid="note-actions-menu" />,
}));
vi.mock('@/components/notes/ShareDialog', () => ({
  ShareDialog: () => null,
}));

const PORTAL_TARGET_ID = 'note-controls-portal';

function note(accessLevel: NoteAccessLevel) {
  return {
    id: 'n1',
    title: 'My note',
    accessLevel,
    editorsCanShare: false,
    generalAccess: 'restricted' as const,
    generalAccessPermission: 'viewer' as const,
    shareToken: null,
  };
}

async function renderControls(
  accessLevel: NoteAccessLevel,
  connectionState: DocumentConnectionState | null
) {
  await act(async () => {
    render(
      <TooltipProvider>
        <NoteControlsPortal
          note={note(accessLevel)}
          connectionState={connectionState}
          isSaving
          hasSaved={false}
          shareDialogOpen={false}
          onShareDialogOpenChange={vi.fn()}
        />
      </TooltipProvider>
    );
    await Promise.resolve();
  });
}

describe('NoteControlsPortal', () => {
  let portalTarget: HTMLElement;

  beforeEach(() => {
    portalTarget = document.createElement('div');
    portalTarget.id = PORTAL_TARGET_ID;
    document.body.appendChild(portalTarget);
  });

  afterEach(() => {
    cleanup();
    portalTarget.remove();
  });

  it('places the connection status ahead of the save indicator in the header', async () => {
    await renderControls('owner', 'connected');

    const status = screen.getByRole('status');
    const saveIndicator = screen.getByText('states.saving');

    expect(portalTarget).toContainElement(status);
    expect(
      status.compareDocumentPosition(saveIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it.each<DocumentConnectionState>(['connected', 'disconnected'])(
    'tells a viewer the note is %s without offering a save indicator',
    async (state) => {
      await renderControls('viewer', state);

      expect(screen.getByRole('status')).toHaveTextContent(
        `editor.connection.${state}`
      );
      expect(screen.queryByText('states.saving')).not.toBeInTheDocument();
    }
  );
});
