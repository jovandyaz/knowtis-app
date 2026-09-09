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
    storedValue: null,
    description: null,
    updatedAt: null,
  };
}

function renderSection(
  value = 'fireworks,baseten',
  source: AiConfigEntry['source'] = 'default'
) {
  return render(
    <UpstreamSection mode="preference" entry={entryWith(value, source)} />
  );
}

describe('UpstreamSection', () => {
  beforeEach(() => {
    setConfigMutate.mockReset();
    setConfigState.isPending = false;
    resetConfigMutate.mockReset();
    resetConfigState.isPending = false;
  });

  it('edits independent preference and exclusion lists with distinct labels', async () => {
    render(
      <>
        <UpstreamSection
          mode="preference"
          entry={entryWith('fireworks', 'custom')}
        />
        <UpstreamSection
          mode="ignore"
          entry={{
            ...entryWith('', 'default'),
            key: 'ai_openrouter_ignored_providers',
          }}
        />
      </>
    );
    const preference = screen.getByRole('textbox', {
      name: 'Preferred providers',
    });
    const ignored = screen.getByRole('textbox', { name: 'Ignored providers' });
    expect(preference.id).not.toBe(ignored.id);
    expect(
      screen.getByText(/Leave it empty to exclude no providers/)
    ).toBeInTheDocument();
    await userEvent.type(ignored, ' parasail ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(setConfigMutate).toHaveBeenCalledWith(
      { key: 'ai_openrouter_ignored_providers', value: 'parasail' },
      expect.anything()
    );
    expect(preference).toHaveValue('fireworks');
  });

  it.each(['set', 'reset'])(
    'blocks conflicting mutations for ignored providers while %s is pending',
    async (pending) => {
      const entry = {
        ...entryWith('parasail', 'custom'),
        key: 'ai_openrouter_ignored_providers' as const,
      };
      const { rerender } = render(
        <UpstreamSection mode="ignore" entry={entry} />
      );
      await userEvent.type(screen.getByRole('textbox'), ',fireworks');
      if (pending === 'set') {
        setConfigState.isPending = true;
      } else {
        resetConfigState.isPending = true;
      }
      rerender(<UpstreamSection mode="ignore" entry={entry} />);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(
        screen.getByRole('button', {
          name: /reset to default: ignored providers/i,
        })
      ).toBeDisabled();
      expect(screen.getByRole('textbox')).toBeDisabled();
    }
  );

  it('drops an exclusion draft after a remote update and resets its own key', async () => {
    const entry = {
      ...entryWith('parasail', 'custom'),
      key: 'ai_openrouter_ignored_providers' as const,
    };
    const { rerender } = render(
      <UpstreamSection mode="ignore" entry={entry} />
    );
    await userEvent.type(screen.getByRole('textbox'), ',fireworks');
    rerender(
      <UpstreamSection mode="ignore" entry={{ ...entry, value: 'novita' }} />
    );
    expect(screen.getByRole('textbox')).toHaveValue('novita');
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: /reset to default: ignored providers/i,
      })
    );
    expect(resetConfigMutate).toHaveBeenCalledWith(
      { key: 'ai_openrouter_ignored_providers' },
      expect.anything()
    );
  });

  it('names the measured-good defaults in its helper text', () => {
    renderSection();

    expect(screen.getByText(/fireworks/)).toBeInTheDocument();
    expect(screen.getByText(/baseten/)).toBeInTheDocument();
  });

  it('does not revive a saved draft when the entry returns to its old value', async () => {
    setConfigMutate.mockImplementation(
      (_input: unknown, options?: { onSuccess?: () => void }) =>
        options?.onSuccess?.()
    );
    const { rerender } = renderSection('fireworks', 'default');

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'baseten');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    rerender(
      <UpstreamSection
        mode="preference"
        entry={entryWith('baseten', 'custom')}
      />
    );
    rerender(
      <UpstreamSection
        mode="preference"
        entry={entryWith('fireworks', 'default')}
      />
    );

    expect(screen.getByRole('textbox')).toHaveValue('fireworks');
  });

  it('saves a valid allowlist trimmed to the config key', async () => {
    renderSection('fireworks');

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '  fireworks,baseten  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(setConfigMutate).toHaveBeenCalledWith(
      {
        key: 'ai_openrouter_providers',
        value: 'fireworks,baseten',
      },
      expect.anything()
    );
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

    expect(setConfigMutate).toHaveBeenCalledWith(
      {
        key: 'ai_openrouter_providers',
        value: '',
      },
      expect.anything()
    );
  });

  it('marks a stored override with a filled custom badge', () => {
    renderSection('fireworks', 'custom');

    expect(screen.getByText('custom')).toHaveClass(ACTIVE_CHOICE_CLASS);
  });

  it('offers Reset to default only for a stored override', () => {
    renderSection('fireworks', 'custom');

    expect(
      screen.getByRole('button', {
        name: /^reset to default: preferred providers$/i,
      })
    ).toBeInTheDocument();
  });

  it('hides Reset when the allowlist runs the code default', () => {
    renderSection('fireworks,baseten', 'default');

    expect(
      screen.queryByRole('button', {
        name: /^reset to default: preferred providers$/i,
      })
    ).not.toBeInTheDocument();
  });

  it('resets the key to its code default on click', async () => {
    renderSection('fireworks', 'custom');

    await userEvent.click(
      screen.getByRole('button', {
        name: /^reset to default: preferred providers$/i,
      })
    );

    expect(resetConfigMutate).toHaveBeenCalledWith(
      { key: 'ai_openrouter_providers' },
      expect.anything()
    );
  });

  it('disables the input while a reset is in flight', () => {
    resetConfigState.isPending = true;

    renderSection('fireworks', 'custom');

    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('drops the draft and hides Save/Discard when another admin writes the entry', async () => {
    const { rerender } = renderSection('fireworks', 'custom');

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'baseten');

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();

    rerender(
      <UpstreamSection
        mode="preference"
        entry={entryWith('together', 'custom')}
      />
    );

    expect(screen.getByRole('textbox')).toHaveValue('together');
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Discard' })
    ).not.toBeInTheDocument();
  });
});
