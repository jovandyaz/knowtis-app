import { useState } from 'react';

import type { AgentStatus } from '@/stores/agent.store';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as SharedUtil from '@knowtis/shared-util';

import { AgentComposer } from './AgentComposer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts?.['shortcut'] ? `${k}:${String(opts['shortcut'])}` : k,
  }),
}));
vi.mock('@knowtis/shared-util', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedUtil>()),
  formatShortcut: (shortcut: string) => shortcut,
}));

type Handlers = Partial<
  Pick<
    Parameters<typeof AgentComposer>[0],
    'onSend' | 'onSendNow' | 'onStop' | 'onTakeBack'
  >
>;

/** The real composer is controlled by the store; this harness stands in for it. */
function Harness({
  status = 'idle',
  queueLength = 0,
  initialDraft = '',
  ...handlers
}: Handlers & {
  status?: AgentStatus;
  queueLength?: number;
  initialDraft?: string;
}) {
  const [draft, setDraft] = useState(initialDraft);
  return (
    <AgentComposer
      draft={draft}
      onDraftChange={setDraft}
      onSend={handlers.onSend ?? vi.fn()}
      onSendNow={handlers.onSendNow ?? vi.fn()}
      onStop={handlers.onStop ?? vi.fn()}
      onTakeBack={handlers.onTakeBack ?? vi.fn()}
      queueLength={queueLength}
      status={status}
    />
  );
}

describe('AgentComposer', () => {
  it('sends on Enter and clears the input', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSend={onSend} />);

    const box = screen.getByRole('textbox');
    await user.type(box, 'hola{Enter}');

    expect(onSend).toHaveBeenCalledWith('hola');
    expect(box).toHaveValue('');
  });

  it('inserts a newline on Shift+Enter without sending', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSend={onSend} />);

    const box = screen.getByRole('textbox');
    await user.type(box, 'line1{Shift>}{Enter}{/Shift}line2');

    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('line1\nline2');
  });

  it('disables the send button when the input is empty', () => {
    render(<Harness />);
    expect(
      screen.getByRole('button', { name: 'ai.copilot.send' })
    ).toBeDisabled();
  });

  it('does not send on Enter while IME composition is active', () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} initialDraft="hola" />);
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      isComposing: true,
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('queues on Enter while streaming instead of blocking', async () => {
    const onSend = vi.fn();
    const onSendNow = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness onSend={onSend} onSendNow={onSendNow} status="streaming" />
    );

    const box = screen.getByRole('textbox');
    await user.type(box, 'luego{Enter}');

    expect(onSend).toHaveBeenCalledWith('luego');
    expect(onSendNow).not.toHaveBeenCalled();
    expect(box).toHaveValue('');
  });

  it('queues on Enter while a proposal is pending', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSend={onSend} status="pendingProposal" />);
    await user.type(screen.getByRole('textbox'), 'luego{Enter}');
    expect(onSend).toHaveBeenCalledWith('luego');
  });

  it('sends now on Cmd/Ctrl+Enter', () => {
    const onSend = vi.fn();
    const onSendNow = vi.fn();
    const { rerender } = render(
      <Harness
        key="meta"
        onSend={onSend}
        onSendNow={onSendNow}
        status="streaming"
        initialDraft="ya"
      />
    );
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      metaKey: true,
    });
    expect(onSendNow).toHaveBeenCalledWith('ya');
    expect(onSend).not.toHaveBeenCalled();

    rerender(
      <Harness
        key="ctrl"
        onSend={onSend}
        onSendNow={onSendNow}
        status="streaming"
        initialDraft="ya"
      />
    );
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      ctrlKey: true,
    });
    expect(onSendNow).toHaveBeenCalledTimes(2);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows Stop and a queue button with text while streaming', async () => {
    const onStop = vi.fn();
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Harness onStop={onStop} onSend={onSend} status="streaming" />);

    expect(
      screen.queryByRole('button', { name: 'ai.copilot.queueAdd' })
    ).toBeNull();
    await user.type(screen.getByRole('textbox'), 'luego');
    await user.click(
      screen.getByRole('button', { name: 'ai.copilot.queueAdd' })
    );
    expect(onSend).toHaveBeenCalledWith('luego');

    await user.click(screen.getByRole('button', { name: 'ai.copilot.stop' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('stops on Escape while streaming only', () => {
    const onStop = vi.fn();
    const { rerender } = render(<Harness onStop={onStop} status="streaming" />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onStop).toHaveBeenCalledTimes(1);

    rerender(<Harness onStop={onStop} status="pendingProposal" />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onStop).toHaveBeenCalledTimes(1);

    rerender(<Harness onStop={onStop} status="idle" />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('takes the last queued message back on ArrowUp with an empty draft', () => {
    const onTakeBack = vi.fn();
    const { rerender } = render(
      <Harness key="empty" onTakeBack={onTakeBack} queueLength={1} />
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowUp' });
    expect(onTakeBack).toHaveBeenCalledTimes(1);

    rerender(
      <Harness
        key="typing"
        onTakeBack={onTakeBack}
        queueLength={1}
        initialDraft="typing"
      />
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowUp' });
    expect(onTakeBack).toHaveBeenCalledTimes(1);

    rerender(<Harness key="empty-2" onTakeBack={onTakeBack} queueLength={0} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowUp' });
    expect(onTakeBack).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['idle', 0, 'ai.copilot.composerHint'],
    ['streaming', 0, 'ai.copilot.composerHintBusy:Mod+Enter'],
    ['pendingProposal', 2, 'ai.copilot.composerHintBusy:Mod+Enter'],
    ['idle', 2, 'ai.copilot.composerHintPaused'],
    ['error', 1, 'ai.copilot.composerHintPaused'],
  ] as const)(
    'hint for status %s with %i queued is %s',
    (status, queueLength, hint) => {
      render(<Harness status={status} queueLength={queueLength} />);
      expect(screen.getByText(hint)).toBeInTheDocument();
    }
  );

  it('renders the model picker slot', () => {
    render(
      <AgentComposer
        draft=""
        onDraftChange={vi.fn()}
        onSend={vi.fn()}
        onSendNow={vi.fn()}
        onStop={vi.fn()}
        onTakeBack={vi.fn()}
        queueLength={0}
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
    render(<Harness />);
    const box = screen.getByRole('textbox');
    expect(box.style.height).toBe('');

    scrollHeight.mockReturnValue(96);
    await user.type(box, 'line1{Shift>}{Enter}{/Shift}line2');
    expect(box.style.height).toBe('96px');

    scrollHeight.mockReturnValue(24);
    await user.keyboard('{Enter}');
    expect(box).toHaveValue('');
    expect(box.style.height).toBe('');
  });
});
