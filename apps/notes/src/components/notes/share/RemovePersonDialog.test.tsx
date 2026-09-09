import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHARE_VIEWER, shareHarness } from '../../../test/share-harness';
import { RemovePersonDialog } from './RemovePersonDialog';

afterEach(cleanup);
describe('RemovePersonDialog', () => {
  it('describes direct removal without claiming a private note has another access path', () => {
    render(
      <RemovePersonDialog
        person={SHARE_VIEWER}
        linkIsOpen={false}
        pending={false}
        disabled={false}
        error={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
      { wrapper: shareHarness().wrapper }
    );
    expect(
      screen.getByRole('dialog', { name: 'Remove access for Viewer?' })
    ).toHaveAccessibleDescription('This removes direct access.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
  it('leaves cancellation available while a removal is pending', () => {
    render(
      <RemovePersonDialog
        person={SHARE_VIEWER}
        linkIsOpen
        pending
        disabled
        error={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
      { wrapper: shareHarness().wrapper }
    );
    expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});
