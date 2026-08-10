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
      screen.getByRole('menuitem', { name: /Fast One/ }).children
    ).toHaveLength(2);
    expect(
      screen.getByRole('menuitem', { name: /Balanced One/ }).children
    ).toHaveLength(1);
  });

  it('orders tier groups by the tierOrder prop', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        tierOrder={['balanced', 'fast']}
        tierLabel={(tier) => tier.toUpperCase()}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    const labels = screen
      .getAllByText(/^(BALANCED|FAST)$/)
      .map((el) => el.textContent);
    expect(labels).toEqual(['BALANCED', 'FAST']);
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
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        tierLabel={(tier) => tier.toUpperCase()}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('$')).toBeTruthy();
    expect(screen.getByText('$$')).toBeTruthy();
    expect(screen.queryAllByText('$$$')).toHaveLength(0);
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

  it('renders the footer inside the popover when provided', async () => {
    render(
      <ModelSelect
        models={[...models]}
        value="a:fast"
        onSelect={vi.fn()}
        footer="Account default: Balanced One"
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Account default: Balanced One')).toBeTruthy();
  });

  it('keeps the footer reachable in the error state', async () => {
    render(
      <ModelSelect
        models={[]}
        value={null}
        onSelect={vi.fn()}
        status="error"
        errorLabel="Could not load"
        footer="Clear override"
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Clear override')).toBeTruthy();
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
});
