import { useProviderKeys, useSetProviderKey } from '@/hooks';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';
import { BYOK_PROVIDERS, EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import {
  createAuthApiMock,
  createAuthWrapper,
  HARNESS_PROFILE,
} from '../../../test/auth-harness';
import { AIKeysManager } from './AIKeysManager';

const wrapper = createAuthWrapper(createAuthApiMock(), {
  user: HARNESS_PROFILE,
});

const GATE_ERROR = new ApiClientError(
  'Verify your email',
  403,
  EMAIL_NOT_VERIFIED_CODE
);

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
    i18n: { language: 'en' },
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
    useVerifyEmailStore.setState({ isOpen: false });
  });

  it('offers verification when the gate refuses the key', async () => {
    mutateSetKey.mockImplementation((_input, { onError }) => {
      onError(GATE_ERROR);
    });
    render(<AIKeysManager />, { wrapper });

    const inputs = screen.getAllByPlaceholderText(
      /aiAssistant\.byok\.placeholder/i
    );
    await userEvent.type(inputs[0], 'sk-ant-test-key');
    await userEvent.click(
      screen.getAllByRole('button', { name: /aiAssistant\.byok\.save/i })[0]
    );

    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
  });

  it('does not blame the key when the refusal was about the account', () => {
    vi.mocked(useSetProviderKey).mockReturnValue({
      mutate: mutateSetKey,
      isPending: false,
      isError: true,
      error: GATE_ERROR,
      variables: { provider: 'anthropic', apiKey: 'sk-ant-test-key' },
    } as unknown as ReturnType<typeof useSetProviderKey>);

    render(<AIKeysManager />, { wrapper });

    expect(
      screen.queryByText(/aiAssistant\.byok\.invalid/i)
    ).not.toBeInTheDocument();
  });

  it('still blames the key for an ordinary rejection', () => {
    vi.mocked(useSetProviderKey).mockReturnValue({
      mutate: mutateSetKey,
      isPending: false,
      isError: true,
      error: new ApiClientError('Bad key', 400, 'INVALID_PROVIDER_KEY'),
      variables: { provider: 'anthropic', apiKey: 'sk-ant-test-key' },
    } as unknown as ReturnType<typeof useSetProviderKey>);

    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText(/aiAssistant\.byok\.invalid/i)).toBeInTheDocument();
  });

  it('renders a row for each of the 3 providers', () => {
    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('offers an OpenRouter key slot', () => {
    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
  });

  it('Save buttons are disabled when the input is empty', () => {
    render(<AIKeysManager />, { wrapper });

    const saveButtons = screen.getAllByRole('button', {
      name: /aiAssistant\.byok\.save/i,
    });
    expect(saveButtons).toHaveLength(BYOK_PROVIDERS.length);
    saveButtons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('Save button becomes enabled after typing a key and calls mutate with provider + apiKey', async () => {
    render(<AIKeysManager />, { wrapper });

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

  it('shows the stored prefix hint and removes the stored key on click', async () => {
    vi.mocked(useProviderKeys).mockReturnValue({
      data: [{ provider: 'openai', keyPrefix: 'sk-1234' }],
    } as unknown as ReturnType<typeof useProviderKeys>);

    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText(/aiAssistant\.byok\.stored/)).toBeInTheDocument();

    const removeButtons = screen.getAllByRole('button', {
      name: /aiAssistant\.byok\.remove/i,
    });
    expect(removeButtons).toHaveLength(1);

    await userEvent.click(removeButtons[0]);

    expect(mutateRemoveKey).toHaveBeenCalledWith('openai');
  });

  it('shows the last-used hint when the stored key has been used', () => {
    vi.mocked(useProviderKeys).mockReturnValue({
      data: [
        {
          provider: 'google',
          keyPrefix: 'AQ.Ab8',
          lastUsedAt: '2026-06-19T16:36:02.981Z',
          createdAt: '2026-06-19T07:16:48.549Z',
        },
      ],
    } as unknown as ReturnType<typeof useProviderKeys>);

    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText(/aiAssistant\.byok\.lastUsed/)).toBeInTheDocument();
  });

  it('shows the never-used hint when the stored key has not been used yet', () => {
    vi.mocked(useProviderKeys).mockReturnValue({
      data: [
        {
          provider: 'openai',
          keyPrefix: 'sk-1234',
          lastUsedAt: null,
          createdAt: '2026-06-19T07:16:48.549Z',
        },
      ],
    } as unknown as ReturnType<typeof useProviderKeys>);

    render(<AIKeysManager />, { wrapper });

    expect(
      screen.getByText(/aiAssistant\.byok\.neverUsed/)
    ).toBeInTheDocument();
  });

  it('puts the cursor in the first key field when opened to add a key', () => {
    render(<AIKeysManager focusFirstField />, { wrapper });

    expect(
      screen.getAllByPlaceholderText(/aiAssistant\.byok\.placeholder/i)[0]
    ).toHaveFocus();
  });

  it('leaves focus alone when reached from the settings nav', () => {
    render(<AIKeysManager />, { wrapper });

    expect(
      screen.getAllByPlaceholderText(/aiAssistant\.byok\.placeholder/i)[0]
    ).not.toHaveFocus();
  });
});
