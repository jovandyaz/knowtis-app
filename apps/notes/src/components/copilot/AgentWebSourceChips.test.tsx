import { render, screen } from '@testing-library/react';
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

  it('renders nothing when there are no sources', () => {
    const { container } = render(<AgentWebSourceChips sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
