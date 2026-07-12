import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { McpConnectCard } from './McpConnectCard';

const MCP_URL = 'https://mcp.knowtis.app/mcp';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const success = vi.fn();
const error = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (message: string) => success(message),
    error: (message: string) => error(message),
  },
}));

beforeEach(() => {
  vi.stubEnv('VITE_MCP_URL', MCP_URL);
  success.mockClear();
  error.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('McpConnectCard', () => {
  it('shows the MCP server URL so it can be pasted into a client', () => {
    render(<McpConnectCard />);

    expect(screen.getByLabelText('integrations.connect.urlLabel')).toHaveValue(
      MCP_URL
    );
  });

  it('copies the URL to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    render(<McpConnectCard />);
    await user.click(
      screen.getByRole('button', { name: 'integrations.connect.copyUrl' })
    );

    expect(writeText).toHaveBeenCalledWith(MCP_URL);
    expect(success).toHaveBeenCalledWith('integrations.connect.urlCopied');
  });

  it('links to Cursor with the server URL encoded in the deeplink', () => {
    render(<McpConnectCard />);

    const link = screen.getByRole('link', {
      name: 'integrations.connect.addToCursor',
    });
    const config = new URL(link.getAttribute('href') ?? '').searchParams.get(
      'config'
    );

    expect(JSON.parse(atob(config ?? ''))).toEqual({ url: MCP_URL });
  });
});
