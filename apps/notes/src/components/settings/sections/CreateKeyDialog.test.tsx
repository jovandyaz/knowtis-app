import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';
import { MCP_KEY_SCOPE_OPTIONS } from '@knowtis/data-access-mcp-keys';
import { EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import {
  createAuthApiMock,
  createAuthWrapper,
  HARNESS_PROFILE,
} from '../../../test/auth-harness';
import { CreateKeyDialog } from './CreateKeyDialog';

const wrapper = createAuthWrapper(createAuthApiMock(), {
  user: HARNESS_PROFILE,
});

const anonymousWrapper = createAuthWrapper(createAuthApiMock(), {
  user: { ...HARNESS_PROFILE, isAnonymous: true },
});

const mutate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@knowtis/data-access-mcp-keys', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCreateMcpKey: () => ({ mutate, isPending: false }),
}));

describe('CreateKeyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVerifyEmailStore.setState({ isOpen: false });
  });

  it('offers verification rather than a raw error when the gate refuses the key', async () => {
    mutate.mockImplementation((_input, { onError }) => {
      onError(
        new ApiClientError('Verify your email', 403, EMAIL_NOT_VERIFIED_CODE)
      );
    });
    render(<CreateKeyDialog open onOpenChange={vi.fn()} />, { wrapper });

    await userEvent.type(screen.getByRole('textbox'), 'clave de prueba');
    await userEvent.click(
      screen.getByRole('button', { name: 'integrations.createKey' })
    );

    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('never repeats the verify-your-email refusal to a visitor with no address', async () => {
    const serverMessage = 'Verify your email address to create API keys';
    mutate.mockImplementation((_input, { onError }) => {
      onError(new ApiClientError(serverMessage, 403, EMAIL_NOT_VERIFIED_CODE));
    });
    render(<CreateKeyDialog open onOpenChange={vi.fn()} />, {
      wrapper: anonymousWrapper,
    });

    await userEvent.type(screen.getByRole('textbox'), 'clave de prueba');
    await userEvent.click(
      screen.getByRole('button', { name: 'integrations.createKey' })
    );

    expect(toast.error).toHaveBeenCalledWith('verifyEmail.gateSignUpToast');
    expect(toast.error).not.toHaveBeenCalledWith(serverMessage);
    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('passes the shared close-dialog key to the close control', () => {
    render(<CreateKeyDialog open onOpenChange={vi.fn()} />, { wrapper });

    expect(
      screen.getByRole('button', { name: 'labels.closeDialog' })
    ).toBeInTheDocument();
  });

  it('exposes the scope choice as a radio group with the default checked', () => {
    render(<CreateKeyDialog open onOpenChange={vi.fn()} />, { wrapper });

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThanOrEqual(2);
    expect(
      radios.filter((r) => r.getAttribute('aria-checked') === 'true')
    ).toHaveLength(1);
  });

  it('moves the checked state to the scope the user picks', async () => {
    render(<CreateKeyDialog open onOpenChange={vi.fn()} />, { wrapper });

    const radios = screen.getAllByRole('radio');
    const unchecked = radios.find(
      (r) => r.getAttribute('aria-checked') === 'false'
    );
    expect(unchecked).toBeDefined();
    await userEvent.click(unchecked as HTMLElement);

    expect(unchecked).toHaveAttribute('aria-checked', 'true');
    expect(
      radios.filter((r) => r.getAttribute('aria-checked') === 'true')
    ).toHaveLength(1);
  });

  it('submits the scope the user selected', async () => {
    render(<CreateKeyDialog open onOpenChange={vi.fn()} />, { wrapper });

    await userEvent.type(screen.getByRole('textbox'), 'clave de prueba');
    await userEvent.click(
      screen.getByRole('radio', {
        name: /integrations.scopeOptions.read.label/i,
      })
    );
    await userEvent.click(
      screen.getByRole('button', { name: /integrations.create/i })
    );

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'clave de prueba',
        scopes: MCP_KEY_SCOPE_OPTIONS[0],
      }),
      expect.anything()
    );
  });
});
