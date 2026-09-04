import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileEditorHeader } from './MobileEditorHeader';

vi.mock('@/components/notes/NoteActionsMenu', () => ({
  NoteActionsMenu: () => <div data-testid="note-actions-menu" />,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseProps = {
  noteId: 'n1',
  noteTitle: 'My note',
  onShareClick: vi.fn(),
  onBack: vi.fn(),
};

describe('MobileEditorHeader', () => {
  it('stays in the page flow so layout above it can push it down', () => {
    render(
      <MobileEditorHeader
        {...baseProps}
        accessLevel="owner"
        editorsCanShare={false}
      />
    );
    const bar = screen.getByRole('button', { name: 'editor.back' })
      .parentElement as HTMLElement;
    expect(bar).toHaveClass('sticky');
    expect(bar).not.toHaveClass('fixed');
  });

  it('shows the delete menu for an owner', () => {
    render(
      <MobileEditorHeader
        {...baseProps}
        accessLevel="owner"
        editorsCanShare={false}
      />
    );
    expect(screen.getByTestId('note-actions-menu')).toBeInTheDocument();
  });

  it('hides the delete menu for a viewer', () => {
    render(
      <MobileEditorHeader
        {...baseProps}
        accessLevel="viewer"
        editorsCanShare={false}
      />
    );
    expect(screen.queryByTestId('note-actions-menu')).not.toBeInTheDocument();
  });

  it('hides the delete menu for an editor', () => {
    render(
      <MobileEditorHeader {...baseProps} accessLevel="editor" editorsCanShare />
    );
    expect(screen.queryByTestId('note-actions-menu')).not.toBeInTheDocument();
  });
});
