import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './DropdownMenu';

async function openRadioMenu(value: string) {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Bucket</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={value}>
          <DropdownMenuRadioItem value="inbox">Inbox</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="areas">Areas</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Bucket' }));
}

describe('DropdownMenuRadioItem', () => {
  it('marks only the checked item with a visible indicator', async () => {
    await openRadioMenu('areas');

    // The indicator is decorative — aria-checked carries the state for assistive
    // tech — so the sighted-user cue can only be asserted structurally.
    expect(
      screen.getByRole('menuitemradio', { name: 'Areas' }).querySelector('svg')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', { name: 'Inbox' }).querySelector('svg')
    ).toBeNull();
  });

  it('reserves the indicator column so checking an item never moves its label', async () => {
    await openRadioMenu('areas');

    // jsdom does no layout, so the reserved column is only guardable as a markup
    // contract: every row pads for it, and the indicator itself is out of flow.
    for (const item of screen.getAllByRole('menuitemradio')) {
      expect(item).toHaveClass('relative', 'pr-8');
    }
    expect(
      screen
        .getByRole('menuitemradio', { name: 'Areas' })
        .querySelector('[data-state="checked"]')
    ).toHaveClass('absolute');
  });
});
