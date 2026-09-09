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

const buttonNamed = (name: string) => screen.getByRole('button', { name });

const noButtonNamed = (name: string) =>
  expect(screen.queryByRole('button', { name })).toBeNull();

describe('SharedNoteHeader', () => {
  it('badges an editor once', () => {
    renderHeader({ canEdit: true });

    expect(screen.getByText('shared.editorBadge')).toBeInTheDocument();
    expect(screen.queryByText('shared.viewOnlyBadge')).toBeNull();
  });

  it('badges a viewer once', () => {
    renderHeader({ canEdit: false });

    expect(screen.getByText('shared.viewOnlyBadge')).toBeInTheDocument();
    expect(screen.queryByText('shared.editorBadge')).toBeNull();
  });

  it('offers the edit toggle to an editor who is reading', () => {
    renderHeader({ canEdit: true, isEditing: false });

    expect(buttonNamed('shared.editButton')).toBeInTheDocument();
    noButtonNamed('shared.viewButton');
  });

  it('flips the toggle to view once the editor is editing', () => {
    renderHeader({ canEdit: true, isEditing: true });

    expect(buttonNamed('shared.viewButton')).toBeInTheDocument();
    noButtonNamed('shared.editButton');
  });

  it('withholds the toggle from a viewer', () => {
    renderHeader({ canEdit: false });

    noButtonNamed('shared.editButton');
    noButtonNamed('shared.viewButton');
  });

  it('still offers a way out of the editor after a mid-session downgrade', async () => {
    const onStopEditing = vi.fn();
    renderHeader({ canEdit: false, isEditing: true, onStopEditing });

    noButtonNamed('shared.editButton');

    await userEvent.click(buttonNamed('shared.viewButton'));
    expect(onStopEditing).toHaveBeenCalledTimes(1);
  });

  it('starts and stops editing through the toggle', async () => {
    const onStartEditing = vi.fn();
    const onStopEditing = vi.fn();
    const { unmount } = renderHeader({ onStartEditing, onStopEditing });

    await userEvent.click(buttonNamed('shared.editButton'));
    expect(onStartEditing).toHaveBeenCalledTimes(1);
    unmount();

    renderHeader({ isEditing: true, onStartEditing, onStopEditing });
    await userEvent.click(buttonNamed('shared.viewButton'));
    expect(onStopEditing).toHaveBeenCalledTimes(1);
  });

  it('offers sign-in when the visitor has no account', () => {
    renderHeader({ offerSignIn: true });

    expect(
      screen.getByRole('link', { name: 'shared.signIn' })
    ).toBeInTheDocument();
  });

  it('hides sign-in from a visitor who already has one', () => {
    renderHeader({ offerSignIn: false });

    expect(screen.queryByRole('link', { name: 'shared.signIn' })).toBeNull();
  });

  it('builds its controls out of design-system buttons', () => {
    renderHeader();

    for (const name of ['buttons.copyLink', 'shared.editButton']) {
      expect(buttonNamed(name)).toHaveClass(...DESIGN_SYSTEM_BUTTON_CLASSES);
    }
  });
});
