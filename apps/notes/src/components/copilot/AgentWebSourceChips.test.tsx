import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentWebSourceChips } from './AgentWebSourceChips';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('AgentWebSourceChips', () => {
  it('renders an external link for each web source', () => {
    render(
      <AgentWebSourceChips
        sources={[{ title: 'MDN', url: 'https://developer.mozilla.org' }]}
      />
    );

    const link = screen.getByRole('link', { name: /MDN/ });
    expect(link).toHaveAttribute('href', 'https://developer.mozilla.org');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('reveals the untruncated title and full url on focus', async () => {
    const user = userEvent.setup();
    const url = 'https://developer.mozilla.org/en-US/docs/Web/CSS/field-sizing';
    render(
      <AgentWebSourceChips
        sources={[{ title: 'A very long web source title', url }]}
      />
    );

    await user.tab();

    expect(await screen.findByText(url)).toBeInTheDocument();
    expect(
      screen.getAllByText('A very long web source title').length
    ).toBeGreaterThan(1);
  });

  it('renders nothing when there are no sources', () => {
    const { container } = render(<AgentWebSourceChips sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('drops sources whose url is not http(s) to prevent unsafe hrefs', () => {
    const { container } = render(
      <AgentWebSourceChips
        sources={[
          { title: 'Safe', url: 'https://safe.com' },
          { title: 'XSS', url: 'javascript:alert(1)' },
        ]}
      />
    );
    expect(screen.getByRole('link', { name: /Safe/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /XSS/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });
});
