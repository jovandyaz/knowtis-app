import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@knowtis/design-system';

import {
  isInLinkConfirmation,
  LinkConfirmationDialog,
} from './LinkConfirmationDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const OVERLAY_SELECTOR = '[data-knowtis-dialog-overlay]';

function overlay(): Element {
  const found = document.querySelector(OVERLAY_SELECTOR);
  if (!found) {
    throw new Error('dialog overlay not found');
  }
  return found;
}

describe('isInLinkConfirmation', () => {
  it('recognises the content and the overlay of the link confirmation', () => {
    render(
      <LinkConfirmationDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        url="https://example.com/page"
      />
    );

    const dialog = screen.getByRole('dialog');

    expect(isInLinkConfirmation(dialog)).toBe(true);
    expect(
      isInLinkConfirmation(
        screen.getByRole('button', { name: 'notes:ai.linkConfirm.open' })
      )
    ).toBe(true);
    expect(isInLinkConfirmation(overlay())).toBe(true);
  });

  it('ignores the page and any other dialog', () => {
    render(
      <Dialog open>
        <DialogContent closeLabel="close">
          <DialogTitle>Other</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(isInLinkConfirmation(document.body)).toBe(false);
    expect(isInLinkConfirmation(null)).toBe(false);
    expect(isInLinkConfirmation(screen.getByRole('dialog'))).toBe(false);
    expect(isInLinkConfirmation(overlay())).toBe(false);
  });
});
