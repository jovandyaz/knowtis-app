import { useProviderKeys, useSetProviderKey } from '@/hooks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIKeysManager } from './AIKeysManager';

const mutateSetKey = vi.fn();
const mutateRemoveKey = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, string>) => {
      if (opts) {
        return Object.entries(opts).reduce(
          (acc, [key, val]) => acc.replace(`{{${key}}}`, val),
          k
        );
      }
      return k;
    },
  }),
}));

vi.mock('@/hooks', () => ({
  useProviderKeys: vi.fn(() => ({ data: [] })),
  useSetProviderKey: vi.fn(() => ({
    mutate: mutateSetKey,
    isPending: false,
    isError: false,
    variables: undefined,
  })),
  useDeleteProviderKey: vi.fn(() => ({
    mutate: mutateRemoveKey,
  })),
}));

describe('AIKeysManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProviderKeys).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useProviderKeys>);
    vi.mocked(useSetProviderKey).mockReturnValue({
      mutate: mutateSetKey,
      isPending: false,
      isError: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useSetProviderKey>);
  });

  it('renders a row for each of the 3 providers', () => {
    render(<AIKeysManager />);

    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('Save buttons are disabled when the input is empty', () => {
    render(<AIKeysManager />);

    const saveButtons = screen.getAllByRole('button', {
      name: /aiAssistant\.byok\.save/i,
    });
    expect(saveButtons).toHaveLength(3);
    saveButtons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('Save button becomes enabled after typing a key and calls mutate with provider + apiKey', async () => {
    render(<AIKeysManager />);

    const inputs = screen.getAllByPlaceholderText(
      /aiAssistant\.byok\.placeholder/i
    );
    await userEvent.type(inputs[0], 'sk-ant-test-key');

    const saveButtons = screen.getAllByRole('button', {
      name: /aiAssistant\.byok\.save/i,
    });
    expect(saveButtons[0]).toBeEnabled();

    await userEvent.click(saveButtons[0]);

    expect(mutateSetKey).toHaveBeenCalledWith(
      { provider: 'anthropic', apiKey: 'sk-ant-test-key' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('shows Remove button and stored prefix hint when a key is stored', () => {
    vi.mocked(useProviderKeys).mockReturnValue({
      data: [{ provider: 'openai', keyPrefix: 'sk-1234' }],
    } as unknown as ReturnType<typeof useProviderKeys>);

    render(<AIKeysManager />);

    expect(screen.getByText(/aiAssistant\.byok\.stored/)).toBeInTheDocument();

    const removeButtons = screen.getAllByRole('button', {
      name: /aiAssistant\.byok\.remove/i,
    });
    expect(removeButtons).toHaveLength(1);
  });
});
