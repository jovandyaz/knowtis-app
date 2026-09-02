import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ModelMenu, type ModelMenuProps } from './ModelMenu';

const PRIMARY = [
  { id: 'fast', label: 'Haiku 4.5', description: 'Respuestas instantáneas' },
  {
    id: 'balanced',
    label: 'Sonnet 5',
    description: 'Balance entre calidad y velocidad',
  },
  { id: 'powerful', label: 'Opus 5', description: 'Razonamiento profundo' },
];

const EFFORT_OPTIONS = [
  { id: 'auto', label: 'Auto', description: 'El modelo decide' },
  { id: 'low', label: 'Bajo' },
  { id: 'high', label: 'Alto', description: 'Razonamiento extendido' },
];

// A single user.click batches press+release inside one act(), and jsdom never
// flushes the submenu re-render in between, so Radix's select handler misses
// the click. Splitting the pointer acts restores the selection for sub items.
async function clickSubmenuItem(
  user: ReturnType<typeof userEvent.setup>,
  element: Element
) {
  await user.pointer({ target: element, keys: '[MouseLeft>]' });
  await user.pointer({ target: element, keys: '[/MouseLeft]' });
}

function baseProps(overrides: Partial<ModelMenuProps> = {}): ModelMenuProps {
  return {
    primary: PRIMARY,
    value: 'balanced',
    onSelect: vi.fn(),
    triggerLabel: 'Sonnet 5',
    ...overrides,
  };
}

describe('ModelMenu', () => {
  it('renders primary rows with model name and description and marks selection', async () => {
    const user = userEvent.setup();
    render(<ModelMenu {...baseProps()} />);
    await user.click(screen.getByRole('button'));

    expect(
      screen.getByText('Balance entre calidad y velocidad')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', { name: /Sonnet 5/ })
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('menuitemradio', { name: /Haiku 4\.5/ })
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('selecting a primary row reports its id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ModelMenu {...baseProps({ onSelect })} />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('menuitemradio', { name: /Haiku 4\.5/ }));

    expect(onSelect).toHaveBeenCalledWith('fast');
  });

  it('locked rows stay actionable and route to the footer CTA', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCta = vi.fn();
    render(
      <ModelMenu
        {...baseProps({
          primary: PRIMARY.map((row) => ({ ...row, locked: true })),
          value: null,
          onSelect,
          footerCta: { label: 'Crear cuenta gratis', onClick: onCta },
          lockedHint: 'requiere cuenta',
        })}
      />
    );
    await user.click(screen.getByRole('button'));

    const locked = screen.getByRole('menuitem', {
      name: 'Sonnet 5, requiere cuenta',
    });
    expect(locked).not.toHaveAttribute('aria-disabled');
    expect(
      screen.queryByRole('menuitemradio', { name: /Sonnet 5/ })
    ).not.toBeInTheDocument();
    // The lock glyph replaces the check slot; it is decorative, so structural.
    expect(locked.querySelector('svg')).toBeInTheDocument();

    await user.click(locked);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('effort submenu lists only provided options and reports changes', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onChange = vi.fn();
    render(
      <ModelMenu
        {...baseProps({
          onSelect,
          effort: {
            label: 'Esfuerzo',
            value: 'auto',
            options: EFFORT_OPTIONS,
            onChange,
          },
        })}
      />
    );
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('menuitem', { name: /Esfuerzo/ }));

    // Both menus stay mounted, so the count spans the 3 primary rows too; an
    // invented effort option would push it past 6.
    expect(await screen.findAllByRole('menuitemradio')).toHaveLength(6);
    expect(
      screen.getByRole('menuitemradio', { name: /^Auto/ })
    ).toHaveAttribute('aria-checked', 'true');

    await clickSubmenuItem(
      user,
      screen.getByRole('menuitemradio', { name: /^Alto/ })
    );
    expect(onChange).toHaveBeenCalledWith('high');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders a locked effort row as inert, with no submenu', async () => {
    const user = userEvent.setup();
    render(
      <ModelMenu
        {...baseProps({
          effort: {
            label: 'Esfuerzo',
            value: 'auto',
            options: EFFORT_OPTIONS,
            locked: true,
            onChange: vi.fn(),
          },
        })}
      />
    );
    await user.click(screen.getByRole('button'));

    const row = screen.getByRole('menuitem', { name: /Esfuerzo/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).not.toHaveAttribute('aria-haspopup');
    expect(row.querySelector('svg')).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitemradio', { name: /^Auto/ })
    ).not.toBeInTheDocument();
  });

  it('more-models submenu renders group headings, cost, billed pill and reports selection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ModelMenu
        {...baseProps({
          value: 'gpt-6',
          onSelect,
          moreModels: {
            label: 'Más modelos',
            groups: [
              {
                label: 'Anthropic',
                options: [
                  {
                    id: 'claude-x',
                    label: 'Claude X',
                    description: 'Frontera',
                    cost: '$$$',
                  },
                ],
              },
              {
                label: 'OpenAI',
                options: [
                  {
                    id: 'gpt-6',
                    label: 'GPT-6',
                    cost: '$$',
                    billedBadge: 'Tu clave',
                  },
                ],
              },
            ],
          },
        })}
      />
    );
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('menuitem', { name: /Más modelos/ }));

    expect(await screen.findByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('$$$')).toBeInTheDocument();

    const billed = screen.getByRole('menuitemradio', { name: /GPT-6/ });
    expect(billed).toHaveTextContent('Tu clave');
    expect(billed).toHaveAttribute('aria-checked', 'true');

    await clickSubmenuItem(
      user,
      screen.getByRole('menuitemradio', { name: /Claude X/ })
    );
    expect(onSelect).toHaveBeenCalledWith('claude-x');
  });

  it('renders the footer CTA as the only accent row and triggers its action', async () => {
    const user = userEvent.setup();
    const onCta = vi.fn();
    render(
      <ModelMenu
        {...baseProps({
          footerCta: { label: 'Crear cuenta gratis', onClick: onCta },
        })}
      />
    );
    await user.click(screen.getByRole('button'));

    expect(screen.getAllByRole('separator')).toHaveLength(1);
    const cta = screen.getByRole('menuitem', { name: 'Crear cuenta gratis' });
    expect(cta).toHaveClass('text-(--primary)');

    await user.click(cta);
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('renders trigger detail as a muted tail', () => {
    render(
      <ModelMenu
        {...baseProps({ triggerDetail: 'Alto', 'aria-label': 'Modelo' })}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Modelo: Sonnet 5, Alto' })
    ).toBeInTheDocument();
    expect(screen.getByText('· Alto')).toHaveClass('text-(--muted-foreground)');
  });

  it('omits effort and more-models sections when props are absent', async () => {
    const user = userEvent.setup();
    render(<ModelMenu {...baseProps()} />);
    await user.click(screen.getByRole('button'));

    // Submenu triggers and the CTA are the only plain menuitems this menu can
    // hold, so an empty set proves both sections (and the footer) are gone.
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
  });

  it('disables the trigger and shows the loading label while loading', () => {
    render(
      <ModelMenu
        {...baseProps({ status: 'loading', loadingLabel: 'Cargando…' })}
      />
    );
    const trigger = screen.getByRole('button');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent('Cargando…');
  });

  it('surfaces an error message and retries on demand', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ModelMenu
        {...baseProps({
          status: 'error',
          errorLabel: 'No se pudieron cargar los modelos',
          retryLabel: 'Reintentar',
          onRetry,
        })}
      />
    );
    await user.click(screen.getByRole('button'));

    expect(
      screen.getByText('No se pudieron cargar los modelos')
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);

    await user.click(screen.getByRole('menuitem', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
