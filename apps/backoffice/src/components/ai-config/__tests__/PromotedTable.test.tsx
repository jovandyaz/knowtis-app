import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CatalogModel } from '@knowtis/data-access-admin';
import { FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN } from '@knowtis/shared-types';

import { PromotedTable } from '../PromotedTable';

const MODEL_ID = 'openrouter:vendor/live-one';

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
  maxOutputCostPerToken: number = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN
) {
  return render(
    <PromotedTable
      models={models}
      disabled={false}
      maxOutputCostPerToken={maxOutputCostPerToken}
      onSave={vi.fn()}
      onRetire={vi.fn()}
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

  it('should keep the copy editable next to the metrics', () => {
    renderTable();

    const row = within(rowFor(MODEL_ID));
    expect(row.getByLabelText(`Label for ${MODEL_ID}`)).toHaveValue('Live One');
    expect(row.getByLabelText(`Description for ${MODEL_ID}`)).toHaveValue(
      'Serving users today'
    );
  });
});
