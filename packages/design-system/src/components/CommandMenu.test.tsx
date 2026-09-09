import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TOUCH_TARGET_HEIGHT_CLASS } from '../constants/touch-target';
import {
  CommandMenuBack,
  CommandMenuContent,
  CommandMenuGroup,
  CommandMenuItem,
} from './CommandMenu';

function renderMenu(onBack = vi.fn()) {
  render(
    <CommandMenuContent>
      <CommandMenuBack label="Back" onClick={onBack} />
      <CommandMenuGroup label="AI">
        <CommandMenuItem label="Summarize" description="Condense the note" />
      </CommandMenuGroup>
    </CommandMenuContent>
  );
  return onBack;
}

describe('CommandMenu', () => {
  it('renders each item as a button carrying its label and description', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: /Summarize/ })).toHaveTextContent(
      'Condense the note'
    );
  });

  it('fires the back handler when the back control is clicked', () => {
    const onBack = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('floors the row height on coarse pointers, width coming from the menu', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: /Summarize/ })).toHaveClass(
      TOUCH_TARGET_HEIGHT_CLASS
    );
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass(
      TOUCH_TARGET_HEIGHT_CLASS
    );
  });
});
