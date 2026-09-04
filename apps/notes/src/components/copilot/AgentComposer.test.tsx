import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentComposer } from './AgentComposer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('AgentComposer', () => {
  it('sends on Enter and clears the input', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<AgentComposer onSend={onSend} onStop={vi.fn()} status="idle" />);

    const box = screen.getByRole('textbox');
    await user.type(box, 'hola{Enter}');

    expect(onSend).toHaveBeenCalledWith('hola');
    expect(box).toHaveValue('');
  });

  it('inserts a newline on Shift+Enter without sending', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<AgentComposer onSend={onSend} onStop={vi.fn()} status="idle" />);

    const box = screen.getByRole('textbox');
    await user.type(box, 'line1{Shift>}{Enter}{/Shift}line2');

    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('line1\nline2');
  });

  it('disables the send button when the input is empty', () => {
    render(<AgentComposer onSend={vi.fn()} onStop={vi.fn()} status="idle" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(
      screen.getByRole('button', { name: 'ai.copilot.send' })
    ).toBeDisabled();
  });

  it('does not send on Enter while IME composition is active', () => {
    const onSend = vi.fn();
    render(<AgentComposer onSend={onSend} onStop={vi.fn()} status="idle" />);
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'hola' } });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows a Stop button while streaming and calls onStop', async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(
      <AgentComposer onSend={vi.fn()} onStop={onStop} status="streaming" />
    );
    const stop = screen.getByRole('button', { name: 'ai.copilot.stop' });
    await user.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('does not send while pendingProposal', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(
      <AgentComposer
        onSend={onSend}
        onStop={vi.fn()}
        status="pendingProposal"
      />
    );
    await user.type(screen.getByRole('textbox'), 'hola{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders the model picker slot', () => {
    render(
      <AgentComposer
        onSend={vi.fn()}
        onStop={vi.fn()}
        status="idle"
        modelPicker={<div>picker</div>}
      />
    );
    expect(screen.getByText('picker')).toBeInTheDocument();
  });
});

describe('AgentComposer sizing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('grows the textarea with its content and shrinks back after sending', async () => {
    const scrollHeight = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(24);
    const user = userEvent.setup();
    render(<AgentComposer onSend={vi.fn()} onStop={vi.fn()} status="idle" />);
    const box = screen.getByRole('textbox');
    expect(box.style.height).toBe('24px');

    scrollHeight.mockReturnValue(96);
    await user.type(box, 'line1{Shift>}{Enter}{/Shift}line2');
    expect(box.style.height).toBe('96px');

    scrollHeight.mockReturnValue(24);
    await user.keyboard('{Enter}');
    expect(box).toHaveValue('');
    expect(box.style.height).toBe('24px');
  });
});
