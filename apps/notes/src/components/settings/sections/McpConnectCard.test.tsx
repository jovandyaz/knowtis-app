import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { McpConnectCard } from './McpConnectCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const success = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (message: string) => success(message) },
}));

describe('McpConnectCard', () => {
  it('shows the MCP server URL so it can be pasted into a client', () => {
    render(<McpConnectCard />);

    expect(screen.getByLabelText('integrations.connect.urlLabel')).toHaveValue(
      'https://mcp.knowtis.app/mcp'
    );
  });

  it('copies the URL to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const user = userEvent.setup();

    render(<McpConnectCard />);
    await user.click(
      screen.getByRole('button', { name: 'integrations.connect.copyUrl' })
    );

    expect(writeText).toHaveBeenCalledWith('https://mcp.knowtis.app/mcp');
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

    expect(JSON.parse(atob(config ?? ''))).toEqual({
      url: 'https://mcp.knowtis.app/mcp',
    });
  });
});
