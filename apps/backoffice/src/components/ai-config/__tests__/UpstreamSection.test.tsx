import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { AiConfigEntry } from '@knowtis/data-access-admin';

import { UpstreamSection } from '../UpstreamSection';

const setConfigMutate = vi.fn();
const setConfigState = { isPending: false };
const resetConfigMutate = vi.fn();
const resetConfigState = { isPending: false };

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
    key: 'ai_openrouter_providers',
    value,
    kind: 'list',
    source,
    description: null,
    updatedAt: null,
  };
}

function renderSection(
  value = 'fireworks,baseten',
  source: AiConfigEntry['source'] = 'default'
) {
  return render(<UpstreamSection entry={entryWith(value, source)} />);
}

describe('UpstreamSection', () => {
  beforeEach(() => {
    setConfigMutate.mockReset();
    setConfigState.isPending = false;
    resetConfigMutate.mockReset();
    resetConfigState.isPending = false;
  });

  it('names the measured-good defaults in its helper text', () => {
    renderSection();

    expect(screen.getByText(/fireworks/)).toBeInTheDocument();
    expect(screen.getByText(/baseten/)).toBeInTheDocument();
  });

  it('saves a valid allowlist trimmed to the config key', async () => {
    renderSection('fireworks');

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '  fireworks,baseten  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(setConfigMutate).toHaveBeenCalledWith({
      key: 'ai_openrouter_providers',
      value: 'fireworks,baseten',
    });
  });

  it('flags an invalid slug and blocks the save', async () => {
    renderSection('fireworks');

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Fireworks');

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(setConfigMutate).not.toHaveBeenCalled();
  });

  it('saves an empty allowlist as no-preference default routing', async () => {
    renderSection('fireworks,baseten', 'custom');

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(setConfigMutate).toHaveBeenCalledWith({
      key: 'ai_openrouter_providers',
      value: '',
    });
  });

  it('marks a stored override with a filled custom badge', () => {
    renderSection('fireworks', 'custom');

    expect(screen.getByText('custom')).toHaveClass(ACTIVE_CHOICE_CLASS);
  });

  it('offers Reset to default only for a stored override', () => {
    renderSection('fireworks', 'custom');

    expect(
      screen.getByRole('button', { name: /reset to default/i })
    ).toBeInTheDocument();
  });

  it('hides Reset when the allowlist runs the code default', () => {
    renderSection('fireworks,baseten', 'default');

    expect(
      screen.queryByRole('button', { name: /reset to default/i })
    ).not.toBeInTheDocument();
  });

  it('resets the key to its code default on click', async () => {
    renderSection('fireworks', 'custom');

    await userEvent.click(
      screen.getByRole('button', { name: /reset to default/i })
    );

    expect(resetConfigMutate).toHaveBeenCalledWith({
      key: 'ai_openrouter_providers',
    });
  });

  it('disables the input while a reset is in flight', () => {
    resetConfigState.isPending = true;

    renderSection('fireworks', 'custom');

    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
