import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentComposer } from './AgentComposer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('AgentComposer', () => {
  it('sends on Enter and clears the input', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<AgentComposer onSend={onSend} disabled={false} />);

    const box = screen.getByRole('textbox');
    await user.type(box, 'hola{Enter}');

    expect(onSend).toHaveBeenCalledWith('hola');
    expect(box).toHaveValue('');
  });

  it('inserts a newline on Shift+Enter without sending', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<AgentComposer onSend={onSend} disabled={false} />);

    const box = screen.getByRole('textbox');
    await user.type(box, 'line1{Shift>}{Enter}{/Shift}line2');

    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('line1\nline2');
  });

  it('disables the send button while streaming', () => {
    render(<AgentComposer onSend={vi.fn()} disabled={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
