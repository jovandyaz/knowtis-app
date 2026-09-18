import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';
import type { NoteAccessLevel } from '@knowtis/shared-types';

import type { DocumentConnectionState } from './CollaborativeEditor.types';
import { NoteControlsPortal, type NoteSaveState } from './NoteControlsPortal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/notes/NoteActionsMenu', () => ({
  NoteActionsMenu: ({ triggerClassName }: { triggerClassName?: string }) => (
    <button data-testid="note-actions-menu" className={triggerClassName}>
      <svg aria-hidden />
    </button>
  ),
}));
vi.mock('@/components/notes/ShareDialog', () => ({
  ShareDialog: () => null,
}));

const PORTAL_TARGET_ID = 'note-controls-portal';
const WIDE_SCREEN_STATUS_RESERVATION =
  '2xl:auto-cols-[minmax(--spacing(20),max-content)]';

const SAVE_LABELS: Record<Exclude<NoteSaveState, 'idle'>, string> = {
  pending: 'states.pendingChanges',
  saving: 'states.saving',
  saved: 'states.saved',
  error: 'states.saveFailed',
};

function visibleStatusText(label: string) {
  const matches = screen.getAllByText(label);
  const visible = matches.find(
    (el) => el.closest('[aria-label="editor.saveStatus"]') === null
  );
  if (!visible) {
    throw new Error(`No visible (non-announcement) match for "${label}"`);
  }
  return visible;
}

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
  connectionState: DocumentConnectionState | null,
  saveState: NoteSaveState = 'saving'
) {
  await act(async () => {
    render(
      <TooltipProvider>
        <NoteControlsPortal
          note={note(accessLevel)}
          connectionState={connectionState}
          saveState={saveState}
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

    const [connectionStatus] = screen.getAllByRole('status');
    const saveIndicator = screen.getByText('states.saving');

    expect(portalTarget).toContainElement(connectionStatus);
    expect(
      connectionStatus.compareDocumentPosition(saveIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it.each<[DocumentConnectionState | null, NoteSaveState, string[]]>([
    ['connected', 'saving', ['editor.connection.connected', 'states.saving']],
    ['connected', 'idle', ['editor.connection.connected']],
    [null, 'saving', ['states.saving']],
  ])(
    'reserves wide-screen room for the %s connection and %s save status as one group',
    async (connectionState, saveState, statusTexts) => {
      await renderControls('owner', connectionState, saveState);

      const statuses = statusTexts.map(
        (text) => visibleStatusText(text).parentElement
      );
      const statusGroup = statuses[0]?.parentElement;

      expect(statusGroup?.parentElement).toBe(portalTarget);
      expect(Array.from(statusGroup?.children ?? [])).toEqual(statuses);
      expect(statusGroup).toHaveClass(
        'shrink-0',
        'grid-flow-col',
        WIDE_SCREEN_STATUS_RESERVATION
      );
    }
  );

  it('keeps the save announcement, Share button and note menu outside the reserved group', async () => {
    await renderControls('owner', 'connected');

    const outsideGroup = [
      screen.getByRole('status', { name: 'editor.saveStatus' }),
      screen.getByRole('button', { name: 'editor.share' }),
      screen.getByTestId('note-actions-menu'),
    ];

    for (const element of outsideGroup) {
      expect(element.parentElement).toBe(portalTarget);
    }
  });

  it('keeps the header actions from shrinking so the context label gives first', async () => {
    await renderControls('owner', 'connected');

    expect(screen.getByRole('button', { name: 'editor.share' })).toHaveClass(
      'shrink-0'
    );
    expect(screen.getByTestId('note-actions-menu')).toHaveClass('shrink-0');
  });

  it.each<[NoteAccessLevel, NoteSaveState]>([
    ['owner', 'idle'],
    ['viewer', 'saving'],
  ])(
    'leaves no empty status group to take a header gap for a %s with nothing to report',
    async (accessLevel, saveState) => {
      await renderControls(accessLevel, null, saveState);

      expect(
        portalTarget.querySelectorAll(':scope > :empty:not(.sr-only)')
      ).toHaveLength(0);
    }
  );

  it('keeps a persistent, visually hidden live region for the save status', async () => {
    await renderControls('owner', 'connected', 'idle');

    const saveStatusRegion = screen.getByRole('status', {
      name: 'editor.saveStatus',
    });

    expect(saveStatusRegion).toHaveAttribute('aria-live', 'polite');
    expect(saveStatusRegion).toHaveAttribute('aria-atomic', 'true');
    expect(saveStatusRegion).toHaveClass('sr-only');
    expect(saveStatusRegion).toBeEmptyDOMElement();
  });

  it('does not let the idle live region consume a flex gap in the header', async () => {
    // jsdom parses no stylesheet by default; injecting the compiled `.sr-only`
    // rule confirms the real layout behavior instead of assuming the class name is enough.
    const style = document.createElement('style');
    style.textContent =
      '.sr-only{clip-path:inset(50%);white-space:nowrap;border-width:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}';
    document.head.appendChild(style);

    await renderControls('owner', 'connected', 'idle');

    const saveStatusRegion = screen.getByRole('status', {
      name: 'editor.saveStatus',
    });

    expect(getComputedStyle(saveStatusRegion).position).toBe('absolute');

    style.remove();
  });

  it('renders no visible save element while idle, leaving only the other portal children', async () => {
    await renderControls('owner', 'connected', 'idle');

    expect(screen.getByText('editor.connection.connected')).toBeInTheDocument();
    expect(screen.getByLabelText('editor.share')).toBeInTheDocument();
    for (const label of Object.values(SAVE_LABELS)) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('places the save failure text inside a polite live region', async () => {
    await renderControls('owner', 'connected', 'error');

    const saveStatusRegion = screen.getByRole('status', {
      name: 'editor.saveStatus',
    });

    expect(saveStatusRegion).toHaveAttribute('aria-live', 'polite');
    expect(
      within(saveStatusRegion).getByText('states.saveFailed')
    ).toBeInTheDocument();
  });

  it('keeps a visible saved indicator out of the live region', async () => {
    await renderControls('owner', 'connected', 'saved');

    const saveStatusRegion = screen.getByRole('status', {
      name: 'editor.saveStatus',
    });

    expect(screen.getByText('states.saved')).toBeInTheDocument();
    expect(within(saveStatusRegion).queryByText('states.saved')).toBeNull();
    expect(saveStatusRegion).toBeEmptyDOMElement();
  });

  it.each(
    Object.entries(SAVE_LABELS) as [Exclude<NoteSaveState, 'idle'>, string][]
  )('announces the %s save state with its own label', async (state, label) => {
    await renderControls('owner', 'connected', state);

    expect(visibleStatusText(label)).toBeInTheDocument();
  });

  it('keeps a failed save visible instead of fading it away', async () => {
    await renderControls('owner', 'connected', 'error');

    expect(
      visibleStatusText('states.saveFailed').parentElement
    ).not.toHaveClass('animate-fade-out');
  });

  it('fades the success away once it has been read', async () => {
    await renderControls('owner', 'connected', 'saved');

    expect(screen.getByText('states.saved').parentElement).toHaveClass(
      'animate-fade-out'
    );
  });

  it.each<DocumentConnectionState>(['connected', 'disconnected'])(
    'tells a viewer the note is %s without offering a save indicator',
    async (state) => {
      await renderControls('viewer', state);

      expect(screen.getByRole('status')).toHaveTextContent(
        `editor.connection.${state}`
      );
      expect(screen.queryByText('states.saving')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('status', { name: 'editor.saveStatus' })
      ).not.toBeInTheDocument();
    }
  );

  it('keeps a save failure away from a viewer, who never writes over REST', async () => {
    await renderControls('viewer', 'connected', 'error');

    expect(screen.queryByText('states.saveFailed')).not.toBeInTheDocument();
  });

  it('translates the access badge instead of printing an English literal', async () => {
    await renderControls('viewer', 'connected');

    expect(screen.getByText('share.viewer')).toBeInTheDocument();
    expect(screen.queryByText('Viewer')).not.toBeInTheDocument();
  });

  it('leaves the owner badge off the header', async () => {
    await renderControls('owner', 'connected');

    expect(screen.queryByText('share.owner')).not.toBeInTheDocument();
  });
});
