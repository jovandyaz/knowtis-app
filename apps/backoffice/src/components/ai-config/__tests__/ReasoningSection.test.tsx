import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { AiConfigEntry } from '@knowtis/data-access-admin';
import { REASONING_EFFORTS } from '@knowtis/shared-types';

import { ReasoningSection } from '../ReasoningSection';

const { setConfigMutate, setConfigState, resetConfigMutate, resetConfigState } =
  vi.hoisted(() => ({
    setConfigMutate: vi.fn(),
    setConfigState: { isPending: false },
    resetConfigMutate: vi.fn(),
    resetConfigState: { isPending: false },
  }));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useSetAiConfig: () => ({
      mutate: setConfigMutate,
      isPending: setConfigState.isPending,
      isError: false,
      error: null,
    }),
    useResetAiConfig: () => ({
      mutate: resetConfigMutate,
      isPending: resetConfigState.isPending,
      isError: false,
      error: null,
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
    resetConfigMutate.mockReset();
    resetConfigState.isPending = false;
  });

  it('offers every curated effort as a choice', () => {
    renderSection();

    for (const effort of REASONING_EFFORTS) {
      expect(screen.getByRole('button', { name: effort })).toBeInTheDocument();
    }
  });

  it('marks the effective effort as the active choice', () => {
    renderSection('high');

    expect(screen.getByRole('button', { name: 'high' })).toHaveClass(
      ACTIVE_CHOICE_CLASS
    );
    expect(screen.getByRole('button', { name: 'low' })).not.toHaveClass(
      ACTIVE_CHOICE_CLASS
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
      screen.getByRole('button', { name: /reset to default/i })
    ).toBeInTheDocument();
  });

  it('hides Reset when the effort already runs the code default', () => {
    renderSection('medium', 'default');

    expect(
      screen.queryByRole('button', { name: /reset to default/i })
    ).not.toBeInTheDocument();
  });

  it('resets the effort key to its code default on click', async () => {
    renderSection('high', 'custom');

    await userEvent.click(
      screen.getByRole('button', { name: /reset to default/i })
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
      screen.getByRole('button', { name: /reset to default/i })
    ).toBeDisabled();
  });
});
