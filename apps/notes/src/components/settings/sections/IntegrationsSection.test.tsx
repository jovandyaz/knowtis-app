import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpApiKey } from '@knowtis/api-client';

import { IntegrationsSection } from './IntegrationsSection';

const revokeMutate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('./McpConnectCard', () => ({
  McpConnectCard: () => null,
}));

vi.mock('./CreateKeyDialog', () => ({
  CreateKeyDialog: () => null,
}));

const KEY: McpApiKey = {
  id: 'key-1',
  name: 'Claude Desktop',
  keyPrefix: 'kt_abc',
  scopes: 'notes:read',
  isActive: true,
  createdAt: '2026-07-02T12:00:00.000Z',
  lastUsedAt: null,
};

vi.mock('@knowtis/data-access-mcp-keys', () => ({
  useMcpKeys: () => ({ data: [KEY], isLoading: false, isError: false }),
  useRevokeMcpKey: () => ({ mutate: revokeMutate, isPending: false }),
}));

describe('IntegrationsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['cancelled', 'cancel'],
    ['dismissed with Escape', 'escape'],
  ] as const)(
    'returns focus to the revoke button when the dialog is %s',
    async (_label, exit) => {
      const user = userEvent.setup();
      render(<IntegrationsSection />);
      await user.click(
        screen.getByRole('button', { name: /integrations\.advancedTitle/ })
      );
      const revoke = screen.getByRole('button', {
        name: 'integrations.revoke',
      });

      await user.click(revoke);
      const dialog = screen.getByRole('dialog', {
        name: 'integrations.revokeTitle',
      });
      if (exit === 'escape') {
        await user.keyboard('{Escape}');
      } else {
        await user.click(
          within(dialog).getByRole('button', { name: 'integrations.done' })
        );
      }

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      await waitFor(() => expect(revoke).toHaveFocus());
      expect(revokeMutate).not.toHaveBeenCalled();
    }
  );
});
