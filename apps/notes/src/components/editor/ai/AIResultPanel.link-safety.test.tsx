import { useAIStore } from '@/stores/ai.store';
import { pressEscape } from '@/test/escape';
import { createMockEditor } from '@/test/mock-editor';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIResultPanel } from './AIResultPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const tippyOptions = vi.hoisted(() => ({
  last: undefined as { zIndex?: number } | undefined,
}));

vi.mock('tippy.js', () => ({
  default: (
    _reference: Element,
    options: { content: HTMLElement; zIndex?: number }
  ) => {
    tippyOptions.last = options;
    document.body.appendChild(options.content);
    return { destroy: () => options.content.remove() };
  },
}));

const OVERLAY_Z_INDEX = 50;

describe('AIResultPanel link dialog', () => {
  afterEach(() => {
    act(() => {
      useAIStore.getState().reset();
    });
  });

  async function showResultWithLink() {
    const editor = createMockEditor();
    useAIStore.setState({
      status: 'done',
      streamedText: '[go](https://example.com/page)',
    });
    render(<AIResultPanel editor={editor} />);
    await userEvent.click(await screen.findByRole('button', { name: 'go' }));
    await screen.findByRole('dialog', { name: 'notes:ai.linkConfirm.title' });
    return editor;
  }

  it('sits on the overlay layer, like every other tippy popup', async () => {
    await showResultWithLink();

    expect(tippyOptions.last?.zIndex).toBe(OVERLAY_Z_INDEX);
  });

  it('closes only the dialog on the first Escape and discards the result on the second', async () => {
    const editor = await showResultWithLink();

    pressEscape();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useAIStore.getState().status).toBe('done');
    expect(editor.commands.focus).not.toHaveBeenCalled();

    pressEscape();

    expect(useAIStore.getState().status).toBe('idle');
  });
});
