import type { ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';

import { SharedNoteHeader } from './SharedNoteHeader';

const DESIGN_SYSTEM_BUTTON_CLASSES = [
  'inline-flex',
  'whitespace-nowrap',
  'font-medium',
];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="/login">{children}</a>
  ),
}));

const defaultProps = {
  canEdit: true,
  isEditing: false,
  isPreparingEdit: false,
  copied: false,
  offerSignIn: false,
  sharedPath: '/s/tok',
  ownerName: 'Owner',
  updatedAt: new Date('2026-08-14T00:00:00.000Z'),
  onCopyLink: vi.fn(),
  onStartEditing: vi.fn(),
  onStopEditing: vi.fn(),
};

const renderHeader = (props: Partial<typeof defaultProps> = {}) =>
  render(
    <TooltipProvider>
      <SharedNoteHeader {...defaultProps} {...props} />
    </TooltipProvider>
  );

const buttonsNamed = (name: string) =>
  screen.queryAllByRole('button', { name });

describe('SharedNoteHeader', () => {
  it('badges an editor on every variant', () => {
    renderHeader({ canEdit: true });

    expect(screen.getAllByText('shared.editorBadge')).toHaveLength(2);
    expect(screen.queryByText('shared.viewOnlyBadge')).toBeNull();
  });

  it('badges a viewer on every variant', () => {
    renderHeader({ canEdit: false });

    expect(screen.getAllByText('shared.viewOnlyBadge')).toHaveLength(2);
    expect(screen.queryByText('shared.editorBadge')).toBeNull();
  });

  it('offers the edit toggle to an editor who is reading', () => {
    renderHeader({ canEdit: true, isEditing: false });

    expect(buttonsNamed('shared.editButton')).toHaveLength(2);
    expect(buttonsNamed('shared.viewButton')).toHaveLength(0);
  });

  it('flips the toggle to view once the editor is editing', () => {
    renderHeader({ canEdit: true, isEditing: true });

    expect(buttonsNamed('shared.viewButton')).toHaveLength(2);
    expect(buttonsNamed('shared.editButton')).toHaveLength(0);
  });

  it('withholds the toggle from a viewer', () => {
    renderHeader({ canEdit: false });

    expect(buttonsNamed('shared.editButton')).toHaveLength(0);
    expect(buttonsNamed('shared.viewButton')).toHaveLength(0);
  });

  it('still offers a way out of the editor after a mid-session downgrade', async () => {
    const onStopEditing = vi.fn();
    renderHeader({ canEdit: false, isEditing: true, onStopEditing });

    const viewButtons = buttonsNamed('shared.viewButton');
    expect(viewButtons).toHaveLength(2);
    expect(buttonsNamed('shared.editButton')).toHaveLength(0);

    await userEvent.click(viewButtons[0]);
    expect(onStopEditing).toHaveBeenCalledTimes(1);
  });

  it('starts and stops editing through the toggle', async () => {
    const onStartEditing = vi.fn();
    const onStopEditing = vi.fn();
    const { unmount } = renderHeader({ onStartEditing, onStopEditing });

    await userEvent.click(buttonsNamed('shared.editButton')[0]);
    expect(onStartEditing).toHaveBeenCalledTimes(1);
    unmount();

    renderHeader({ isEditing: true, onStartEditing, onStopEditing });
    await userEvent.click(buttonsNamed('shared.viewButton')[0]);
    expect(onStopEditing).toHaveBeenCalledTimes(1);
  });

  it('offers sign-in on every variant when the visitor has no account', () => {
    renderHeader({ offerSignIn: true });

    expect(screen.getAllByRole('link', { name: 'shared.signIn' })).toHaveLength(
      2
    );
  });

  it('hides sign-in from a visitor who already has one', () => {
    renderHeader({ offerSignIn: false });

    expect(screen.queryAllByRole('link', { name: 'shared.signIn' })).toEqual(
      []
    );
  });

  it('builds both variants out of design-system buttons', () => {
    renderHeader();

    const copyButtons = buttonsNamed('buttons.copyLink');
    const editButtons = buttonsNamed('shared.editButton');
    expect(copyButtons).toHaveLength(2);
    expect(editButtons).toHaveLength(2);
    for (const button of [...copyButtons, ...editButtons]) {
      expect(button).toHaveClass(...DESIGN_SYSTEM_BUTTON_CLASSES);
    }
  });
});
