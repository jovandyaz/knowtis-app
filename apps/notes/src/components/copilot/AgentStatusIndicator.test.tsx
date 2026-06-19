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
});
