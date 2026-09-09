import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TOUCH_TARGET_CLASS } from '../constants/touch-target';
import { RecordingModal } from './RecordingModal';

function renderModal(preventClose = false) {
  render(
    <RecordingModal
      open
      onOpenChange={vi.fn()}
      title="Recording"
      closeLabel="Close recording"
      preventClose={preventClose}
    >
      <p>Listening</p>
    </RecordingModal>
  );
}

describe('RecordingModal', () => {
  it('names the dialog for assistive tech and renders its content', () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Recording' })).toHaveTextContent(
      'Listening'
    );
  });

  it('floors the close control at a full touch target on coarse pointers', () => {
    renderModal();

    expect(screen.getByRole('button', { name: 'Close recording' })).toHaveClass(
      ...TOUCH_TARGET_CLASS.split(' ')
    );
  });

  it('hides the close control while closing is prevented', () => {
    renderModal(true);

    expect(
      screen.queryByRole('button', { name: 'Close recording' })
    ).not.toBeInTheDocument();
  });
});
