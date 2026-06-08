import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentSourceChips } from './AgentSourceChips';

const navigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('AgentSourceChips', () => {
  it('navigates to the note when a chip is clicked', async () => {
    const user = userEvent.setup();
    render(
      <AgentSourceChips sources={[{ id: 'n1', title: 'Productividad' }]} />
    );

    await user.click(screen.getByRole('button', { name: /Productividad/ }));

    expect(navigate).toHaveBeenCalledWith({
      to: '/notes/$noteId',
      params: { noteId: 'n1' },
    });
  });

  it('renders nothing when there are no sources', () => {
    const { container } = render(<AgentSourceChips sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
