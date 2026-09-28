import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { AiConfigEntry } from '@knowtis/data-access-admin';
import { GLOBAL_REASONING_EFFORTS } from '@knowtis/shared-types';

import { ReasoningSection } from '../ReasoningSection';

const setConfigMutate = vi.fn();
const setConfigState = {
  isPending: false,
  isError: false,
  error: null as Error | null,
};
const resetConfigMutate = vi.fn();
const resetConfigState = {
  isPending: false,
  isError: false,
  error: null as Error | null,
};

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
      isPending: resetConfigState.isPending,
      isError: resetConfigState.isError,
      error: resetConfigState.error,
    }),
  };
});

const ACTIVE_CHOICE_CLASS = 'bg-(--foreground)';

function entryWith(
  value: string,
  source: AiConfigEntry['source']
): AiConfigEntry {
  return {
    key: 'ai_reasoning_effort',
    value,
    kind: 'choice',
    source,
    storedValue: null,
    description: null,
    updatedAt: null,
  };
}

function renderSection(
  value = 'medium',
  source: AiConfigEntry['source'] = 'custom'
) {
  return render(<ReasoningSection entry={entryWith(value, source)} />);
}

describe('ReasoningSection', () => {
  beforeEach(() => {
    setConfigMutate.mockReset();
    setConfigState.isPending = false;
    setConfigState.isError = false;
    setConfigState.error = null;
    resetConfigMutate.mockReset();
    resetConfigState.isPending = false;
    resetConfigState.isError = false;
    resetConfigState.error = null;
  });

  it('clears a stale reset error once a save succeeds', async () => {
    resetConfigState.isError = true;
    resetConfigState.error = new Error(
      'Could not update the reasoning effort.'
    );

    const { rerender } = renderSection();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not update the reasoning effort.'
    );

    await userEvent.click(screen.getByRole('button', { name: 'high' }));
    rerender(<ReasoningSection entry={entryWith('high', 'custom')} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a failed reset', () => {
    resetConfigState.isError = true;
    resetConfigState.error = new Error(
      'Could not update the reasoning effort.'
    );

    renderSection();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not update the reasoning effort.'
    );
  });

  it('offers every curated effort as a choice', () => {
    renderSection();

    for (const effort of GLOBAL_REASONING_EFFORTS) {
      expect(screen.getByRole('button', { name: effort })).toBeInTheDocument();
    }
  });

  it('marks the effective effort as the active choice', () => {
    renderSection('high');

    expect(screen.getByRole('button', { name: 'high' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'low' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('writes the picked effort to the config key', async () => {
    renderSection('medium');

    await userEvent.click(screen.getByRole('button', { name: 'high' }));

    expect(setConfigMutate).toHaveBeenCalledWith({
      key: 'ai_reasoning_effort',
      value: 'high',
    });
  });

  it('tells the admin the effort is the global default, BYOK turns included', () => {
    renderSection();

    expect(screen.getByText(/global default/i)).toBeInTheDocument();
    expect(screen.getByText(/byok/i)).toBeInTheDocument();
  });

  it('marks a stored override with a filled custom badge', () => {
    renderSection('medium', 'custom');

    expect(screen.getByText('custom')).toHaveClass(ACTIVE_CHOICE_CLASS);
  });

  it('offers Reset to default only when the effort is a stored override', () => {
    renderSection('medium', 'custom');

    expect(
      screen.getByRole('button', {
        name: /^reset to default: reasoning effort$/i,
      })
    ).toBeInTheDocument();
  });

  it('hides Reset when the effort already runs the code default', () => {
    renderSection('medium', 'default');

    expect(
      screen.queryByRole('button', {
        name: /^reset to default: reasoning effort$/i,
      })
    ).not.toBeInTheDocument();
  });

  it('resets the effort key to its code default on click', async () => {
    renderSection('high', 'custom');

    await userEvent.click(
      screen.getByRole('button', {
        name: /^reset to default: reasoning effort$/i,
      })
    );

    expect(resetConfigMutate).toHaveBeenCalledWith({
      key: 'ai_reasoning_effort',
    });
  });

  it('disables the effort choices while a reset is in flight', () => {
    resetConfigState.isPending = true;

    renderSection('medium', 'custom');

    expect(screen.getByRole('button', { name: 'high' })).toBeDisabled();
  });

  it('disables Reset while a write is in flight', () => {
    setConfigState.isPending = true;

    renderSection('medium', 'custom');

    expect(
      screen.getByRole('button', {
        name: /^reset to default: reasoning effort$/i,
      })
    ).toBeDisabled();
  });
});
