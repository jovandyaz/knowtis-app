import { useProviderKeys, useSetProviderKey } from '@/hooks';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';
import {
  BYOK_PROVIDERS,
  EMAIL_NOT_VERIFIED_CODE,
  type ProviderKeyInfo,
} from '@knowtis/shared-types';

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
    t: (k: string, opts?: Record<string, string>) =>
      opts
        ? `${k}(${Object.entries(opts)
            .map(([name, value]) => `${name}=${value}`)
            .join(',')})`
        : k,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<object>()),
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

function mockProviderKeys(data: ProviderKeyInfo[]) {
  vi.mocked(useProviderKeys).mockReturnValue({
    data,
  } as unknown as ReturnType<typeof useProviderKeys>);
}

function storedKey(overrides: Partial<ProviderKeyInfo> = {}): ProviderKeyInfo {
  return {
    provider: 'anthropic',
    keyPrefix: 'sk-ant-a',
    keySuffix: 'uAAA',
    lastUsedAt: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    keyStoredAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

async function saveFirstKey() {
  const inputs = screen.getAllByPlaceholderText(
    /aiAssistant\.byok\.placeholder/i
  );
  await userEvent.type(inputs[0], 'sk-ant-test-key');
  await userEvent.click(
    screen.getAllByRole('button', { name: /aiAssistant\.byok\.save/i })[0]
  );
}

describe('AIKeysManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProviderKeys([]);
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

    await saveFirstKey();

    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
  });

  it('does not blame the key when the refusal was about the account', async () => {
    mutateSetKey.mockImplementation((_input, { onError }) => {
      onError(GATE_ERROR);
    });
    render(<AIKeysManager />, { wrapper });

    await saveFirstKey();

    expect(
      screen.queryByText(/aiAssistant\.byok\.invalid/i)
    ).not.toBeInTheDocument();
  });

  it('still blames the key for an ordinary rejection', async () => {
    mutateSetKey.mockImplementation((_input, { onError }) => {
      onError(new ApiClientError('Bad key', 400, 'INVALID_PROVIDER_KEY'));
    });
    render(<AIKeysManager />, { wrapper });

    await saveFirstKey();

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

  it('shows the recognizable key hint and removes the stored key on click', async () => {
    mockProviderKeys([storedKey({ createdAt: '2026-09-01T07:16:48.549Z' })]);

    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText('sk-ant-a…uAAA')).toHaveClass('font-mono');

    const removeButtons = screen.getAllByRole('button', {
      name: /aiAssistant\.byok\.remove/i,
    });
    expect(removeButtons).toHaveLength(1);

    await userEvent.click(removeButtons[0]);

    expect(mutateRemoveKey).toHaveBeenCalledWith('anthropic');
  });

  it('keeps Remove in the provider header row, apart from the key field and Save', () => {
    mockProviderKeys([storedKey()]);

    render(<AIKeysManager />, { wrapper });

    const header = screen.getByRole('button', {
      name: /aiAssistant\.byok\.remove/i,
    }).parentElement;
    if (!header) {
      throw new Error('Remove has no header row');
    }
    expect(header).toHaveTextContent('Anthropic');
    expect(
      within(header).queryByRole('button', { name: /aiAssistant\.byok\.save/i })
    ).not.toBeInTheDocument();
    expect(
      within(header).queryByPlaceholderText(/aiAssistant\.byok\./)
    ).not.toBeInTheDocument();
  });

  it('shows only the prefix when the key has no readable suffix', () => {
    mockProviderKeys([
      storedKey({ keySuffix: null, createdAt: '2026-09-01T07:16:48.549Z' }),
    ]);

    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText('sk-ant-a…')).toHaveClass('font-mono');
  });

  it('dates the added label from when the current key was stored, not first added', () => {
    mockProviderKeys([
      storedKey({
        createdAt: '2020-03-05T12:00:00.000Z',
        keyStoredAt: '2026-09-01T12:00:00.000Z',
      }),
    ]);

    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText(/aiAssistant\.byok\.added/)).toHaveTextContent(
      'date=Sep 1'
    );
  });

  it('omits the year for a key added this year', () => {
    mockProviderKeys([storedKey({ keyStoredAt: new Date().toISOString() })]);

    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText(/aiAssistant\.byok\.added/)).not.toHaveTextContent(
      String(new Date().getFullYear())
    );
  });

  it('includes the year for a key added in an earlier year', () => {
    mockProviderKeys([storedKey({ keyStoredAt: '2020-03-05T12:00:00.000Z' })]);

    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText(/aiAssistant\.byok\.added/)).toHaveTextContent(
      '2020'
    );
  });

  it('asks for a replacement key only on a provider that already has one', () => {
    mockProviderKeys([storedKey()]);

    render(<AIKeysManager />, { wrapper });

    expect(
      screen.getAllByPlaceholderText(/aiAssistant\.byok\.replacePlaceholder/)
    ).toHaveLength(1);
    expect(
      screen.getAllByPlaceholderText(/aiAssistant\.byok\.placeholder/)
    ).toHaveLength(BYOK_PROVIDERS.length - 1);
  });

  it('shows the new suffix right after a replacement key is saved', async () => {
    mockProviderKeys([storedKey()]);
    mutateSetKey.mockImplementation((_input, { onSuccess }) => {
      mockProviderKeys([storedKey({ keySuffix: 'NEW1' })]);
      onSuccess();
    });
    const { rerender } = render(<AIKeysManager />, { wrapper });

    await userEvent.type(
      screen.getAllByPlaceholderText(
        /aiAssistant\.byok\.replacePlaceholder/
      )[0],
      'sk-ant-new-key'
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: /aiAssistant\.byok\.save/i })[0]
    );
    rerender(<AIKeysManager />);

    expect(screen.getByText('sk-ant-a…NEW1')).toBeInTheDocument();
  });

  it('shows the last-used hint when the stored key has been used', () => {
    mockProviderKeys([
      storedKey({
        provider: 'google',
        keyPrefix: 'AQ.Ab8',
        lastUsedAt: '2026-06-19T16:36:02.981Z',
        createdAt: '2026-06-19T07:16:48.549Z',
        keySuffix: null,
      }),
    ]);

    render(<AIKeysManager />, { wrapper });

    expect(screen.getByText(/aiAssistant\.byok\.lastUsed/)).toBeInTheDocument();
  });

  it('shows the never-used hint when the stored key has not been used yet', () => {
    mockProviderKeys([
      storedKey({
        provider: 'openai',
        keyPrefix: 'sk-1234',
        createdAt: '2026-06-19T07:16:48.549Z',
        keySuffix: null,
      }),
    ]);

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
