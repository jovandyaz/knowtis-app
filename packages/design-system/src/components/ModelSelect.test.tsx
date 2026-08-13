import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ModelSelect } from './ModelSelect';

const models = [
  {
    id: 'a:fast',
    label: 'Fast One',
    descriptionKey: 'd1',
    tier: 'fast',
    contextWindow: 200000,
    costClass: 1,
    isDefault: false,
  },
  {
    id: 'a:bal',
    label: 'Balanced One',
    descriptionKey: 'd2',
    tier: 'balanced',
    contextWindow: 1000000,
    costClass: 2,
    isDefault: true,
  },
] as const;

describe('ModelSelect', () => {
  it('renders tier groups and emits the selected id', async () => {
    const onSelect = vi.fn();
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={onSelect}
        renderDescription={(m) => m.descriptionKey}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByText('Balanced One'));
    expect(onSelect).toHaveBeenCalledWith('a:bal');
  });

  it('omits the description element when the option has no description to render', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        renderDescription={(m) => (m.id === 'a:fast' ? 'has one' : '')}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Fast One/ }));

    // An empty description span is invisible to textContent but still consumes
    // the item's row gap, so the assertion has to be structural.
    expect(
      screen.getByRole('menuitemradio', { name: /Fast One/ }).children
    ).toHaveLength(2);
    expect(
      screen.getByRole('menuitemradio', { name: /Balanced One/ }).children
    ).toHaveLength(1);
  });

  it('keeps a long description reachable in full while clamping it to one line', async () => {
    const longDescription =
      'A promoted model arrives with the raw upstream blurb, which runs for several sentences and would otherwise take over the whole dropdown.';
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        renderDescription={() => longDescription}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Fast One/ }));

    const description = screen.getAllByTitle(longDescription)[0];
    expect(description).toHaveTextContent(longDescription);
    // jsdom does no layout, so the clamp can only be guarded as a markup contract.
    expect(description).toHaveClass('line-clamp-1', 'w-full', 'min-w-0');
  });

  it('orders tier groups by the tierOrder prop', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        tierOrder={['balanced', 'fast']}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    const labels = screen
      .getAllByText(/^(balanced|fast)$/)
      .map((el) => el.textContent);
    expect(labels).toEqual(['balanced', 'fast']);
  });

  it('disables the trigger when disabled is set', () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        disabled
      />
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows one cost indicator per tier header derived from its costliest model', async () => {
    render(
      <ModelSelect models={[...models]} value="a:fast" onSelect={vi.fn()} />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('$')).toBeTruthy();
    expect(screen.getByText('$$')).toBeTruthy();
    expect(screen.queryAllByText('$$$')).toHaveLength(0);
  });

  it('lists every model under one heading when modelsLabel is given', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        tierOrder={['balanced', 'fast']}
        modelsLabel="MODELS"
      />
    );
    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('MODELS')).toBeInTheDocument();
    expect(screen.queryByText('fast')).not.toBeInTheDocument();
    expect(screen.queryByText('balanced')).not.toBeInTheDocument();

    // tierOrder still sorts the flattened list.
    const rows = screen.getAllByRole('menuitemradio').map((r) => r.textContent);
    expect(rows[0]).toContain('Balanced One');
    expect(rows[1]).toContain('Fast One');
  });

  it('moves the cost indicator onto each row when the groups are flattened', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        modelsLabel="MODELS"
      />
    );
    await userEvent.click(screen.getByRole('button'));

    // One heading cannot speak for tiers that differ in cost, so each row carries its own.
    expect(
      screen.getByRole('menuitemradio', { name: /Fast One/ })
    ).toHaveTextContent('$');
    expect(
      screen.getByRole('menuitemradio', { name: /Balanced One/ })
    ).toHaveTextContent('$$');
  });

  it('shows no cost glyph on a row whose cost class is below the first level', async () => {
    render(
      <ModelSelect
        models={[{ ...models[0], costClass: 0 }]}
        value="a:fast"
        onSelect={vi.fn()}
        modelsLabel="MODELS"
      />
    );
    await userEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('$')).not.toBeInTheDocument();
  });

  it('keeps the cost band off the heading that speaks for every tier', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        modelsLabel="MODELS"
      />
    );
    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('MODELS').parentElement).toHaveTextContent(
      /^MODELS$/
    );
  });

  it('leaves an unselected row without a trailing slot', async () => {
    render(
      <ModelSelect models={[...models]} value="a:fast" onSelect={vi.fn()} />
    );
    await userEvent.click(screen.getByRole('button'));

    // An empty slot is invisible to textContent but still consumes the row's
    // gap, so the assertion has to be structural.
    const row = screen.getByRole('menuitemradio', { name: /Balanced One/ });
    expect(row.firstElementChild?.children).toHaveLength(1);
  });

  it('shows the billed badge only on models billed to the user', async () => {
    render(
      <ModelSelect
        models={[
          { ...models[0], billedToUser: true },
          { ...models[1], billedToUser: false },
        ]}
        value="a:fast"
        onSelect={vi.fn()}
        billedBadgeLabel="Your key"
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getAllByText('Your key')).toHaveLength(1);
  });

  it('omits the billed badge when no label is provided', async () => {
    render(
      <ModelSelect
        models={[{ ...models[0], billedToUser: true }]}
        value="a:fast"
        onSelect={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('Your key')).toBeNull();
  });

  it('disables the trigger and shows the loading label while models load', () => {
    render(
      <ModelSelect
        models={[]}
        value={null}
        onSelect={vi.fn()}
        status="loading"
        loadingLabel="Loading models…"
      />
    );
    const trigger = screen.getByRole('button');
    expect(trigger.hasAttribute('disabled')).toBe(true);
    expect(trigger.textContent).toContain('Loading models…');
  });

  it('disables the trigger and shows the empty label when no models are available', () => {
    render(
      <ModelSelect
        models={[]}
        value={null}
        onSelect={vi.fn()}
        status="ready"
        emptyLabel="No models available"
      />
    );
    const trigger = screen.getByRole('button');
    expect(trigger.hasAttribute('disabled')).toBe(true);
    expect(trigger.textContent).toContain('No models available');
  });

  it('surfaces an error message and retries on demand', async () => {
    const onRetry = vi.fn();
    render(
      <ModelSelect
        models={[]}
        value={null}
        onSelect={vi.fn()}
        status="error"
        errorLabel="Couldn't load models"
        retryLabel="Retry"
        onRetry={onRetry}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: "Couldn't load models" })
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('applies a custom triggerClassName to the trigger button', () => {
    render(
      <ModelSelect
        models={[{ id: 'm1', label: 'Model One', tier: 'fast' }]}
        value="m1"
        onSelect={vi.fn()}
        triggerClassName="composer-trigger"
      />
    );
    expect(screen.getByRole('button', { name: /Model One/ })).toHaveClass(
      'composer-trigger'
    );
  });

  const styleSection = {
    label: 'STYLE',
    options: [
      { id: 'fast', label: 'Quick', description: 'Instant answers' },
      { id: 'balanced', label: 'Even', description: 'The sweet spot' },
    ],
  };

  it('lists the leading section above the tier groups', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="balanced"
        onSelect={vi.fn()}
        leadingSection={styleSection}
      />
    );
    await userEvent.click(screen.getByRole('button'));

    const headings = screen
      .getAllByText(/^(STYLE|fast|balanced)$/)
      .map((el) => el.textContent);
    expect(headings).toEqual(['STYLE', 'fast', 'balanced']);
  });

  it('emits the leading option id and labels the trigger with it', async () => {
    const onSelect = vi.fn();
    render(
      <ModelSelect
        models={[...models]}
        value="balanced"
        onSelect={onSelect}
        leadingSection={styleSection}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent('Even');

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Quick/ }));
    expect(onSelect).toHaveBeenCalledWith('fast');
  });

  it('keeps the leading options listed when the model list is in error', async () => {
    render(
      <ModelSelect
        models={[]}
        value="balanced"
        onSelect={vi.fn()}
        leadingSection={styleSection}
        status="error"
        errorLabel="Could not load"
        retryLabel="Retry"
        onRetry={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button'));

    expect(
      screen.getByRole('menuitemradio', { name: /Quick/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Could not load')).toBeTruthy();
  });

  it('keeps the trigger usable while models load behind a leading section', () => {
    render(
      <ModelSelect
        models={[]}
        value="balanced"
        onSelect={vi.fn()}
        leadingSection={styleSection}
        status="loading"
        loadingLabel="Loading models…"
      />
    );
    const trigger = screen.getByRole('button');
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveTextContent('Even');
  });

  it('keeps the trigger usable when only the leading section has options', () => {
    render(
      <ModelSelect
        models={[]}
        value="fast"
        onSelect={vi.fn()}
        leadingSection={styleSection}
        status="ready"
        emptyLabel="No models available"
      />
    );
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('keeps the trigger on the resolved model when a refetch fails without a leading section', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        status="error"
        errorLabel="Could not load"
        retryLabel="Retry"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent('Fast One');

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Could not load')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Retry' })).toBeInTheDocument();
  });

  it('disables the trigger when the leading section has no options and models are empty', () => {
    render(
      <ModelSelect
        models={[]}
        value={null}
        onSelect={vi.fn()}
        leadingSection={{ label: 'STYLE', options: [] }}
        status="ready"
        emptyLabel="No models available"
      />
    );
    const trigger = screen.getByRole('button');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent('No models available');
  });

  it('composes the trigger accessible name from the purpose and the current value', () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        aria-label="Assistant style"
      />
    );
    expect(
      screen.getByRole('button', { name: 'Assistant style: Fast One' })
    ).toBeInTheDocument();
  });

  it('leaves the trigger unlabelled when no aria-label purpose is supplied', () => {
    render(
      <ModelSelect models={[...models]} value="a:fast" onSelect={vi.fn()} />
    );
    expect(
      screen.getByRole('button', { name: 'Fast One' })
    ).toBeInTheDocument();
  });

  it('exposes the active model row as the checked one and marks it with a glyph', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        leadingSection={styleSection}
      />
    );
    await userEvent.click(screen.getByRole('button'));

    const active = screen.getByRole('menuitemradio', { name: /Fast One/ });
    const inactive = screen.getByRole('menuitemradio', {
      name: /Balanced One/,
    });
    expect(active).toHaveAttribute('aria-checked', 'true');
    expect(inactive).toHaveAttribute('aria-checked', 'false');
    // The check glyph carries no accessible text, so it can only be asserted structurally.
    expect(active.querySelector('svg')).toBeInTheDocument();
    expect(inactive.querySelector('svg')).toBeNull();
  });

  it('exposes the active leading option as the checked one and marks it with a glyph', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="balanced"
        onSelect={vi.fn()}
        leadingSection={styleSection}
      />
    );
    await userEvent.click(screen.getByRole('button'));

    const active = screen.getByRole('menuitemradio', { name: /Even/ });
    const inactive = screen.getByRole('menuitemradio', { name: /Quick/ });
    expect(active).toHaveAttribute('aria-checked', 'true');
    expect(inactive).toHaveAttribute('aria-checked', 'false');
    expect(active.querySelector('svg')).toBeInTheDocument();
    expect(inactive.querySelector('svg')).toBeNull();
  });

  it('keeps the rows a radio set when nothing is selected yet', async () => {
    render(
      <ModelSelect models={[...models]} value={null} onSelect={vi.fn()} />
    );
    await userEvent.click(screen.getByRole('button'));

    const rows = screen.getAllByRole('menuitemradio');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('renders the rows as plain actions when the caller opts out of selection', async () => {
    const onSelect = vi.fn();
    render(
      <ModelSelect
        models={[...models]}
        value={null}
        onSelect={onSelect}
        rowsAreActions
      />
    );
    await userEvent.click(screen.getByRole('button'));

    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Balanced One/ })
    );
    expect(onSelect).toHaveBeenCalledWith('a:bal');
  });

  it('leaves an action row unmarked even when it matches the value', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        leadingSection={styleSection}
        rowsAreActions
      />
    );
    await userEvent.click(screen.getByRole('button'));

    const row = screen.getByRole('menuitem', { name: /Fast One/ });
    expect(row).not.toHaveAttribute('aria-checked');
    expect(row.querySelector('svg')).toBeNull();
  });

  it('renders zero separators when a leading section meets an empty model list', async () => {
    render(
      <ModelSelect
        models={[]}
        value="fast"
        onSelect={vi.fn()}
        leadingSection={styleSection}
        status="ready"
        emptyLabel="No models available"
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
  });

  it('renders no flattened heading over an empty model list', async () => {
    render(
      <ModelSelect
        models={[]}
        value="fast"
        onSelect={vi.fn()}
        leadingSection={styleSection}
        modelsLabel="MODELS"
        status="ready"
        emptyLabel="No models available"
      />
    );
    await userEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('MODELS')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
  });

  it('renders exactly one separator when a leading section meets non-empty model groups', async () => {
    render(
      <ModelSelect
        models={[models[0]]}
        value="fast"
        onSelect={vi.fn()}
        leadingSection={styleSection}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });
});
