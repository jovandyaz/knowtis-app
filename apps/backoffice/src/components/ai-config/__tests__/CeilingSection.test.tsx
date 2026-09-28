import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { AiConfigEntry } from '@knowtis/data-access-admin';

import { CeilingSection } from '../CeilingSection';

const setConfigMutate = vi.fn();
const setConfigState = {
  isPending: false,
  isError: false,
  error: null as Error | null,
};
const resetConfigMutate = vi.fn();
const resetConfigState = { isError: false, error: null as Error | null };

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useSetAiConfig: () => ({
      mutate: setConfigMutate,
      reset: () => {
        setConfigState.isError = false;
        setConfigState.error = null;
      },
      isPending: setConfigState.isPending,
      isError: setConfigState.isError,
      error: setConfigState.error,
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

function entryWith(
  value: string,
  source: AiConfigEntry['source'] = 'default'
): AiConfigEntry {
  return {
    key: 'ai_free_tier_ceiling',
    value,
    kind: 'money',
    source,
    storedValue: null,
    description: null,
    updatedAt: null,
  };
}

function renderSection(
  value = '4.00',
  source: AiConfigEntry['source'] = 'default'
) {
  return render(<CeilingSection entry={entryWith(value, source)} />);
}

describe('CeilingSection', () => {
  beforeEach(() => {
    setConfigMutate.mockReset();
    setConfigState.isPending = false;
    setConfigState.isError = false;
    setConfigState.error = null;
    resetConfigMutate.mockReset();
    resetConfigState.isError = false;
    resetConfigState.error = null;
  });

  it('shows the effective ceiling and its source', () => {
    renderSection('4.00', 'default');

    expect(screen.getByRole('textbox')).toHaveValue('4.00');
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('saves an edited ceiling trimmed to the config key', async () => {
    renderSection();

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, ' 2.50 ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(setConfigMutate).toHaveBeenCalledWith(
      {
        key: 'ai_free_tier_ceiling',
        value: '2.50',
      },
      expect.anything()
    );
  });

  it('flags a value that is not dollars with up to two decimals', async () => {
    renderSection();

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '1.234');

    expect(screen.getByText(/two decimals/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('flags a ceiling past the catalog admission price', async () => {
    renderSection();

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '25');

    expect(screen.getByText(/at most \$20/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('describes the input by its error for assistive tech', async () => {
    renderSection();

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'abc');

    expect(input).toHaveAccessibleDescription(/two decimals/i);
  });

  it('drops an unsaved draft when another admin changes the entry', async () => {
    const { rerender } = renderSection('4.00', 'default');

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '3.00');

    rerender(<CeilingSection entry={entryWith('2.50', 'custom')} />);

    expect(screen.getByRole('textbox')).toHaveValue('2.50');
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
  });

  it('flags an emptied ceiling instead of offering to save it', async () => {
    renderSection();

    await userEvent.clear(screen.getByRole('textbox'));

    expect(screen.getByText(/two decimals/i)).toBeInTheDocument();
  });

  it('offers Discard to drop an edit without saving', async () => {
    renderSection();

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '2.50');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(input).toHaveValue('4.00');
    expect(setConfigMutate).not.toHaveBeenCalled();
  });

  // Save clears the draft on success; without that, resetting the key later
  // revives the pre-save edit — the input claims a ceiling the server no
  // longer holds while the tables below re-mark against the real one.
  it('does not revive a saved draft when the entry returns to its old value', async () => {
    setConfigMutate.mockImplementation(
      (_input: unknown, options?: { onSuccess?: () => void }) =>
        options?.onSuccess?.()
    );
    const { rerender } = renderSection('4.00', 'default');

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '2.50');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    rerender(<CeilingSection entry={entryWith('2.50', 'custom')} />);
    rerender(<CeilingSection entry={entryWith('4.00', 'default')} />);

    expect(screen.getByRole('textbox')).toHaveValue('4.00');
  });

  it('resets a custom ceiling back to the code default', async () => {
    renderSection('2.50', 'custom');

    await userEvent.click(
      screen.getByRole('button', { name: /reset to default/i })
    );

    expect(resetConfigMutate).toHaveBeenCalledWith({
      key: 'ai_free_tier_ceiling',
    });
  });

  it('shows a failed reset', () => {
    resetConfigState.isError = true;
    resetConfigState.error = new Error(
      'Could not reset the free-tier ceiling.'
    );

    renderSection('2.50', 'custom');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not reset the free-tier ceiling.'
    );
  });

  it('clears a stale reset error once a save succeeds', async () => {
    resetConfigState.isError = true;
    resetConfigState.error = new Error(
      'Could not reset the free-tier ceiling.'
    );

    const { rerender } = renderSection('4.00', 'default');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not reset the free-tier ceiling.'
    );

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '2.50');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    rerender(<CeilingSection entry={entryWith('4.00', 'default')} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears a stale save error once a reset succeeds', async () => {
    setConfigState.isError = true;
    setConfigState.error = new Error('Could not update the free-tier ceiling.');

    const { rerender } = renderSection('2.50', 'custom');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not update the free-tier ceiling.'
    );

    await userEvent.click(
      screen.getByRole('button', { name: /reset to default/i })
    );
    rerender(<CeilingSection entry={entryWith('2.50', 'custom')} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers no reset while serving the code default', () => {
    renderSection('4.00', 'default');

    expect(
      screen.queryByRole('button', { name: /reset to default/i })
    ).not.toBeInTheDocument();
  });
});
