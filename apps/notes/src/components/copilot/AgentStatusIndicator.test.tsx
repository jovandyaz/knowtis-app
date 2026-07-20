import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentStatusIndicator } from './AgentStatusIndicator';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('AgentStatusIndicator', () => {
  it('renders a status label and skeleton lines', () => {
    const { container } = render(<AgentStatusIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('ai.copilot.thinking');
    expect(
      container.querySelectorAll('[data-testid="shimmer-line"]').length
    ).toBeGreaterThanOrEqual(3);
  });

  it('shows the live reasoning tail when provided', () => {
    render(<AgentStatusIndicator detail="scanning sources" />);
    expect(screen.getByText('scanning sources')).toBeInTheDocument();
  });

  it('omits the reasoning paragraph when no detail is provided', () => {
    const { container } = render(<AgentStatusIndicator />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('keeps the shimmer block hidden from assistive tech', () => {
    const { container } = render(<AgentStatusIndicator detail="reasoning" />);
    const shimmer = container.querySelector('[data-testid="shimmer-line"]');
    expect(shimmer?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('keeps the reasoning out of the polite announcement', () => {
    render(<AgentStatusIndicator detail="scanning sources" />);
    expect(screen.getByText('scanning sources')).toHaveAttribute(
      'aria-live',
      'off'
    );
  });
});
