import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentCapabilityRows } from './AgentCapabilityRows';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('AgentCapabilityRows', () => {
  it('renders the three capability rows as buttons', () => {
    render(<AgentCapabilityRows onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('sends the understand demo prompt on click', async () => {
    const onSelect = vi.fn();
    render(<AgentCapabilityRows onSelect={onSelect} />);
    await userEvent.click(
      screen.getByRole('button', { name: /capability\.understand/ })
    );
    expect(onSelect).toHaveBeenCalledWith(
      'ai.copilot.empty.capability.understand.prompt'
    );
  });

  it('sends the write demo prompt on click', async () => {
    const onSelect = vi.fn();
    render(<AgentCapabilityRows onSelect={onSelect} />);
    await userEvent.click(
      screen.getByRole('button', { name: /capability\.write/ })
    );
    expect(onSelect).toHaveBeenCalledWith(
      'ai.copilot.empty.capability.write.prompt'
    );
  });

  it('sends the research demo prompt on click', async () => {
    const onSelect = vi.fn();
    render(<AgentCapabilityRows onSelect={onSelect} />);
    await userEvent.click(
      screen.getByRole('button', { name: /capability\.research/ })
    );
    expect(onSelect).toHaveBeenCalledWith(
      'ai.copilot.empty.capability.research.prompt'
    );
  });
});
