import i18n from '@/lib/i18n';
import { useRightDockStore } from '@/stores/right-dock.store';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { PANEL_ID } from './RightDock';
import { RightDockToggle } from './RightDockControls';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useRightDockStore.setState({ isOpen: false });
});

describe('RightDockToggle', () => {
  it('announces whether the dock is expanded and follows external collapse', async () => {
    render(<RightDockToggle />);
    const toggle = screen.getByRole('button', { name: 'Copilot' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', PANEL_ID);
    expect(toggle).toHaveClass('shrink-0');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', PANEL_ID);
    act(() => useRightDockStore.getState().close());
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
