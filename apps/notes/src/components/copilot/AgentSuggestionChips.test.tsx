import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentSuggestionChips } from './AgentSuggestionChips';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('AgentSuggestionChips', () => {
  it('renders chips and calls onSelect with the prompt text', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<AgentSuggestionChips onSelect={onSelect} />);
    const chip = screen.getByRole('button', {
      name: 'ai.copilot.empty.suggestion.summarize',
    });
    await user.click(chip);
    expect(onSelect).toHaveBeenCalledWith(
      'ai.copilot.empty.suggestion.summarize'
    );
  });
});
