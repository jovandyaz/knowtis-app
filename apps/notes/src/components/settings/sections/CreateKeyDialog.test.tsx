import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MCP_KEY_SCOPE_OPTIONS } from '@knowtis/data-access-mcp-keys';

import { CreateKeyDialog } from './CreateKeyDialog';

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
  });

  it('exposes the scope choice as a radio group with the default checked', () => {
    render(<CreateKeyDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThanOrEqual(2);
    expect(
      radios.filter((r) => r.getAttribute('aria-checked') === 'true')
    ).toHaveLength(1);
  });

  it('moves the checked state to the scope the user picks', async () => {
    render(<CreateKeyDialog open onOpenChange={vi.fn()} />);

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
    render(<CreateKeyDialog open onOpenChange={vi.fn()} />);

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
