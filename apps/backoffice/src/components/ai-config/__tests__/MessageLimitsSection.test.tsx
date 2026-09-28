import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { AiConfigEntry } from '@knowtis/data-access-admin';

import { MessageLimitsSection } from '../MessageLimitsSection';

const setConfigMutate = vi.fn();
const resetConfigMutate = vi.fn();
const resetConfigState = { isError: false, error: null as Error | null };

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useSetAiConfig: () => ({
      mutate: setConfigMutate,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    }),
    useResetAiConfig: () => ({
      mutate: resetConfigMutate,
      reset: () => {
        resetConfigState.isError = false;
        resetConfigState.error = null;
      },
      isPending: false,
      isError: resetConfigState.isError,
      error: resetConfigState.error,
    }),
  };
});

function entry(
  key: string,
  value: string,
  source: AiConfigEntry['source'] = 'default'
): AiConfigEntry {
  return {
    key,
    value,
    kind: 'count',
    source,
    storedValue: null,
    description: null,
    updatedAt: null,
  };
}

const ENTRIES = [
  entry('ai_anon_daily_messages', '5'),
  entry('ai_free_daily_messages', '30', 'custom'),
];

// Exact names: a regex would also match the reset button, whose accessible
// name is "Reset to default: <label>" (ConfigSourceCell.tsx).
const guestsField = () =>
  screen.getByRole('textbox', { name: 'Guests (per session and per IP)' });
const signedInField = () =>
  screen.getByRole('textbox', { name: 'Signed-in users' });

describe('MessageLimitsSection', () => {
  beforeEach(() => {
    setConfigMutate.mockReset();
    resetConfigMutate.mockReset();
    resetConfigState.isError = false;
    resetConfigState.error = null;
  });

  it('shows each limit with its source', () => {
    render(<MessageLimitsSection entries={ENTRIES} />);

    expect(guestsField()).toHaveValue('5');
    expect(signedInField()).toHaveValue('30');
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText('custom')).toBeInTheDocument();
  });

  it('saves an edited limit trimmed, to its own key', async () => {
    render(<MessageLimitsSection entries={ENTRIES} />);

    const input = signedInField();
    await userEvent.clear(input);
    await userEvent.type(input, ' 12 ');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save: Signed-in users' })
    );

    expect(setConfigMutate).toHaveBeenCalledWith(
      { key: 'ai_free_daily_messages', value: '12' },
      expect.anything()
    );
  });

  it.each(['-1', '1.5', 'abc', '', '10001'])(
    'refuses %j with the range and no save',
    async (value) => {
      render(<MessageLimitsSection entries={ENTRIES} />);

      const input = guestsField();
      await userEvent.clear(input);
      if (value) {
        await userEvent.type(input, value);
      }

      expect(
        screen.getByText('A whole number from 0 to 10000.')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Save: Guests (per session and per IP)',
        })
      ).toBeDisabled();
    }
  );

  it('says that 0 turns the guest copilot off', () => {
    render(<MessageLimitsSection entries={ENTRIES} />);

    expect(
      screen.getByText('0 turns the guest copilot off.')
    ).toBeInTheDocument();
  });

  it('accepts 0, saving it to its own key', async () => {
    render(<MessageLimitsSection entries={ENTRIES} />);

    const input = guestsField();
    await userEvent.clear(input);
    await userEvent.type(input, '0');

    expect(
      screen.queryByText('A whole number from 0 to 10000.')
    ).not.toBeInTheDocument();
    const saveGuests = screen.getByRole('button', {
      name: 'Save: Guests (per session and per IP)',
    });
    expect(saveGuests).toBeEnabled();

    await userEvent.click(saveGuests);

    expect(setConfigMutate).toHaveBeenCalledWith(
      { key: 'ai_anon_daily_messages', value: '0' },
      expect.anything()
    );
  });

  it('ties the guest hint to its input, not the signed-in field', () => {
    render(<MessageLimitsSection entries={ENTRIES} />);

    expect(guestsField()).toHaveAccessibleDescription(
      expect.stringContaining('0 turns the guest copilot off.')
    );
    expect(signedInField()).not.toHaveAccessibleDescription(
      expect.stringContaining('0 turns the guest copilot off.')
    );
  });

  it('gives each dirty field its own save and discard name', async () => {
    render(<MessageLimitsSection entries={ENTRIES} />);

    await userEvent.clear(guestsField());
    await userEvent.type(guestsField(), '7');
    await userEvent.clear(signedInField());
    await userEvent.type(signedInField(), '12');

    expect(
      screen.getByRole('button', {
        name: 'Save: Guests (per session and per IP)',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save: Signed-in users' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Discard: Guests (per session and per IP)',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Discard: Signed-in users' })
    ).toBeInTheDocument();
  });

  it('resets a stored limit to its code default', async () => {
    render(<MessageLimitsSection entries={ENTRIES} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Reset to default: Signed-in users' })
    );

    expect(resetConfigMutate).toHaveBeenCalledWith({
      key: 'ai_free_daily_messages',
    });
  });

  it('clears a stale reset error once a save succeeds', async () => {
    resetConfigState.isError = true;
    resetConfigState.error = new Error(
      'Could not reset the daily message limit.'
    );

    const { rerender } = render(
      <MessageLimitsSection entries={[ENTRIES[1]]} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not reset the daily message limit.'
    );

    const input = signedInField();
    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save: Signed-in users' })
    );
    rerender(<MessageLimitsSection entries={[ENTRIES[1]]} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a failed reset', () => {
    resetConfigState.isError = true;
    resetConfigState.error = new Error(
      'Could not reset the daily message limit.'
    );

    render(<MessageLimitsSection entries={[ENTRIES[1]]} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not reset the daily message limit.'
    );
  });
});
