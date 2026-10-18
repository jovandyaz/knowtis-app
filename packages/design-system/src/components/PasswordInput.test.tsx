import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PasswordInput } from './PasswordInput';

describe('PasswordInput', () => {
  async function revealed() {
    render(<PasswordInput aria-label="password" />);
    await userEvent.click(screen.getByRole('button'));
    const field = screen.getByLabelText('password');
    expect(field).toHaveAttribute('type', 'text');
    return field;
  }

  it('hides the password again on Escape', async () => {
    const field = await revealed();

    fireEvent.keyDown(field, { key: 'Escape' });

    expect(field).toHaveAttribute('type', 'password');
  });

  it('keeps the password shown when the Escape cancels an IME composition', async () => {
    const field = await revealed();

    fireEvent.keyDown(field, { key: 'Escape', isComposing: true });

    expect(field).toHaveAttribute('type', 'text');
  });
});
