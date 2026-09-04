import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CatalogModel } from '@knowtis/data-access-admin';
import { FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN } from '@knowtis/shared-types';

import { PromotedTable } from '../PromotedTable';
import type { ServingRole } from '../serving-roles';

const MODEL_ID = 'openrouter:vendor/live-one';
const NO_ROLES: ReadonlyMap<string, readonly ServingRole[]> = new Map();

function model(overrides: Partial<CatalogModel> = {}): CatalogModel {
  return {
    id: MODEL_ID,
    label: 'Live One',
    description: 'Serving users today',
    status: 'promoted',
    tier: 'open',
    inputCostPerToken: 0.000003,
    outputCostPerToken: 0.000015,
    maxInputTokens: 1_048_576,
    maxOutputTokens: null,
    intelligenceIndex: 59.7,
    upstreamCreatedAt: null,
    upstreamExpirationDate: null,
    lastSeenAt: new Date('2026-08-11T00:00:00.000Z'),
    promotedAt: new Date('2026-08-12T00:00:00.000Z'),
    ...overrides,
  };
}

function renderTable(
  models: CatalogModel[] = [model()],
  maxOutputCostPerToken: number = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
  options: {
    servingRoles?: ReadonlyMap<string, readonly ServingRole[]>;
    onRetire?: (id: string) => void;
  } = {}
) {
  return render(
    <PromotedTable
      models={models}
      disabled={false}
      maxOutputCostPerToken={maxOutputCostPerToken}
      servingRoles={options.servingRoles ?? NO_ROLES}
      onSave={vi.fn()}
      onRetire={options.onRetire ?? vi.fn()}
    />
  );
}

function rowFor(id: string): HTMLElement {
  const row = screen.getByText(id).closest('tr');
  if (!row) {
    throw new Error(`No promoted row for ${id}`);
  }
  return row;
}

describe('PromotedTable', () => {
  it('should show the same metrics the candidates table ranks by', () => {
    renderTable();

    const row = within(rowFor(MODEL_ID));
    expect(row.getByText('59.7')).toBeInTheDocument();
    expect(row.getByText('$3.00')).toBeInTheDocument();
    expect(row.getByText('$15.00')).toBeInTheDocument();
    expect(row.getByText('1,048,576')).toBeInTheDocument();
  });

  it('should show an unscored promoted model as a dash rather than a zero', () => {
    renderTable([model({ intelligenceIndex: null })]);

    expect(within(rowFor(MODEL_ID)).getByText('—')).toBeInTheDocument();
  });

  it('should show a zero intelligence index as a score, not a dash', () => {
    renderTable([model({ intelligenceIndex: 0 })]);

    expect(within(rowFor(MODEL_ID)).getByText('0')).toBeInTheDocument();
  });

  it('should mark a promoted model the free tier cannot absorb as BYOK only', () => {
    renderTable([
      model({ outputCostPerToken: FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN * 4 }),
    ]);

    expect(
      within(rowFor(MODEL_ID)).getByText(/byok only/i)
    ).toBeInTheDocument();
  });

  // A promoted model can outlive the ceiling that admitted it; the row has to
  // say so rather than keep vouching for the default the bundle shipped with.
  it('should mark a promoted model the operator ceiling now excludes', () => {
    const price = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN;

    renderTable([model({ outputCostPerToken: price })], price / 2);

    expect(
      within(rowFor(MODEL_ID)).getByText(/byok only/i)
    ).toBeInTheDocument();
  });

  it('should name Save and Retire after the label being edited', async () => {
    renderTable();

    await userEvent.type(screen.getByLabelText(`Label for ${MODEL_ID}`), '!');

    expect(
      screen.getByRole('button', { name: 'Save Live One!' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retire Live One!' })
    ).toBeInTheDocument();
  });

  it('should say which config keys a promoted model is serving', () => {
    renderTable([model()], FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN, {
      servingRoles: new Map([[MODEL_ID, ['Default', 'Fallback'] as const]]),
    });

    expect(
      within(rowFor(MODEL_ID)).getByText('Serves Default · Fallback')
    ).toBeInTheDocument();
  });

  it('should keep unreferenced rows free of a serving marker', () => {
    renderTable();

    expect(
      within(rowFor(MODEL_ID)).queryByText(/serves/i)
    ).not.toBeInTheDocument();
  });

  it('should ask before retiring a model the config still points at', async () => {
    const onRetire = vi.fn();
    renderTable([model()], FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN, {
      servingRoles: new Map([[MODEL_ID, ['Default'] as const]]),
      onRetire,
    });

    await userEvent.click(
      screen.getByRole('button', { name: /retire live one/i })
    );

    expect(onRetire).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/default/i)).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole('button', { name: /retire anyway/i })
    );

    expect(onRetire).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // The roles come from a query the catalog does not depend on; while that
  // query is unresolved the guard cannot know the model is safe, so it asks.
  it('should ask before retiring when the serving config is unknown', async () => {
    const onRetire = vi.fn();
    render(
      <PromotedTable
        models={[model()]}
        disabled={false}
        maxOutputCostPerToken={FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN}
        servingRoles={null}
        onSave={vi.fn()}
        onRetire={onRetire}
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: /retire live one/i })
    );

    expect(onRetire).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('dialog')).getByText(/could not be checked/i)
    ).toBeInTheDocument();
  });

  it('should keep Retire anyway under the section-wide lock', async () => {
    const onRetire = vi.fn();
    const roles: ReadonlyMap<string, readonly ServingRole[]> = new Map([
      [MODEL_ID, ['Default'] as const],
    ]);
    const view = (disabled: boolean) => (
      <PromotedTable
        models={[model()]}
        disabled={disabled}
        maxOutputCostPerToken={FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN}
        servingRoles={roles}
        onSave={vi.fn()}
        onRetire={onRetire}
      />
    );
    const { rerender } = render(view(false));

    await userEvent.click(
      screen.getByRole('button', { name: /retire live one/i })
    );
    rerender(view(true));

    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /retire anyway/i,
      })
    ).toBeDisabled();
  });

  it('should drop the retire when the admin cancels the confirmation', async () => {
    const onRetire = vi.fn();
    renderTable([model()], FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN, {
      servingRoles: new Map([[MODEL_ID, ['Fast'] as const]]),
      onRetire,
    });

    await userEvent.click(
      screen.getByRole('button', { name: /retire live one/i })
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /cancel/i,
      })
    );

    expect(onRetire).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // The dialog hands focus back to the row's Retire button, but a successful
  // retire unmounts that row, so the heading has to catch focus instead.
  it('should move focus to the heading once a confirmed retire removes the row', async () => {
    const other = model({
      id: 'openrouter:vendor/live-two',
      label: 'Live Two',
    });
    const roles: ReadonlyMap<string, readonly ServingRole[]> = new Map([
      [MODEL_ID, ['Default'] as const],
    ]);
    const view = (models: CatalogModel[]) => (
      <PromotedTable
        models={models}
        disabled={false}
        maxOutputCostPerToken={FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN}
        servingRoles={roles}
        onSave={vi.fn()}
        onRetire={vi.fn()}
      />
    );
    const { rerender } = render(view([model(), other]));

    await userEvent.click(
      screen.getByRole('button', { name: /retire live one/i })
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /retire anyway/i,
      })
    );
    rerender(view([other]));

    expect(screen.getByRole('heading', { name: 'Promoted (1)' })).toHaveFocus();
  });

  it('should leave focus alone when a row disappears without a confirmed retire', async () => {
    const other = model({
      id: 'openrouter:vendor/live-two',
      label: 'Live Two',
    });
    const roles: ReadonlyMap<string, readonly ServingRole[]> = new Map([
      [MODEL_ID, ['Default'] as const],
    ]);
    const view = (models: CatalogModel[]) => (
      <PromotedTable
        models={models}
        disabled={false}
        maxOutputCostPerToken={FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN}
        servingRoles={roles}
        onSave={vi.fn()}
        onRetire={vi.fn()}
      />
    );
    const { rerender } = render(view([model(), other]));

    await userEvent.click(
      screen.getByRole('button', { name: /retire live one/i })
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /cancel/i,
      })
    );
    rerender(view([other]));

    expect(
      screen.getByRole('heading', { name: 'Promoted (1)' })
    ).not.toHaveFocus();
  });

  it('should retire an unreferenced model without asking', async () => {
    const onRetire = vi.fn();
    renderTable([model()], FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN, { onRetire });

    await userEvent.click(
      screen.getByRole('button', { name: /retire live one/i })
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onRetire).toHaveBeenCalledTimes(1);
  });

  it('should keep the copy editable next to the metrics', () => {
    renderTable();

    const row = within(rowFor(MODEL_ID));
    expect(row.getByLabelText(`Label for ${MODEL_ID}`)).toHaveValue('Live One');
    expect(row.getByLabelText(`Description for ${MODEL_ID}`)).toHaveValue(
      'Serving users today'
    );
  });
});
