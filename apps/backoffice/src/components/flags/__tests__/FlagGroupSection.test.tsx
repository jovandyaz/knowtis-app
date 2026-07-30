import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import { FEATURE_FLAG_KEYS, type FeatureFlagDto } from '@knowtis/shared-types';

import { FlagGroupSection } from '../FlagGroupSection';

const { upsertMutate } = vi.hoisted(() => ({ upsertMutate: vi.fn() }));

const upsertState: {
  isPending: boolean;
  variables: { key: string } | undefined;
} = { isPending: false, variables: undefined };

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useUpsertFeatureFlag: () => ({
      mutate: upsertMutate,
      isPending: upsertState.isPending,
      variables: upsertState.variables,
    }),
  };
});

const WEB_SEARCH_FLAG: FeatureFlagDto = {
  key: FEATURE_FLAG_KEYS.AGENT_WEB_SEARCH,
  enabled: true,
  description: 'Tavily-backed web search',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const HYBRID_RETRIEVAL_FLAG: FeatureFlagDto = {
  key: FEATURE_FLAG_KEYS.AGENT_HYBRID_RETRIEVAL,
  enabled: false,
  description: 'Voyage-backed reranking',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const BYOK_FLAG: FeatureFlagDto = {
  key: FEATURE_FLAG_KEYS.AGENT_BYOK,
  enabled: false,
  description: null,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const ADHOC_FLAG: FeatureFlagDto = {
  key: 'some_adhoc_flag',
  enabled: false,
  description: null,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('FlagGroupSection', () => {
  beforeEach(() => {
    upsertMutate.mockReset();
    upsertState.isPending = false;
    upsertState.variables = undefined;
  });

  it('renders the catalog label, key, and requires-env chip', () => {
    render(<FlagGroupSection title="Capabilities" flags={[WEB_SEARCH_FLAG]} />);

    expect(
      screen.getByRole('heading', { name: 'Capabilities' })
    ).toBeInTheDocument();
    expect(screen.getByText('Web search')).toBeInTheDocument();
    expect(screen.getByText(WEB_SEARCH_FLAG.key)).toBeInTheDocument();
    expect(screen.getByText('requires TAVILY_API_KEY')).toBeInTheDocument();
  });

  it('toggles a flag through the upsert mutation', async () => {
    render(<FlagGroupSection title="Capabilities" flags={[WEB_SEARCH_FLAG]} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Web search' }));

    expect(upsertMutate).toHaveBeenCalledWith({
      key: WEB_SEARCH_FLAG.key,
      enabled: false,
      description: 'Tavily-backed web search',
    });
  });

  it('omits description from the payload when the flag has none', async () => {
    render(<FlagGroupSection title="Access" flags={[BYOK_FLAG]} />);

    await userEvent.click(
      screen.getByRole('switch', { name: 'Bring your own key' })
    );

    expect(upsertMutate).toHaveBeenCalledWith({
      key: BYOK_FLAG.key,
      enabled: true,
    });
  });

  it('disables only the row whose write is in flight', () => {
    upsertState.isPending = true;
    upsertState.variables = { key: WEB_SEARCH_FLAG.key };

    render(
      <FlagGroupSection
        title="Capabilities"
        flags={[WEB_SEARCH_FLAG, HYBRID_RETRIEVAL_FLAG]}
      />
    );

    expect(screen.getByRole('switch', { name: 'Web search' })).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Hybrid retrieval' })
    ).toBeEnabled();
  });

  it('prints an uncatalogued key once, as its own label', () => {
    render(
      <FlagGroupSection title="Other" flags={[WEB_SEARCH_FLAG, ADHOC_FLAG]} />
    );

    expect(screen.getAllByText(ADHOC_FLAG.key)).toHaveLength(1);
    expect(
      screen.getByRole('switch', { name: ADHOC_FLAG.key })
    ).toBeInTheDocument();
  });

  it('renders nothing for an empty group', () => {
    const { container } = render(<FlagGroupSection title="Empty" flags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
