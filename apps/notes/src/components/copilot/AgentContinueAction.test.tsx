import i18n from '@/lib/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentContinueAction } from './AgentContinueAction';

describe('AgentContinueAction', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('labels a partial answer next to the button that continues it', () => {
    render(<AgentContinueAction partial onContinue={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Continue' })
    ).toHaveAccessibleDescription('Partial answer');
  });

  it('shows only the button when the answer is not partial', () => {
    render(<AgentContinueAction partial={false} onContinue={vi.fn()} />);

    expect(screen.queryByText('Partial answer')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue' })
    ).toBeInTheDocument();
  });

  it('continues once however many times it is clicked', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<AgentContinueAction partial onContinue={onContinue} />);
    const button = screen.getByRole('button', { name: 'Continue' });

    await user.dblClick(button);

    expect(onContinue).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
  });

  it('reads "Continuar" and "Resultado parcial" in Spanish', async () => {
    await i18n.changeLanguage('es');

    render(<AgentContinueAction partial onContinue={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Continuar' })
    ).toHaveAccessibleDescription('Resultado parcial');
  });
});
